/**
 * @rawagon/contracts-sdk
 * Shared contract addresses + ABIs for all R3WAGON apps.
 * Single source of truth — update deployed-addresses.json after each deploy.
 *
 * Browser: include as <script> → window.RAWContracts
 * Node:    const { RAWContracts } = require('@rawagon/contracts-sdk/contracts')
 */
(function(global) {
'use strict';

const ADDR = {
  720701: {
    MockUSDC:       "0xFC628dd79137395F3C9744e33b1c5DE554D94882",
    MockOracleXAU:  "0x5b1869D9A4C187F2EAa108f3062412ecf0526b24",
    MockOracleXAG:  "0xD86C8F0327494034F60e25074420BcCF560D5610",
    LivingToken:    "0xaD888d0Ade988EbEe74B8D4F39BF29a8d0fe8A8D",
    FeeDistributor: "0x7C728214be9A0049e6a86f2137ec61030D0AA964",
    EmployeeVault:  "0x86072CbFF48dA3C1F01824a6761A03F105BCC697",
    GoldMint:       "0xFF6049B87215476aBf744eaA3a476cBAd46fB1cA",
    IQTitle:        "0xA586074FA4Fe3E546A132a16238abe37951D41fE",
    PawnRegistry:   "0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A",
    BreakFactory:   "0xaf5C4C6C7920B4883bC6252e9d9B8fE27187Cf68",
    CardVault:      null, // deploy with: node scripts/deploy-card-vault.js
  },
};

// Minimal ABIs — only what apps need
const ABI = {
  ERC20: [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function transfer(address,uint256) returns (bool)",
    "function faucet()",
  ],
  MockOracle: [
    "function latestAnswer() view returns (int256)",
    "function setPrice(int256)",
  ],
  LivingToken: [
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function totalStaked() view returns (uint256)",
    "function staked(address) view returns (uint256)",
    "function stake(uint256)",
    "function unstake(uint256)",
    "function claimReward() returns (uint256)",
    "function pending(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ],
  FeeDistributor: [
    "function stake(uint256)",
    "function unstake(uint256)",
    "function claim() returns (uint256)",
    "function pending(address) view returns (uint256)",
    "function totalStaked() view returns (uint256)",
    "function staked(address) view returns (uint256)",
    "function inflow(uint256,address)",
    "function registerBusiness(address,uint256,uint256)",
    "function totalInflow() view returns (uint256)",
    "function accRewardPerShare() view returns (uint256)",
  ],
  PawnRegistry: [
    "function openTicket(bytes32,uint256,uint256,uint256,string) returns (bytes32)",
    "function redeemTicket(bytes32)",
    "function forfeit(bytes32)",
    "function calcDue(bytes32) view returns (uint256,uint256)",
    "function tickets(bytes32) view returns (bytes32,address,uint256,uint256,uint256,uint256,uint256,uint8)",
    "function getShopTickets(address) view returns (bytes32[])",
    "function totalVolume() view returns (uint256)",
  ],
  BreakFactory: [
    "function createBreak(string,uint256,uint256) returns (bytes32)",
    "function purchaseSlot(bytes32,bytes32) returns (uint256)",
    "function completeBreak(bytes32,bytes32)",
    "function cancelBreak(bytes32)",
    "function getSellerBreaks(address) view returns (bytes32[])",
    "function breaks(bytes32) view returns (address,uint256,uint256,uint256,uint8,uint256,uint256,bytes32)",
    "function getSlots(bytes32) view returns (tuple(address buyer,bytes32 buyerCommit)[])",
    "function totalGMV() view returns (uint256)",
  ],
  GoldMint: [
    "function mintGTX(uint256) returns (uint256)",
    "function mintSTX(uint256) returns (uint256)",
    "function redeemGTX(uint256)",
    "function redeemSTX(uint256)",
    "function goldPriceUSD() view returns (uint256)",
    "function silverPriceUSD() view returns (uint256)",
    "function gtxPrice() view returns (uint256)",
    "function stxPrice() view returns (uint256)",
    "function gtxBalance(address) view returns (uint256)",
    "function stxBalance(address) view returns (uint256)",
    "function gtxSupply() view returns (uint256)",
    "function stxSupply() view returns (uint256)",
    "function usdcReserve() view returns (uint256)",
  ],
  IQTitle: [
    "function mintTitle(address,string,uint256) returns (uint256)",
    "function transferTitle(uint256,address)",
    "function ownerOf(uint256) view returns (address)",
    "function getVehicle(uint256) view returns (string,address,uint256,uint256)",
    "function totalMinted() view returns (uint256)",
    "function totalVolume() view returns (uint256)",
    "function vinToTokenId(string) view returns (uint256)",
  ],
  EmployeeVault: [
    "function enroll(address,bytes32)",
    "function verifyEmployment(address,bytes32,address) returns (bool)",
    "function getCommitment(address) view returns (bytes32)",
    "function isEnrolled(address) view returns (bool)",
    "function employees(address) view returns (bytes32,address,uint256,bool,uint256)",
    "function getRoster(address) view returns (address[])",
    "function totalEnrolled() view returns (uint256)",
    "function spentProofs(bytes32) view returns (bool)",
  ],
  CardVault: [
    "function submitIntake(bytes32,uint256) returns (uint256)",
    "function getIntakeRequests(address) view returns (uint256[])",
    "function intakeRequests(uint256) view returns (address,bytes32,uint256,uint256,bool,string)",
    "function intakeFee() view returns (uint256)",
    "function monthlyFee() view returns (uint256)",
    "function redemptionFee() view returns (uint256)",
    "function getOwnerTokens(address) view returns (uint256[])",
    "function cards(uint256) view returns (uint256,address,bytes32,string,uint8,uint16,uint256,uint256,uint256,uint256,uint8,string,bytes32)",
    "function requestRedemption(uint256,bytes32)",
    "function totalVaulted() view returns (uint256)",
    "function totalRedeemed() view returns (uint256)",
  ],
};

const RAWContracts = {
  addr: ADDR,
  abi: ABI,
  /** Get address for a contract on the current chain */
  getAddr(chainId, name) {
    return ADDR[chainId]?.[name] || null;
  },
  /** Get address for R3NET testnet (720701) */
  rawnet(name) {
    return ADDR[720701][name] || null;
  },
  /** True if contract is deployed (not null/pending) */
  isDeployed(chainId, name) {
    const a = ADDR[chainId]?.[name];
    return a && a !== 'pending' && a !== null;
  },
};

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RAWContracts, ADDR, ABI };
} else {
  global.RAWContracts = RAWContracts;
}

})(typeof globalThis !== 'undefined' ? globalThis : this);
