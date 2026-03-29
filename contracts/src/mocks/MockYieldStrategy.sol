// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '../QWKS/IYieldStrategy.sol';

/// @dev Test-only yield strategy mock.
///      Simulates 1% yield per harvest() call on the currently deposited balance.
///      FeeDistributor pushes tokens via ltn.transfer() then calls deposit(amount).
contract MockYieldStrategy is IYieldStrategy {
    IERC20 public immutable ltn;
    uint256 private _deposited;

    constructor(address _ltn) {
        ltn = IERC20(_ltn);
    }

    /// @dev Pre-load yield tokens so harvest() has something to return.
    function fund(uint256 amount) external {
        ltn.transferFrom(msg.sender, address(this), amount);
    }

    function deposit(uint256 amount) external override {
        // Tokens already arrived via ltn.transfer() from FeeDistributor before this call.
        _deposited += amount;
    }

    function withdraw(uint256 amount) external override returns (uint256 actual) {
        actual = amount > _deposited ? _deposited : amount;
        _deposited -= actual;
        ltn.transfer(msg.sender, actual);
    }

    function harvest() external override returns (uint256 yieldAmount) {
        yieldAmount = _deposited / 100; // 1% simulated yield
        if (yieldAmount > 0) {
            ltn.transfer(msg.sender, yieldAmount);
        }
    }

    function totalDeposited() external view override returns (uint256) {
        return _deposited;
    }
}
