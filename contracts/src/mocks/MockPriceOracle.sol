// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only price oracle. Returns a configurable fixed price.
contract MockPriceOracle {
    uint256 public price;

    constructor(uint256 _price) {
        price = _price;
    }

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getPrice() external view returns (uint256) {
        return price;
    }
}
