// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @title StakedLTN (sLTN) — liquid staking receipt for FeeDistributor positions
/// @dev Exchange-rate model: as compound() is called, each sLTN redeems for more LTN.
///      This contract IS the staker from FeeDistributor's perspective — it holds a single
///      pooled stake and distributes exposure via the sLTN ERC20.
///      compound() is keeper-friendly (anyone can call it).
///      Patent pending RAW-2026-PROV-001.
interface IFeeDistributorStaking {
    function stake(uint256 amount) external;

    function unstake(uint256 amount) external;

    function claim() external;

    function pending(address user) external view returns (uint256);
}

contract StakedLTN is ERC20, ReentrancyGuard {
    IERC20 public immutable ltn;
    IFeeDistributorStaking public immutable fd;

    /// @dev Total LTN backing all sLTN (increases as compound() harvests rewards).
    uint256 public totalLTNBacking;

    event Wrapped(address indexed user, uint256 ltnIn, uint256 sLtnOut);
    event Unwrapped(address indexed user, uint256 sLtnIn, uint256 ltnOut);
    event Compounded(uint256 ltnGained, uint256 newExchangeRate);

    constructor(address _ltn, address _fd) ERC20('Staked LTN', 'sLTN') {
        ltn = IERC20(_ltn);
        fd = IFeeDistributorStaking(_fd);
        // Max-approve FeeDistributor once so wrap/compound can stake without re-approving.
        IERC20(_ltn).approve(_fd, type(uint256).max);
    }

    // ── Wrap / Unwrap ─────────────────────────────────────────────────────────

    /// @notice Deposit `ltnAmount` LTN and receive sLTN at the current exchange rate.
    function wrap(uint256 ltnAmount) external nonReentrant returns (uint256 sLtnOut) {
        require(ltnAmount > 0, 'amount zero');
        ltn.transferFrom(msg.sender, address(this), ltnAmount);

        uint256 supply = totalSupply();
        if (supply == 0 || totalLTNBacking == 0) {
            sLtnOut = ltnAmount; // first deposit: 1 sLTN per 1 LTN
        } else {
            sLtnOut = (ltnAmount * supply) / totalLTNBacking;
        }

        totalLTNBacking += ltnAmount;
        fd.stake(ltnAmount);
        _mint(msg.sender, sLtnOut);

        emit Wrapped(msg.sender, ltnAmount, sLtnOut);
    }

    /// @notice Burn `sLtnAmount` sLTN and receive the corresponding LTN at current exchange rate.
    function unwrap(uint256 sLtnAmount) external nonReentrant returns (uint256 ltnOut) {
        require(sLtnAmount > 0, 'amount zero');
        uint256 supply = totalSupply();
        require(supply > 0, 'no supply');

        ltnOut = (sLtnAmount * totalLTNBacking) / supply;
        require(ltnOut > 0, 'zero output');

        totalLTNBacking -= ltnOut;
        _burn(msg.sender, sLtnAmount);
        fd.unstake(ltnOut);
        ltn.transfer(msg.sender, ltnOut);

        emit Unwrapped(msg.sender, sLtnAmount, ltnOut);
    }

    // ── Compound ──────────────────────────────────────────────────────────────

    /// @notice Harvest pending FeeDistributor rewards and re-stake them.
    ///         Increases the exchange rate — existing sLTN holders receive more LTN on unwrap.
    ///         Anyone can call this (keeper-friendly).
    function compound() external {
        uint256 before = ltn.balanceOf(address(this));
        fd.claim(); // FD transfers pending rewards to address(this)
        uint256 gained = ltn.balanceOf(address(this)) - before;
        if (gained == 0) return;

        totalLTNBacking += gained;
        fd.stake(gained); // re-stake; sLTN supply unchanged → rate increases

        uint256 rate = totalSupply() > 0 ? (totalLTNBacking * 1e18) / totalSupply() : 1e18;
        emit Compounded(gained, rate);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// @notice LTN redeemable per 1e18 sLTN (18-decimal exchange rate).
    function exchangeRate() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return (totalLTNBacking * 1e18) / supply;
    }

    /// @notice Preview how much LTN `sLtnAmount` would unwrap to right now.
    function previewUnwrap(uint256 sLtnAmount) external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return (sLtnAmount * totalLTNBacking) / supply;
    }
}
