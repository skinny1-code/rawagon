// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockOracle
 * @notice Drop-in Chainlink AggregatorV3Interface mock for testnet.
 *         Owner can call setPrice() to update the price feed.
 *         Replace with real Chainlink on mainnet — same interface.
 *
 * Usage:
 *   MockOracle xauOracle = new MockOracle(8, "XAU/USD");
 *   xauOracle.setPrice(413380000000); // $4133.80 (8 decimals)
 */
contract MockOracle {
    string  public description;
    uint8   public decimals;
    address public owner;

    int256  private _price;
    uint256 private _updatedAt;
    uint80  private _roundId;

    event PriceUpdated(int256 price, uint256 timestamp);

    modifier onlyOwner() { require(msg.sender == owner, "MockOracle: not owner"); _; }

    constructor(uint8 _decimals, string memory _description) {
        decimals    = _decimals;
        description = _description;
        owner       = msg.sender;
        _updatedAt  = block.timestamp;
        _roundId    = 1;
    }

    // ── Chainlink AggregatorV3Interface ──────────────────────────

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        require(_price > 0, "MockOracle: price not set");
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }

    function getRoundData(uint80 /* _roundId */) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }

    function latestAnswer() external view returns (int256) { return _price; }
    function version()      external pure returns (uint256) { return 4; }

    // ── Admin ─────────────────────────────────────────────────────

    /**
     * @notice Set the price. Use 8 decimals for USD pairs.
     * @param price e.g. 413380000000 = $4133.80
     */
    function setPrice(int256 price) external onlyOwner {
        require(price > 0, "MockOracle: price must be positive");
        _price     = price;
        _updatedAt = block.timestamp;
        _roundId++;
        emit PriceUpdated(price, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
