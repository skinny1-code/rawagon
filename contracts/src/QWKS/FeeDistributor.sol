// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import './IYieldStrategy.sol';

/// @dev Minimal interface for veLTN and ParticipationRegistry multiplier reads.
interface IMultiplierSource {
    function multiplierOf(address user) external view returns (uint256);
}

/// @title FeeDistributor — epoch-adaptive fee distribution with virtual balance multipliers
/// @dev Reward-per-token (RPT) accounting over virtual balances:
///        virtualStaked[user] = staked[user] × combinedMultiplier / 100
///        totalVirtualStaked  = Σ virtualStaked (used in RPT denominator)
///      When no multiplier contracts are set, virtualStaked == staked, preserving full
///      backward compatibility with all existing tests.
///      Also supports: dynamic fee split, auto-compound, pluggable DeFi yield strategy.
///      Patent pending RAW-2026-PROV-001.
contract FeeDistributor is Ownable, ReentrancyGuard {
    IERC20 public immutable ltn;

    // ── Staking state ─────────────────────────────────────────────────────────
    mapping(address => uint256) public staked;
    mapping(address => uint256) public virtualStaked; // staked × multiplier / 100
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pending;
    mapping(address => bool) public approved;
    mapping(address => bool) public autoCompound;

    uint256 public totalStaked; // actual LTN locked (used for strategy rebalancing)
    uint256 public totalVirtualStaked; // virtual sum (used for RPT denominator)
    uint256 public rpt; // cumulative reward per virtual token, scaled by 1e18

    // ── Multiplier sources ────────────────────────────────────────────────────
    IMultiplierSource public veLTN; // vote-escrow boost (optional)
    IMultiplierSource public participationRegistry; // activity boost (optional)
    uint256 public constant MAX_MULTIPLIER = 500; // cap at 5× (basis 100)

    // ── Dynamic fee split ─────────────────────────────────────────────────────
    uint16 public feeBps = 10; // [5, 20] bps of reported volume
    uint8 public stakersSharePct = 80; // [50, 95] % of fee to stakers; rest → treasury
    address public treasury;

    // ── Epoch state ───────────────────────────────────────────────────────────
    uint256 public epochDuration = 7 days;
    uint256 public epochStart;
    uint256 public lastSettledEpoch;
    uint256 public epochVolume;

    // ── Yield strategy ────────────────────────────────────────────────────────
    IYieldStrategy public yieldStrategy;
    uint256 public deployedToStrategy;
    uint256 public constant IDLE_BUFFER_PCT = 20;

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
    event MultiplierRefreshed(address indexed user, uint256 newMultiplier, uint256 newVirtual);
    event EpochSettled(uint256 indexed epoch);
    event FeeShareRebalanced(uint8 stakersSharePct);
    event AutoCompoundSet(address indexed user, bool enabled);
    event TreasurySet(address treasury);
    event FeeBpsSet(uint16 bps);
    event FeeShareSet(uint8 pct);
    event YieldStrategySet(address strategy);
    event VeLTNSet(address veLTN);
    event ParticipationRegistrySet(address registry);

    constructor(address _ltn, address _owner) Ownable(_owner) {
        ltn = IERC20(_ltn);
        epochStart = block.timestamp;
    }

    // ── Reporter approval ─────────────────────────────────────────────────────

    function approve(address reporter) external onlyOwner {
        approved[reporter] = true;
    }

    // ── Fee inflow ────────────────────────────────────────────────────────────

    function inflow(uint256 vol) external {
        require(approved[msg.sender], 'not approved');
        uint256 fee = (vol * feeBps) / 10000;
        epochVolume += vol;
        if (totalVirtualStaked > 0 && fee > 0) {
            ltn.transferFrom(msg.sender, address(this), fee);
            uint256 toStakers = (fee * stakersSharePct) / 100;
            uint256 toTreasury = fee - toStakers;
            rpt += (toStakers * 1e18) / totalVirtualStaked;
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
        _syncVirtual(msg.sender);
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        _update(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        _syncVirtual(msg.sender);
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
            _syncVirtual(msg.sender);
            emit Staked(msg.sender, reward);
        } else {
            ltn.transfer(msg.sender, reward);
            emit Claimed(msg.sender, reward);
        }
    }

    // ── Multiplier refresh ────────────────────────────────────────────────────

    /// @notice Recalculate `user`'s virtual balance based on current veLTN + participation.
    ///         Anyone can call — useful after a user locks veLTN or earns participation score.
    function refreshMultiplier(address user) external {
        _update(user);
        _syncVirtual(user);
    }

    // ── User settings ─────────────────────────────────────────────────────────

    function setAutoCompound(bool enabled) external {
        autoCompound[msg.sender] = enabled;
        emit AutoCompoundSet(msg.sender, enabled);
    }

    // ── Epoch settlement ──────────────────────────────────────────────────────

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

    function setVeLTN(address _veLTN) external onlyOwner {
        veLTN = IMultiplierSource(_veLTN);
        emit VeLTNSet(_veLTN);
    }

    function setParticipationRegistry(address _registry) external onlyOwner {
        participationRegistry = IMultiplierSource(_registry);
        emit ParticipationRegistrySet(_registry);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// @dev Settle pending rewards at current virtualStaked before any balance change.
    function _update(address user) internal {
        pending[user] += (virtualStaked[user] * (rpt - rewardDebt[user])) / 1e18;
        rewardDebt[user] = rpt;
    }

    /// @dev Recompute virtualStaked[user] from current staked + multipliers.
    ///      Must be called AFTER _update() and AFTER staked[user] changes.
    function _syncVirtual(address user) internal {
        uint256 mul = _combinedMultiplier(user);
        uint256 newVirtual = (staked[user] * mul) / 100;
        totalVirtualStaked = totalVirtualStaked - virtualStaked[user] + newVirtual;
        virtualStaked[user] = newVirtual;
        emit MultiplierRefreshed(user, mul, newVirtual);
    }

    /// @dev Combined multiplier = veMultiplier × participationMultiplier / 100, capped at MAX.
    function _combinedMultiplier(address user) internal view returns (uint256 mul) {
        mul = 100;
        if (address(veLTN) != address(0)) {
            mul = (mul * veLTN.multiplierOf(user)) / 100;
        }
        if (address(participationRegistry) != address(0)) {
            mul = (mul * participationRegistry.multiplierOf(user)) / 100;
        }
        if (mul > MAX_MULTIPLIER) mul = MAX_MULTIPLIER;
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

    /// @dev Harvest yield and rebalance strategy deposits.
    function _harvestAndRebalanceStrategy() internal {
        if (address(yieldStrategy) == address(0)) return;

        uint256 yield = yieldStrategy.harvest();
        if (yield > 0 && totalVirtualStaked > 0) {
            rpt += (yield * 1e18) / totalVirtualStaked;
            deployedToStrategy = yield < deployedToStrategy ? deployedToStrategy - yield : 0;
        }

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
