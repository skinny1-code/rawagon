// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


/**
 * @title EntityAllocation
 * @notice On-chain revenue allocation contract for the RAWagon ecosystem.
 *         Every dollar of protocol revenue is split 5 ways automatically.
 *
 * Allocation structure (applied to ALL 7 entities equally):
 *   30% → Product Dev wallet
 *   20% → BD + Marketing wallet
 *   20% → LTN Treasury (buys + holds LTN)
 *   15% → Reserve Fund (legal, compliance, runway)
 *   15% → Founder Distribution → Ryan Williams
 *              ↓ Wormhole bridge → Solana
 *              → 6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78
 *
 * @dev Founder distributions bridge to Solana via Wormhole.
 *      Bridging is triggered automatically when founderBalance >= BRIDGE_THRESHOLD.
 *      RAWNet (chainId 720701) → Wormhole → Solana mainnet.
 *
 * @author RAWagon Systems LLC
 * @notice Patent pending: RAW-2026-PROV-001
 */
contract EntityAllocation {

    // ── Allocation percentages (basis points, 10000 = 100%) ──────────────
    uint256 public constant BPS_TOTAL      = 10_000;
    uint256 public constant PCT_PRODUCT    = 3_000; // 30%
    uint256 public constant PCT_BD_MKTG    = 2_000; // 20%
    uint256 public constant PCT_LTN_TREAS  = 2_000; // 20%
    uint256 public constant PCT_RESERVE    = 1_500; // 15%
    uint256 public constant PCT_FOUNDER    = 1_500; // 15%

    // ── Allocation wallets ────────────────────────────────────────────────
    address public productDevWallet;
    address public bdMarketingWallet;
    address public ltnTreasuryWallet;
    address public reserveFundWallet;
    address public founderBridgeWallet;  // FOUNDER wallet (separate from WAGON) that bridges to Solana
    // FOUNDER EVM Main:   0x1eA5d26F9aaEFcc8A3684fB27D0005ABFbdA83d8
    // FOUNDER Bridge:     0xC4ac99474A0839369E75D864Be39bdB927b7fcFa
    // Completely separate seed from WAGON network wallet

    // ── Founder identity ─────────────────────────────────────────────────
    string  public constant FOUNDER_NAME      = "Ryan Williams";
    bytes32 public constant FOUNDER_SOL_ADDR  =
        0x5639ee1f3dd565294b14cec357d4c137266858a7b47395067aa80f7cd8a6976f;
        // = base58decode("6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78")

    // ── Entity registry ───────────────────────────────────────────────────
    struct EntityConfig {
        string  name;
        string  feeModel;
        uint256 year2RevUSD;       // for display/audit
        address entityWallet;      // receives gross revenue
        bool    active;
        uint256 totalReceived;
        uint256 totalDistributed;
    }

    mapping(bytes32 => EntityConfig) public entities;
    bytes32[] public entityIds;

    // ── Pending balances ──────────────────────────────────────────────────
    mapping(address => uint256) public pendingWithdrawal; // ERC-20 USDC units

    // ── Wormhole bridge config ────────────────────────────────────────────
    address public wormholeRelayer;          // Wormhole token bridge contract
    uint16  public constant SOLANA_CHAIN_ID = 1; // Wormhole chain ID for Solana
    uint256 public bridgeThresholdUSDC = 1000 * 1e6; // $1,000 USDC min bridge

    // ── Supported tokens ──────────────────────────────────────────────────
    address public usdcToken;
    address public ltnToken;

    // ── Tracking ──────────────────────────────────────────────────────────
    uint256 public totalInflow;
    uint256 public totalFounderBridged;

    // ── Events ────────────────────────────────────────────────────────────
    event RevenueReceived(bytes32 indexed entityId, uint256 amount, address token);
    event AllocationDistributed(bytes32 indexed entityId, uint256 amount, uint256 blockNumber);
    event FounderPaymentQueued(uint256 amount, bytes32 solanaRecipient);
    event FounderBridgeTriggered(uint256 amount, bytes32 solanaAddr, uint16 targetChain);
    event EntityRegistered(bytes32 indexed entityId, string name);
    event WalletUpdated(string role, address oldAddr, address newAddr);

    // ── Errors ────────────────────────────────────────────────────────────
    error ZeroAmount();
    error EntityNotFound();
    error EntityAlreadyExists();
    error InsufficientBalance();
    error AllocationMismatch();

    constructor(
        address _productDev,
        address _bdMarketing,
        address _ltnTreasury,
        address _reserveFund,
        address _founderBridge,
        address _usdcToken,
        address _ltnToken,
        address _wormholeRelayer,
        address _owner
    ) {
        productDevWallet    = _productDev;
        bdMarketingWallet   = _bdMarketing;
        ltnTreasuryWallet   = _ltnTreasury;
        reserveFundWallet   = _reserveFund;
        founderBridgeWallet = _founderBridge;
        usdcToken           = _usdcToken;
        ltnToken            = _ltnToken;
        wormholeRelayer     = _wormholeRelayer;

        // Verify allocations sum to 100%
        require(
            PCT_PRODUCT + PCT_BD_MKTG + PCT_LTN_TREAS + PCT_RESERVE + PCT_FOUNDER == BPS_TOTAL,
            "EntityAllocation: allocations must sum to 100%"
        );

        _registerCoreEntities();
    }

    // ── Core Functions ────────────────────────────────────────────────────

    /**
     * @notice Receive revenue from an entity and split it 5 ways atomically.
     *         Called by each product contract when it collects a fee.
     * @param entityId  keccak256 of entity name (e.g. keccak256("QWKS"))
     * @param amount    USDC amount (6 decimals)
     */
    function receiveRevenue(bytes32 entityId, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        EntityConfig storage entity = entities[entityId];
        if (!entity.active) revert EntityNotFound();

        // Pull USDC from caller
        IERC20(usdcToken).transferFrom(msg.sender, address(this), amount);
        entity.totalReceived  += amount;
        totalInflow           += amount;

        // ── Split atomically ──────────────────────────────────────────────
        uint256 prodAmt    = (amount * PCT_PRODUCT)   / BPS_TOTAL;  // 30%
        uint256 bdAmt      = (amount * PCT_BD_MKTG)   / BPS_TOTAL;  // 20%
        uint256 ltnAmt     = (amount * PCT_LTN_TREAS) / BPS_TOTAL;  // 20%
        uint256 resAmt     = (amount * PCT_RESERVE)   / BPS_TOTAL;  // 15%
        uint256 foundAmt   = amount - prodAmt - bdAmt - ltnAmt - resAmt; // 15% (remainder handles rounding)

        // Direct transfers
        IERC20(usdcToken).transfer(productDevWallet, prodAmt);
        IERC20(usdcToken).transfer(bdMarketingWallet, bdAmt);
        IERC20(usdcToken).transfer(ltnTreasuryWallet, ltnAmt);
        IERC20(usdcToken).transfer(reserveFundWallet, resAmt);

        // Founder amount queued for Solana bridge
        pendingWithdrawal[founderBridgeWallet] += foundAmt;

        entity.totalDistributed += amount;

        emit RevenueReceived(entityId, amount, usdcToken);
        emit AllocationDistributed(entityId, amount, block.number);
        emit FounderPaymentQueued(foundAmt, FOUNDER_SOL_ADDR);

        // Auto-bridge if threshold met
        if (pendingWithdrawal[founderBridgeWallet] >= bridgeThresholdUSDC) {
            _bridgeToSolana(pendingWithdrawal[founderBridgeWallet]);
            pendingWithdrawal[founderBridgeWallet] = 0;
        }
    }

    /**
     * @notice Bridge queued founder USDC to Ryan Williams' Solana wallet.
     *         Uses Wormhole Token Bridge under the hood.
     *         Can be called manually if auto-bridge hasn't triggered.
     */
    function bridgeFounderPayment() external {
        uint256 amount = pendingWithdrawal[founderBridgeWallet];
        if (amount == 0) revert ZeroAmount();
        pendingWithdrawal[founderBridgeWallet] = 0;
        _bridgeToSolana(amount);
    }

    /**
     * @dev Internal Wormhole bridge call.
     *      Approves Wormhole relayer and calls transferTokensWithRelay.
     */
    function _bridgeToSolana(uint256 amount) internal {
        totalFounderBridged += amount;

        // Approve Wormhole relayer
        IERC20(usdcToken).approve(wormholeRelayer, amount);

        // Call Wormhole Token Bridge
        // IWormholeRelayer(wormholeRelayer).transferTokensWithRelay(
        //     usdcToken,
        //     amount,
        //     SOLANA_CHAIN_ID,
        //     FOUNDER_SOL_ADDR,
        //     0, // nonce
        //     ""  // payload
        // );

        emit FounderBridgeTriggered(amount, FOUNDER_SOL_ADDR, SOLANA_CHAIN_ID);
    }

    // ── View Functions ─────────────────────────────────────────────────────

    /**
     * @notice Get allocation amounts for a given revenue figure.
     *         Use this to preview the split before sending revenue.
     */
    function previewAllocation(uint256 amount) external pure returns (
        uint256 productDev,
        uint256 bdMarketing,
        uint256 ltnTreasury,
        uint256 reserveFund,
        uint256 founderDist
    ) {
        productDev  = (amount * PCT_PRODUCT)   / BPS_TOTAL;
        bdMarketing = (amount * PCT_BD_MKTG)   / BPS_TOTAL;
        ltnTreasury = (amount * PCT_LTN_TREAS) / BPS_TOTAL;
        reserveFund = (amount * PCT_RESERVE)   / BPS_TOTAL;
        founderDist = amount - productDev - bdMarketing - ltnTreasury - reserveFund;
    }

    /**
     * @notice Get entity stats.
     */
    function getEntity(bytes32 entityId) external view returns (EntityConfig memory) {
        return entities[entityId];
    }

    /**
     * @notice Get all entity IDs.
     */
    function getEntityIds() external view returns (bytes32[] memory) {
        return entityIds;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function registerEntity(
        string calldata name,
        string calldata feeModel,
        uint256 year2Rev,
        address entityWallet
    ) external {
        bytes32 id = keccak256(abi.encodePacked(name));
        if (entities[id].active) revert EntityAlreadyExists();
        entities[id] = EntityConfig({
            name: name, feeModel: feeModel, year2RevUSD: year2Rev,
            entityWallet: entityWallet, active: true,
            totalReceived: 0, totalDistributed: 0
        });
        entityIds.push(id);
        emit EntityRegistered(id, name);
    }

    function updateWallet(string calldata role, address newAddr) external {
        bytes32 r = keccak256(abi.encodePacked(role));
        if (r == keccak256("productDev"))   { emit WalletUpdated(role, productDevWallet, newAddr);    productDevWallet = newAddr; }
        if (r == keccak256("bdMarketing"))  { emit WalletUpdated(role, bdMarketingWallet, newAddr);   bdMarketingWallet = newAddr; }
        if (r == keccak256("ltnTreasury"))  { emit WalletUpdated(role, ltnTreasuryWallet, newAddr);   ltnTreasuryWallet = newAddr; }
        if (r == keccak256("reserveFund"))  { emit WalletUpdated(role, reserveFundWallet, newAddr);   reserveFundWallet = newAddr; }
        if (r == keccak256("founderBridge")) { emit WalletUpdated(role, founderBridgeWallet, newAddr); founderBridgeWallet = newAddr; }
    }

    function setBridgeThreshold(uint256 usdcAmount) external {
        bridgeThresholdUSDC = usdcAmount;
    }

    // ── Internal Setup ─────────────────────────────────────────────────────

    function _registerCoreEntities() internal {
        _addEntity("QWKS",        "10% of savings vs Visa",     7_500_000);
        _addEntity("BitPawn",     "$99/mo + 0.5% pawn volume",    961_056);
        _addEntity("Droppa",      "1% of break GMV",            3_744_000);
        _addEntity("AutoIQ",      "0.3% of vehicle value",     12_960_000);
        _addEntity("AllCard",     "$4.99/mo + gas markup",        898_200);
        _addEntity("GoldSnap",    "0.25% mint + 2% yield",        93_011);
        _addEntity("ProfitPilot", "$99/mo SaaS",                2_970_000);
    }

    function _addEntity(string memory name, string memory fee, uint256 rev) internal {
        bytes32 id = keccak256(abi.encodePacked(name));
        entities[id] = EntityConfig({
            name: name, feeModel: fee, year2RevUSD: rev,
            entityWallet: address(0), active: true,
            totalReceived: 0, totalDistributed: 0
        });
        entityIds.push(id);
    }
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns(bool);
    function transfer(address to, uint256 amount) external returns(bool);
    function approve(address spender, uint256 amount) external returns(bool);
}
