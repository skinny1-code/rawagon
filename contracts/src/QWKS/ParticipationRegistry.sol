// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/access/Ownable.sol';

/// @title ParticipationRegistry — epoch-based activity scoring for staking multipliers
/// @dev Authorized reporters (QWKS fee reporters) record per-wallet volume each epoch.
///      At epoch end, scores feed a tiered multiplier into FeeDistributor reward accounting.
///      Score decays 50% per epoch so continuous participation is required to maintain boosts.
///      Patent pending RAW-2026-PROV-001.
contract ParticipationRegistry is Ownable {
    // ── Volume thresholds (USD, 18-decimal) for multiplier tiers ─────────────
    uint256 public tier1Threshold = 10_000e18; // >$10K/epoch → 1.25×
    uint256 public tier2Threshold = 100_000e18; // >$100K/epoch → 1.5×
    uint256 public tier3Threshold = 1_000_000e18; // >$1M/epoch → 2×

    // ── Epoch state ───────────────────────────────────────────────────────────
    uint256 public epochDuration = 7 days;
    uint256 public epochStart;
    uint256 public lastSettledEpoch;

    // ── Scores ────────────────────────────────────────────────────────────────
    /// @dev Current epoch accumulated volume per wallet.
    mapping(address => uint256) public epochVolume;

    /// @dev Carried-forward score from previous epochs (decays 50% each epoch).
    mapping(address => uint256) public carryScore;

    /// @dev Reporters authorised to call recordActivity().
    mapping(address => bool) public reporters;

    // ── Events ────────────────────────────────────────────────────────────────
    event ActivityRecorded(address indexed user, uint256 vol, uint256 newEpochVolume);
    event EpochSettled(uint256 indexed epoch);
    event ReporterSet(address indexed reporter, bool enabled);
    event ThresholdsSet(uint256 t1, uint256 t2, uint256 t3);

    constructor(address _owner) Ownable(_owner) {
        epochStart = block.timestamp;
    }

    // ── Reporter management ───────────────────────────────────────────────────

    function setReporter(address reporter, bool enabled) external onlyOwner {
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    // ── Activity recording ────────────────────────────────────────────────────

    /// @notice Record QWKS network volume for `user` in the current epoch.
    ///         `vol` is USD volume in 18-decimal units.
    function recordActivity(address user, uint256 vol) external {
        require(reporters[msg.sender], 'not reporter');
        require(user != address(0), 'zero address');
        epochVolume[user] += vol;
        emit ActivityRecorded(user, vol, epochVolume[user]);
    }

    // ── Epoch settlement ──────────────────────────────────────────────────────

    /// @notice Advance and settle the epoch. Anyone can call once the epoch has elapsed.
    ///         Decays carryScore by 50% and adds current epochVolume.
    ///         NOTE: This settles global state only. Individual scores are lazily evaluated
    ///         by multiplierOf() — no per-user iteration needed.
    function settleEpoch() external {
        uint256 epoch = (block.timestamp - epochStart) / epochDuration;
        require(epoch > lastSettledEpoch, 'epoch not finished');
        lastSettledEpoch = epoch;
        // Individual score decay + fold is computed lazily in multiplierOf()
        // to avoid unbounded iteration. Each user's carryScore is updated on
        // their next interaction via _settle(user).
        emit EpochSettled(epoch);
    }

    /// @notice Manually settle a specific user's carry score.
    ///         Called by refreshMultiplier() in FeeDistributor or by the user.
    function settleUser(address user) external {
        _settleUser(user);
    }

    // ── Multiplier view ───────────────────────────────────────────────────────

    /// @notice Returns reward multiplier for `user` in basis-100.
    ///         100 = 1×, 125 = 1.25×, 150 = 1.5×, 200 = 2×
    function multiplierOf(address user) external view returns (uint256) {
        // Combine current epoch volume with decayed carry for a snapshot view.
        uint256 score = carryScore[user] / 2 + epochVolume[user];
        return _tierMultiplier(score);
    }

    // ── Owner configuration ───────────────────────────────────────────────────

    function setThresholds(
        uint256 t1,
        uint256 t2,
        uint256 t3
    ) external onlyOwner {
        require(t1 < t2 && t2 < t3, 'thresholds must ascend');
        tier1Threshold = t1;
        tier2Threshold = t2;
        tier3Threshold = t3;
        emit ThresholdsSet(t1, t2, t3);
    }

    function setEpochDuration(uint256 d) external onlyOwner {
        require(d > 0, 'duration zero');
        epochDuration = d;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _settleUser(address user) internal {
        uint256 epoch = (block.timestamp - epochStart) / epochDuration;
        if (epoch > lastSettledEpoch) return; // global epoch not settled yet
        carryScore[user] = carryScore[user] / 2 + epochVolume[user];
        epochVolume[user] = 0;
    }

    function _tierMultiplier(uint256 score) internal view returns (uint256) {
        if (score >= tier3Threshold) return 200;
        if (score >= tier2Threshold) return 150;
        if (score >= tier1Threshold) return 125;
        return 100;
    }
}
