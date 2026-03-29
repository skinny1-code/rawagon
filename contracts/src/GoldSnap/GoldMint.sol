// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

interface IOracle {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title GoldMint (GTX) — 1 GTX = 1/100 troy oz gold, Chainlink XAU/USD pegged
/// @dev 0.25% mint fee; USDC-backed reserve; oracle freshness enforced (2-hour max age)
contract GoldMint is ERC20, Ownable {
    IOracle public oracle;
    address public usdc;
    uint256 public reserve;

    /// @dev Maximum age of a Chainlink round before price() reverts as stale.
    ///      XAU/USD heartbeat is 24 h but we enforce 2 h for safety.
    uint256 public constant ORACLE_MAX_AGE = 2 hours;

    constructor(address o, address u, address owner) ERC20('GoldSnap Gold', 'GTX') Ownable(owner) {
        oracle = IOracle(o);
        usdc = u;
    }

    /// @notice Returns the current XAU/USD price scaled to USDC units per GTX.
    ///         Reverts if the oracle price is stale (>2 h) or non-positive.
    function price() public view returns (uint256) {
        (, int256 p, , uint256 updatedAt, ) = oracle.latestRoundData();
        require(p > 0, 'invalid oracle price');
        require(block.timestamp - updatedAt <= ORACLE_MAX_AGE, 'stale oracle');
        // Chainlink XAU/USD has 8 decimals; divide by 100 to get price per 1/100 oz (1 GTX)
        // then divide by 100 again to convert from 8-decimal to 6-decimal (USDC)
        return uint256(p) / 100 / 100;
    }

    /// @notice Mint GTX by depositing USDC. 0.25% fee retained as reserve.
    function mint(uint256 uAmt) external {
        uint256 p = price();
        uint256 fee = (uAmt * 25) / 10000;
        uint256 net = uAmt - fee;
        uint256 gtx = (net * 1e18) / p;
        IERC20(usdc).transferFrom(msg.sender, address(this), uAmt);
        reserve += net;
        _mint(msg.sender, gtx);
    }

    /// @notice Redeem GTX for USDC at current oracle price.
    function redeem(uint256 gAmt) external {
        uint256 uOut = (gAmt * price()) / 1e18;
        _burn(msg.sender, gAmt);
        reserve -= uOut;
        IERC20(usdc).transfer(msg.sender, uOut);
    }
}
