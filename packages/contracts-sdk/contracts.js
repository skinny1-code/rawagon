/**
 * @rawagon/contracts
 * Shared contract addresses + minimal ABIs for all RAWagon apps.
 * Loaded from deployed-addresses.json or .env fallbacks.
 *
 * Auto-updates when deploy.js writes deployed-addresses.json.
 * Works in browser (window.RAWContracts) and Node.js.
 */
(function(global){

// ── Addresses (filled by deploy.js) ─────────────────────────────
const ADDR = {
  // Base Sepolia testnet (chainId 84532)
  84532: {
    MockUSDC:         window.__DEPLOYED__?.MockUSDC        || "pending",
    MockOracleXAU:    window.__DEPLOYED__?.MockOracleXAU   || "pending",
    MockOracleXAG:    window.__DEPLOYED__?.MockOracleXAG   || "pending",
    LivingToken:      window.__DEPLOYED__?.LivingToken     || "pending",
    FeeDistributor:   window.__DEPLOYED__?.FeeDistributor  || "pending",
    EmployeeVault:    window.__DEPLOYED__?.EmployeeVault   || "pending",
    GoldMint:         window.__DEPLOYED__?.GoldMint        || "pending",
    IQTitle:          window.__DEPLOYED__?.IQTitle         || "pending",
    PawnRegistry:     window.__DEPLOYED__?.PawnRegistry    || "pending",
    BreakFactory:     window.__DEPLOYED__?.BreakFactory    || "pending",
    EntityAllocation: window.__DEPLOYED__?.EntityAllocation|| "pending",
  },
  // Base Mainnet (chainId 8453)
  8453: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    LivingToken:      "pending",
    FeeDistributor:   "pending",
  }
};

// ── Minimal ABIs ─────────────────────────────────────────────────
const ABI = {
  ERC20: [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function faucet()",
  ],
  LivingToken: [
    "function balanceOf(address) view returns (uint256)",
    "function stake(uint256 amount)",
    "function unstake(uint256 amount)",
    "function claimReward() returns (uint256)",
    "function pendingReward(address) view returns (uint256)",
    "function staked(address) view returns (uint256)",
    "function totalStaked() view returns (uint256)",
    "function totalBurned() view returns (uint256)",
    "function totalTransactions() view returns (uint256)",
  ],
  FeeDistributor: [
    "function inflow(uint256 volume, address initiator)",
    "function stake(uint256 amount)",
    "function unstake(uint256 amount)",
    "function claim() returns (uint256)",
    "function pending(address) view returns (uint256)",
    "function totalInflow() view returns (uint256)",
    "function totalBurned() view returns (uint256)",
    "function totalStaked() view returns (uint256)",
    "function registerBusiness(address,uint256,uint256)",
  ],
  PawnRegistry: [
    "function openTicket(bytes32 commit, uint256 loan, uint256 interestBps, uint256 termDays, string itemHash) returns (bytes32)",
    "function redeemTicket(bytes32 ticketId)",
    "function forfeit(bytes32 ticketId)",
    "function calcDue(bytes32) view returns (uint256 totalDue, uint256 interestDue)",
    "function tickets(bytes32) view returns (bytes32,address,uint256,uint256,uint256,uint256,uint256,string,uint8,uint256)",
    "function getShopTickets(address) view returns (bytes32[])",
    "function totalVolume() view returns (uint256)",
    "event TicketOpened(bytes32 indexed ticketId, address indexed shop, uint256 loanAmount)",
    "event TicketRedeemed(bytes32 indexed ticketId, uint256 totalPaid)",
  ],
  BreakFactory: [
    "function createBreak(string title, uint256 slotCount, uint256 slotPriceUSDC) returns (bytes32)",
    "function purchaseSlot(bytes32 breakId, bytes32 buyerCommit) returns (uint256)",
    "function completeBreak(bytes32 breakId, bytes32 vrfSeed)",
    "function cancelBreak(bytes32 breakId)",
    "function breaks(bytes32) view returns (address,bytes32,uint256,uint256,uint256,uint8,uint256,uint256,uint256,bytes32)",
    "function getSellerBreaks(address) view returns (bytes32[])",
    "function getSlots(bytes32) view returns (tuple(address,bytes32,uint256)[])",
    "event BreakCreated(bytes32 indexed, address indexed, uint256, uint256)",
    "event SlotPurchased(bytes32 indexed, address indexed, uint256)",
    "event BreakCompleted(bytes32 indexed, uint256, uint256, uint256)",
  ],
  IQTitle: [
    "function mintTitle(address to, string vin, uint256 salePrice) returns (uint256 tokenId)",
    "function transferTitle(uint256 tokenId, address newOwner)",
    "function getVehicle(uint256 tokenId) view returns (string vin, address owner, uint256 price, uint256 mintedAt)",
    "function vinToTokenId(string vin) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function totalMinted() view returns (uint256)",
    "event TitleMinted(uint256 indexed tokenId, string vin, address indexed owner, uint256 salePrice)",
  ],
  GoldMint: [
    "function mintGTX(uint256 usdcAmount) returns (uint256 gtxAmt)",
    "function mintSTX(uint256 usdcAmount) returns (uint256 stxAmt)",
    "function redeemGTX(uint256 gtxAmt)",
    "function redeemSTX(uint256 stxAmt)",
    "function gtxPrice() view returns (uint256)",
    "function stxPrice() view returns (uint256)",
    "function goldPriceUSD() view returns (uint256)",
    "function silverPriceUSD() view returns (uint256)",
    "function gtxBalance(address) view returns (uint256)",
    "function stxBalance(address) view returns (uint256)",
    "function gtxSupply() view returns (uint256)",
    "function stxSupply() view returns (uint256)",
    "function usdcReserve() view returns (uint256)",
  ],
  EmployeeVault: [
    "function enroll(address employee, bytes32 commitment)",
    "function rotateCommitment(bytes32 newCommitment)",
    "function verifyEmployment(address employee, bytes32 proofHash, address claimedEmployer) returns (bool)",
    "function deactivate(address employee)",
    "function getCommitment(address) view returns (bytes32)",
    "function isEnrolled(address) view returns (bool)",
    "function getRoster(address employer) view returns (address[])",
    "function totalEnrolled() view returns (uint256)",
    "event Enrolled(address indexed employee, address indexed employer, bytes32 commitment)",
  ],
  EntityAllocation: [
    "function receiveRevenue(bytes32 entityId, uint256 amount)",
    "function previewAllocation(uint256 amount) view returns (uint256,uint256,uint256,uint256,uint256)",
    "function getEntity(bytes32) view returns (tuple(string,string,uint256,address,bool,uint256,uint256))",
    "function totalInflow() view returns (uint256)",
    "function totalFounderBridged() view returns (uint256)",
    "function pendingWithdrawal(address) view returns (uint256)",
  ],
};

// ── Helper: get ethers contract instance ─────────────────────────
function getContract(name, signerOrProvider) {
  if (!window.ethers) throw new Error("ethers.js not loaded");
  const chainId = window._rawagonChainId || 84532;
  const addrMap = ADDR[chainId] || ADDR[84532];
  const addr = addrMap[name];
  if (!addr || addr === "pending") {
    console.warn(`[RAWContracts] ${name} not yet deployed. Run: npx hardhat run scripts/deploy.js --network base_sepolia`);
    return null;
  }
  const abi = ABI[name] || ABI.ERC20;
  return new window.ethers.Contract(addr, abi, signerOrProvider);
}

// ── Expose globally ───────────────────────────────────────────────
global.RAWContracts = { ADDR, ABI, getContract };

// Track chain from wallet bar
document.addEventListener("rawagon:connected", (e) => {
  window._rawagonChainId = e.detail?.chainId || 84532;
});

})(window);
