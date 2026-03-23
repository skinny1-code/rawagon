// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GoldMint
 * @notice Mints GTX (1/100 troy oz gold) and STX (1 troy oz silver) ERC-20 tokens.
 *         Price from Chainlink XAU/USD and XAG/USD oracles (or MockOracle on testnet).
 *         Collateral held as USDC. 0.25% mint fee goes to FeeDistributor.
 *
 *  GTX:  1 token = 1/100 troy oz gold  (~$41.34 at $4133/oz)
 *  STX:  1 token = 1 troy oz silver    (~$32.50/oz)
 *
 * @dev Patent pending: RAW-2026-PROV-001
 */
contract GoldMint {
    // ── ERC-20: GTX ──────────────────────────────────────────────
    string  public constant GTX_NAME     = "Gold Token";
    string  public constant GTX_SYMBOL   = "GTX";
    uint8   public constant GTX_DECIMALS = 18;
    mapping(address => uint256) public gtxBalance;
    mapping(address => mapping(address => uint256)) public gtxAllowance;
    uint256 public gtxSupply;

    // ── ERC-20: STX ──────────────────────────────────────────────
    string  public constant STX_NAME     = "Silver Token";
    string  public constant STX_SYMBOL   = "STX";
    uint8   public constant STX_DECIMALS = 18;
    mapping(address => uint256) public stxBalance;
    mapping(address => mapping(address => uint256)) public stxAllowance;
    uint256 public stxSupply;

    // ── State ─────────────────────────────────────────────────────
    address public owner;
    address public xauOracle;   // Chainlink XAU/USD (8 decimals)
    address public xagOracle;   // Chainlink XAG/USD (8 decimals)
    address public usdcToken;
    address public treasury;

    uint256 public constant MINT_FEE_BPS  = 25;    // 0.25%
    uint256 public constant GTX_RATIO     = 100;   // 1 GTX = 1/100 oz gold
    uint256 public constant COLLAT_YIELD_BPS = 200; // 2% yield on reserve

    uint256 public usdcReserve;
    uint256 public totalMintFees;

    // Events
    event GTXMinted(address indexed to, uint256 gtxAmt, uint256 usdcPaid, uint256 fee);
    event STXMinted(address indexed to, uint256 stxAmt, uint256 usdcPaid, uint256 fee);
    event GTXRedeemed(address indexed from, uint256 gtxAmt, uint256 usdcOut);
    event STXRedeemed(address indexed from, uint256 stxAmt, uint256 usdcOut);
    event Transfer(address indexed from, address indexed to, uint256 value, string token);
    event PriceUpdated(string token, int256 price);

    modifier onlyOwner() { require(msg.sender == owner, "GM: not owner"); _; }

    constructor(address _xauOracle, address _xagOracle, address _usdc, address _treasury) {
        owner      = msg.sender;
        xauOracle  = _xauOracle;
        xagOracle  = _xagOracle;
        usdcToken  = _usdc;
        treasury   = _treasury;
    }

    // ── Price feeds ───────────────────────────────────────────────

    function goldPriceUSD() public view returns (uint256) {
        (, int256 price,,,) = IOracle(xauOracle).latestRoundData();
        require(price > 0, "GM: invalid gold price");
        return uint256(price); // 8 decimals
    }

    function silverPriceUSD() public view returns (uint256) {
        (, int256 price,,,) = IOracle(xagOracle).latestRoundData();
        require(price > 0, "GM: invalid silver price");
        return uint256(price);
    }

    /** GTX price in USDC (6 decimals) = gold_price_8dec / 100 / 100 */
    function gtxPrice() public view returns (uint256) {
        return goldPriceUSD() / GTX_RATIO / 100; // convert 8-dec to 6-dec USDC
    }

    /** STX price in USDC (6 decimals) */
    function stxPrice() public view returns (uint256) {
        return silverPriceUSD() / 100;
    }

    // ── Mint GTX ─────────────────────────────────────────────────

    /**
     * @notice Mint GTX tokens by depositing USDC.
     * @param usdcAmount USDC to spend (6 decimals)
     */
    function mintGTX(uint256 usdcAmount) external returns (uint256 gtxAmt) {
        require(usdcAmount > 0, "GM: zero amount");
        uint256 fee  = (usdcAmount * MINT_FEE_BPS) / 10_000;
        uint256 net  = usdcAmount - fee;
        gtxAmt       = (net * 1e18) / gtxPrice();

        IERC20(usdcToken).transferFrom(msg.sender, address(this), usdcAmount);
        IERC20(usdcToken).transfer(treasury, fee);
        usdcReserve  += net;
        totalMintFees += fee;

        gtxBalance[msg.sender] += gtxAmt;
        gtxSupply              += gtxAmt;
        emit GTXMinted(msg.sender, gtxAmt, usdcAmount, fee);
    }

    // ── Mint STX ─────────────────────────────────────────────────

    function mintSTX(uint256 usdcAmount) external returns (uint256 stxAmt) {
        require(usdcAmount > 0, "GM: zero amount");
        uint256 fee  = (usdcAmount * MINT_FEE_BPS) / 10_000;
        uint256 net  = usdcAmount - fee;
        stxAmt       = (net * 1e18) / stxPrice();

        IERC20(usdcToken).transferFrom(msg.sender, address(this), usdcAmount);
        IERC20(usdcToken).transfer(treasury, fee);
        usdcReserve  += net;
        totalMintFees += fee;

        stxBalance[msg.sender] += stxAmt;
        stxSupply              += stxAmt;
        emit STXMinted(msg.sender, stxAmt, usdcAmount, fee);
    }

    // ── Redeem ───────────────────────────────────────────────────

    function redeemGTX(uint256 gtxAmt) external {
        require(gtxBalance[msg.sender] >= gtxAmt, "GM: insufficient GTX");
        uint256 usdcOut = (gtxAmt * gtxPrice()) / 1e18;
        require(usdcReserve >= usdcOut, "GM: reserve depleted");
        gtxBalance[msg.sender] -= gtxAmt;
        gtxSupply              -= gtxAmt;
        usdcReserve            -= usdcOut;
        IERC20(usdcToken).transfer(msg.sender, usdcOut);
        emit GTXRedeemed(msg.sender, gtxAmt, usdcOut);
    }

    function redeemSTX(uint256 stxAmt) external {
        require(stxBalance[msg.sender] >= stxAmt, "GM: insufficient STX");
        uint256 usdcOut = (stxAmt * stxPrice()) / 1e18;
        require(usdcReserve >= usdcOut, "GM: reserve depleted");
        stxBalance[msg.sender] -= stxAmt;
        stxSupply              -= stxAmt;
        usdcReserve            -= usdcOut;
        IERC20(usdcToken).transfer(msg.sender, usdcOut);
        emit STXRedeemed(msg.sender, stxAmt, usdcOut);
    }

    // ── Admin ─────────────────────────────────────────────────────
    function setOracles(address xau, address xag) external onlyOwner { xauOracle = xau; xagOracle = xag; }
    function setTreasury(address t)               external onlyOwner { treasury = t; }
}

interface IOracle {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}
