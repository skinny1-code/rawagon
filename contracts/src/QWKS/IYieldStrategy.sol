// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IYieldStrategy — pluggable DeFi yield adapter for FeeDistributor
/// @dev FeeDistributor transfers LTN to the strategy address then calls deposit().
///      On harvest(), the strategy transfers accumulated yield back to FeeDistributor.
interface IYieldStrategy {
    /// @notice Notify the strategy that `amount` LTN has been transferred to it.
    function deposit(uint256 amount) external;

    /// @notice Withdraw up to `amount` LTN back to the caller (FeeDistributor).
    /// @return actual The amount actually withdrawn (may be less than requested).
    function withdraw(uint256 amount) external returns (uint256 actual);

    /// @notice Collect accumulated yield and transfer it to the caller.
    /// @return yieldAmount LTN transferred as yield.
    function harvest() external returns (uint256 yieldAmount);

    /// @notice Total LTN currently held / deployed by this strategy.
    function totalDeposited() external view returns (uint256);
}
