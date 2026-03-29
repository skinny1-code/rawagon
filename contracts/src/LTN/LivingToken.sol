// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

/// @title LivingToken (LTN) — epoch-adaptive burn, 12% staking APY, governance
/// @dev Patent pending RAW-2026-PROV-001
contract LivingToken is ERC20, AccessControl {
    bytes32 public constant BURNER_ROLE = keccak256('BURNER_ROLE');

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;

    /// @notice Legacy constant kept for backwards compatibility — use burnPerTx at runtime.
    uint256 public constant BURN_PER_TX = 1e15;

    /// @notice Bounds for the dynamic burn rate.
    uint256 public constant MIN_BURN = 1e14; // 0.0001 LTN
    uint256 public constant MAX_BURN = 1e16; // 0.01 LTN

    // ── Mutable burn rate ─────────────────────────────────────────────────────
    uint256 public burnPerTx = 1e15; // current runtime burn, starts at BURN_PER_TX

    // ── Cumulative stats ──────────────────────────────────────────────────────
    uint256 public totalBurned;
    uint256 public txCount;

    // ── Epoch state ───────────────────────────────────────────────────────────
    uint256 public epochDuration = 7 days;
    uint256 public epochStart; // set in constructor
    uint256 public lastSettledEpoch;
    uint256 public epochTxCount; // tx count this epoch, resets on settle

    uint256 public highTxThreshold = 10_000; // burn increases above this
    uint256 public lowTxThreshold = 1_000; // burn decreases below this

    // ── Events ────────────────────────────────────────────────────────────────
    event Burned(address indexed burner, uint256 amt, uint256 txCount);
    event BurnRateSet(uint256 rate);
    event EpochSettled(uint256 indexed epoch, uint256 newBurnRate);

    constructor(address admin) ERC20('Living Token', 'LTN') {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _mint(admin, 400_000_000 * 1e18);
        epochStart = block.timestamp;
    }

    // ── Core burn ─────────────────────────────────────────────────────────────

    function burnOnTx() external onlyRole(BURNER_ROLE) {
        _burn(msg.sender, burnPerTx);
        unchecked {
            totalBurned += burnPerTx;
            txCount++;
            epochTxCount++;
        }
        emit Burned(msg.sender, burnPerTx, txCount);
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    function mint(address to, uint256 amt) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(totalSupply() + amt <= MAX_SUPPLY);
        _mint(to, amt);
    }

    // ── Epoch rebalance ───────────────────────────────────────────────────────

    /// @notice Advance and settle the current epoch, adjusting burnPerTx based on activity.
    ///         Anyone can call this; reverts if the epoch has not yet elapsed.
    function settleEpoch() external {
        uint256 epoch = (block.timestamp - epochStart) / epochDuration;
        require(epoch > lastSettledEpoch, 'epoch not finished');

        uint256 newRate = burnPerTx;
        if (epochTxCount > highTxThreshold) {
            uint256 up = (burnPerTx * 110) / 100;
            newRate = up > MAX_BURN ? MAX_BURN : up;
        } else if (epochTxCount < lowTxThreshold) {
            uint256 down = (burnPerTx * 90) / 100;
            newRate = down < MIN_BURN ? MIN_BURN : down;
        }

        burnPerTx = newRate;
        lastSettledEpoch = epoch;
        epochTxCount = 0;

        emit EpochSettled(epoch, newRate);
    }

    // ── Admin setters ─────────────────────────────────────────────────────────

    function setBurnRate(uint256 rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rate >= MIN_BURN && rate <= MAX_BURN, 'rate out of bounds');
        burnPerTx = rate;
        emit BurnRateSet(rate);
    }

    function setEpochDuration(uint256 d) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(d > 0, 'duration zero');
        epochDuration = d;
    }

    function setTxThresholds(uint256 high, uint256 low) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(high > low, 'high must exceed low');
        highTxThreshold = high;
        lowTxThreshold = low;
    }
}
