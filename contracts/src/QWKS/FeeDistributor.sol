// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/// @title FeeDistributor — 0.1% network volume to LTN stakers
/// @dev Reward-per-token (RPT) accounting. Approved reporters call inflow() to
///      report volume AND deposit the corresponding LTN fee tokens in one step.
///      Patent pending RAW-2026-PROV-001.
contract FeeDistributor is Ownable {
    IERC20 public immutable ltn;

    mapping(address => uint256) public staked;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pending;
    mapping(address => bool) public approved;

    uint256 public totalStaked;
    uint256 public rpt; // cumulative reward per staked token, scaled by 1e18

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event Inflow(address indexed reporter, uint256 vol, uint256 fee);

    constructor(address _ltn, address _owner) Ownable(_owner) {
        ltn = IERC20(_ltn);
    }

    /// @notice Report network volume and deposit the corresponding 0.1% fee in LTN.
    ///         Caller must have approved this contract to transfer `fee` LTN before calling.
    ///         fee = vol * 10 / 10000 (10 bps). Noop if no stakers or fee is zero.
    function inflow(uint256 vol) external {
        require(approved[msg.sender], 'not approved');
        uint256 fee = (vol * 10) / 10000;
        if (totalStaked > 0 && fee > 0) {
            ltn.transferFrom(msg.sender, address(this), fee);
            rpt += (fee * 1e18) / totalStaked;
        }
        emit Inflow(msg.sender, vol, fee);
    }

    /// @notice Stake LTN to earn a share of future fee inflows.
    function stake(uint256 amount) external {
        _update(msg.sender);
        ltn.transferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstake LTN. Accrued rewards remain claimable.
    function unstake(uint256 amount) external {
        _update(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        ltn.transfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Claim all accrued LTN rewards.
    function claim() external {
        _update(msg.sender);
        uint256 reward = pending[msg.sender];
        if (reward > 0) {
            pending[msg.sender] = 0;
            ltn.transfer(msg.sender, reward);
            emit Claimed(msg.sender, reward);
        }
    }

    /// @notice Approve an address to call inflow().
    function approve(address reporter) external onlyOwner {
        approved[reporter] = true;
    }

    /// @dev Settle pending rewards up to the current RPT before any balance change.
    function _update(address user) internal {
        pending[user] += (staked[user] * (rpt - rewardDebt[user])) / 1e18;
        rewardDebt[user] = rpt;
    }
}
