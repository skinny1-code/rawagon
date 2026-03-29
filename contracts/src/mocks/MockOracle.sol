// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only mock for Chainlink IOracle. Configurable answer + updatedAt.
contract MockOracle {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 _answer) {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, block.timestamp, updatedAt, 1);
    }
}
