// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/// @title VeLTN — vote-escrow lock for boosted staking rewards and governance weight
/// @dev Non-transferable. Each address holds at most one lock at a time.
///      Multipliers apply to FeeDistributor virtual balance accounting.
///      Patent pending RAW-2026-PROV-001.
contract VeLTN is Ownable {
    IERC20 public immutable ltn;

    // ── Tier configuration ────────────────────────────────────────────────────
    uint8 public constant MAX_TIER = 4;

    // Multipliers in basis-100 (100 = 1×, 250 = 2.5×)
    uint256[5] public MULTIPLIERS = [100, 125, 150, 175, 250];

    // Lock durations per tier
    uint256[5] public DURATIONS = [0, 90 days, 180 days, 365 days, 4 * 365 days];

    // ── Lock state ────────────────────────────────────────────────────────────
    struct Lock {
        uint256 amount; // LTN locked
        uint256 end; // expiry timestamp
        uint8 tier; // 1–4; 0 = no lock
    }

    mapping(address => Lock) public locks;

    uint256 public totalLocked;

    // ── Events ────────────────────────────────────────────────────────────────
    event Locked(address indexed user, uint256 amount, uint8 tier, uint256 end);
    event Extended(address indexed user, uint8 newTier, uint256 newEnd);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(address _ltn, address _owner) Ownable(_owner) {
        ltn = IERC20(_ltn);
    }

    // ── Lock / extend / withdraw ──────────────────────────────────────────────

    /// @notice Lock `amount` LTN for the chosen tier duration.
    ///         Must have no active lock (or call extend() to upgrade existing one).
    function lock(uint256 amount, uint8 tier) external {
        require(tier >= 1 && tier <= MAX_TIER, 'invalid tier');
        require(amount > 0, 'amount zero');
        Lock storage l = locks[msg.sender];
        require(l.amount == 0 || block.timestamp >= l.end, 'existing lock active');

        // If an expired lock exists, recycle its amount into the new lock.
        uint256 prev = l.amount;
        if (prev > 0) {
            // Expired lock — reset first, then incorporate.
            totalLocked -= prev;
        }

        uint256 end = block.timestamp + DURATIONS[tier];
        ltn.transferFrom(msg.sender, address(this), amount);
        locks[msg.sender] = Lock({ amount: amount + prev, end: end, tier: tier });
        totalLocked += amount + prev;

        emit Locked(msg.sender, amount + prev, tier, end);
    }

    /// @notice Extend or upgrade an existing active lock to a higher tier.
    ///         New duration is measured from now, so the lock extends forward.
    function extend(uint8 newTier) external {
        require(newTier >= 1 && newTier <= MAX_TIER, 'invalid tier');
        Lock storage l = locks[msg.sender];
        require(l.amount > 0, 'no lock');
        require(block.timestamp < l.end, 'lock expired; use lock()');
        require(newTier > l.tier, 'can only upgrade tier');

        uint256 newEnd = block.timestamp + DURATIONS[newTier];
        l.tier = newTier;
        l.end = newEnd;

        emit Extended(msg.sender, newTier, newEnd);
    }

    /// @notice Withdraw locked LTN after the lock expires.
    function withdraw() external {
        Lock storage l = locks[msg.sender];
        require(l.amount > 0, 'nothing to withdraw');
        require(block.timestamp >= l.end, 'lock not expired');

        uint256 amount = l.amount;
        totalLocked -= amount;
        delete locks[msg.sender];

        ltn.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice Reward multiplier for `user` in basis-100 (100 = 1×, 250 = 2.5×).
    ///         Returns 100 if no active lock.
    function multiplierOf(address user) external view returns (uint256) {
        Lock storage l = locks[user];
        if (l.amount == 0 || block.timestamp >= l.end) return 100;
        return MULTIPLIERS[l.tier];
    }

    /// @notice Governance voting power (lock amount × tier multiplier / 100).
    function votingPower(address user) external view returns (uint256) {
        Lock storage l = locks[user];
        if (l.amount == 0 || block.timestamp >= l.end) return 0;
        return (l.amount * MULTIPLIERS[l.tier]) / 100;
    }
}
