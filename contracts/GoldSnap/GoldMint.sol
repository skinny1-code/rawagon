// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title GoldMint (GTX Token)
 * @notice 1 GTX = 1/100 troy oz of gold, pegged via Chainlink XAU/USD oracle.
 *         Mint by depositing USDC. Burn to redeem.
 * @dev Deployed on Base L2. Oracle: Chainlink XAU/USD on Base.
 */
contract GoldMint is ERC20, Ownable {
    AggregatorV3Interface public immutable goldOracle; // XAU/USD
    address public immutable usdc;

    uint256 public constant TROY_OZ_DIVISOR = 100;    // 1 GTX = 1/100 troy oz
    uint256 public constant MINT_FEE_BPS    = 25;     // 0.25% mint fee

    uint256 public totalUsdcReserve;
    uint256 public totalFeeCollected;

    event Minted(address indexed user, uint256 usdc_in, uint256 gtx_out, uint256 goldPrice);
    event Redeemed(address indexed user, uint256 gtx_in, uint256 usdc_out, uint256 goldPrice);

    constructor(
        address _oracle,
        address _usdc,
        address _owner
    ) ERC20("GoldSnap Gold Token", "GTX") Ownable(_owner) {
        goldOracle = AggregatorV3Interface(_oracle);
        usdc = _usdc;
    }

    /**
     * @notice Get current GTX mint price in USDC (6 decimals).
     *         GTX price = gold spot / 100
     */
    function gtxPrice() public view returns (uint256 priceUSDC) {
        (, int256 goldUSD, , , ) = goldOracle.latestRoundData();
        require(goldUSD > 0, "GoldMint: invalid oracle price");
        // goldUSD has 8 decimals from Chainlink. Convert to 6 decimal USDC.
        // price = goldUSD / 100 (troy oz divisor) / 100 (Chainlink extra 2 decimals)
        priceUSDC = uint256(goldUSD) / TROY_OZ_DIVISOR / 100;
    }

    /**
     * @notice Mint GTX by depositing USDC.
     * @param usdcAmount USDC amount (6 decimals)
     */
    function mint(uint256 usdcAmount) external {
        require(usdcAmount > 0, "GoldMint: zero amount");
        uint256 price = gtxPrice();
        require(price > 0, "GoldMint: zero price");

        uint256 fee = (usdcAmount * MINT_FEE_BPS) / 10000;
        uint256 netUsdc = usdcAmount - fee;
        uint256 gtxAmount = (netUsdc * 1e18) / price; // GTX has 18 decimals

        IERC20(usdc).transferFrom(msg.sender, address(this), usdcAmount);
        totalUsdcReserve += netUsdc;
        totalFeeCollected += fee;

        _mint(msg.sender, gtxAmount);
        emit Minted(msg.sender, usdcAmount, gtxAmount, price);
    }

    /**
     * @notice Burn GTX to redeem USDC at current spot price.
     */
    function redeem(uint256 gtxAmount) external {
        require(gtxAmount > 0, "GoldMint: zero amount");
        uint256 price = gtxPrice();
        uint256 usdcOut = (gtxAmount * price) / 1e18;
        require(usdcOut <= totalUsdcReserve, "GoldMint: insufficient reserve");

        _burn(msg.sender, gtxAmount);
        totalUsdcReserve -= usdcOut;
        IERC20(usdc).transfer(msg.sender, usdcOut);
        emit Redeemed(msg.sender, gtxAmount, usdcOut, price);
    }

    function withdrawFees(address to) external onlyOwner {
        uint256 fees = totalFeeCollected;
        totalFeeCollected = 0;
        IERC20(usdc).transfer(to, fees);
    }
}
