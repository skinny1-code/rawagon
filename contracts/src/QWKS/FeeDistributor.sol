// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './IYieldStrategy.sol';

/// @title FeeDistributor — epoch-adaptive fee distribution to LTN stakers
/// @dev Reward-per-token (RPT) accounting with dynamic fee split, auto-compound staking,
///      and a pluggable DeFi yield strategy for idle staked LTN.
///      Patent pending RAW-2026-PROV-001.
contract FeeDistributor is Ownable, ReentrancyGuard {
    IERC20 public immutable ltn;

    // ── Staking state ─────────────────────────────────────────────────────────
    mapping(address => uint256) public staked;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pending;
    mapping(address => bool) public approved;
    mapping(address => bool) public autoCompound;

    uint256 public totalStaked;
    uint256 public rpt; // cumulative reward per staked token, scaled by 1e18

    // ── Dynamic fee split ─────────────────────────────────────────────────────
    uint16 public feeBps = 10; // [5, 20] — fee as basis points of reported volume
    uint8 public stakersSharePct = 80; // [50, 95] — % of fee to stakers; rest → treasury
    address public treasury;

    // ── Epoch state ───────────────────────────────────────────────────────────
    uint256 public epochDuration = 7 days;
    uint256 public epochStart; // set in constructor
    uint256 public lastSettledEpoch;
    uint256 public epochVolume; // accumulated volume this epoch

    // ── Yield strategy ────────────────────────────────────────────────────────
    IYieldStrategy public yieldStrategy;
    uint256 public deployedToStrategy;
    uint256 public constant IDLE_BUFFER_PCT = 20; // keep at least 20% of totalStaked liquid

    // ── Events ────────────────────────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event Inflow(
        address indexed reporter,
        uint256 vol,
        uint256 fee,
        uint256 toStakers,
        uint256 toTreasury
    );
    event EpochSettled(uint256 indexed epoch);
    event FeeShareRebalanced(uint8 stakersSharePct);
    event AutoCompoundSet(address indexed user, bool enabled);
    event TreasurySet(address treasury);
    event FeeBpsSet(uint16 bps);
    event FeeShareSet(uint8 pct);
    event YieldStrategySet(address strategy);

    constructor(address _ltn, address _owner) Ownable(_owner) {
        ltn = IERC20(_ltn);
        epochStart = block.timestamp;
    }

    // ── Reporter approval ─────────────────────────────────────────────────────

    function approve(address reporter) external onlyOwner {
        approved[reporter] = true;
    }

    // ── Fee inflow ────────────────────────────────────────────────────────────

    /// @notice Report network volume and deposit the corresponding fee in LTN.
    ///         fee = vol * feeBps / 10000. Split between stakers and treasury.
    function inflow(uint256 vol) external {
        require(approved[msg.sender], 'not approved');
        uint256 fee = (vol * feeBps) / 10000;
        epochVolume += vol;
        if (totalStaked > 0 && fee > 0) {
            ltn.transferFrom(msg.sender, address(this), fee);
            uint256 toStakers = (fee * stakersSharePct) / 100;
            uint256 toTreasury = fee - toStakers;
            rpt += (toStakers * 1e18) / totalStaked;
            if (toTreasury > 0 && treasury != address(0)) {
                ltn.transfer(treasury, toTreasury);
            }
            emit Inflow(msg.sender, vol, fee, toStakers, toTreasury);
        } else {
            emit Inflow(msg.sender, vol, fee, 0, 0);
        }
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    function stake(uint256 amount) external {
        _update(msg.sender);
        ltn.transferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        _update(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        // If contract balance is insufficient, pull from yield strategy first.
        if (ltn.balanceOf(address(this)) < amount && address(yieldStrategy) != address(0)) {
            uint256 shortage = amount - ltn.balanceOf(address(this));
            uint256 actual = yieldStrategy.withdraw(shortage);
            deployedToStrategy -= actual < deployedToStrategy ? actual : deployedToStrategy;
        }
        ltn.transfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() external {
        _update(msg.sender);
        uint256 reward = pending[msg.sender];
        if (reward == 0) return;
        pending[msg.sender] = 0;
        if (autoCompound[msg.sender]) {
            staked[msg.sender] += reward;
            totalStaked += reward;
            rewardDebt[msg.sender] = rpt; // sync debt for the newly staked tokens
            emit Staked(msg.sender, reward);
        } else {
            ltn.transfer(msg.sender, reward);
            emit Claimed(msg.sender, reward);
        }
    }

    // ── User settings ─────────────────────────────────────────────────────────

    function setAutoCompound(bool enabled) external {
        autoCompound[msg.sender] = enabled;
        emit AutoCompoundSet(msg.sender, enabled);
    }

    // ── Epoch settlement ──────────────────────────────────────────────────────

    /// @notice Settle the current epoch: rebalance fee share and harvest/rebalance yield.
    ///         Anyone can call this; reverts if the epoch has not elapsed.
    function settleEpoch() external {
        uint256 epoch = (block.timestamp - epochStart) / epochDuration;
        require(epoch > lastSettledEpoch, 'epoch not finished');
        _rebalanceFeeShare();
        _harvestAndRebalanceStrategy();
        lastSettledEpoch = epoch;
        epochVolume = 0;
        emit EpochSettled(epoch);
    }

    // ── Owner configuration ───────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        require(bps >= 5 && bps <= 20, 'feeBps out of bounds');
        feeBps = bps;
        emit FeeBpsSet(bps);
    }

    function setStakersSharePct(uint8 pct) external onlyOwner {
        require(pct >= 50 && pct <= 95, 'share out of bounds');
        stakersSharePct = pct;
        emit FeeShareSet(pct);
    }

    function setEpochDuration(uint256 d) external onlyOwner {
        require(d > 0, 'duration zero');
        epochDuration = d;
    }

    function setYieldStrategy(address strategy) external onlyOwner {
        yieldStrategy = IYieldStrategy(strategy);
        emit YieldStrategySet(strategy);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// @dev Settle pending rewards up to the current RPT before any balance change.
    function _update(address user) internal {
        pending[user] += (staked[user] * (rpt - rewardDebt[user])) / 1e18;
        rewardDebt[user] = rpt;
    }

    /// @dev Auto-adjust stakersSharePct based on staking utilization.
    function _rebalanceFeeShare() internal {
        uint256 supply = ltn.totalSupply();
        if (supply == 0) return;
        uint256 util = (totalStaked * 100) / supply;
        uint8 share = stakersSharePct;
        if (util < 20 && share < 95) {
            share = share + 5 > 95 ? 95 : share + 5;
        } else if (util > 60 && share > 50) {
            share = share - 2 < 50 ? 50 : share - 2;
        }
        if (share != stakersSharePct) {
            stakersSharePct = share;
            emit FeeShareRebalanced(share);
        }
    }

    /// @dev Harvest yield from strategy and rebalance deposits (target: 80% of totalStaked).
    function _harvestAndRebalanceStrategy() internal {
        if (address(yieldStrategy) == address(0)) return;

        // Harvest accumulated yield and distribute to stakers.
        uint256 yield = yieldStrategy.harvest();
        if (yield > 0 && totalStaked > 0) {
            rpt += (yield * 1e18) / totalStaked;
            deployedToStrategy = yield < deployedToStrategy ? deployedToStrategy - yield : 0;
        }

        // Rebalance: target 80% of totalStaked deployed to strategy.
        uint256 target = (totalStaked * (100 - IDLE_BUFFER_PCT)) / 100;
        uint256 current = deployedToStrategy;

        if (target > current) {
            uint256 toDeposit = target - current;
            uint256 avail = ltn.balanceOf(address(this));
            if (toDeposit > avail) toDeposit = avail;
            if (toDeposit > 0) {
                ltn.transfer(address(yieldStrategy), toDeposit);
                yieldStrategy.deposit(toDeposit);
                deployedToStrategy += toDeposit;
            }
        } else if (current > target) {
            uint256 toWithdraw = current - target;
            uint256 actual = yieldStrategy.withdraw(toWithdraw);
            deployedToStrategy -= actual < deployedToStrategy ? actual : deployedToStrategy;
        }
    }
}
