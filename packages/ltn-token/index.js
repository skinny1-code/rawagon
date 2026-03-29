// @rawagon/ltn-token — LTN staking + governance client
// Provides pure-math utilities, ABI constants, and read-only on-chain queries
// for the LivingToken (LTN) and FeeDistributor contracts on Base L2.
// Patent pending RAW-2026-PROV-001
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const RPC = {
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
};

// LTN token constants (mirrors LivingToken.sol)
const MAX_SUPPLY = 1_000_000_000; // 1 billion LTN
const INITIAL_SUPPLY = 400_000_000; // 400M minted at deploy
const BURN_PER_TX = 0.001; // LTN burned per transaction
const FEE_BPS = 10; // FeeDistributor takes 10 bps (0.1%) of reported volume

// ── Minimal ABI (for use with ethers/wagmi/viem in frontend apps) ─────────────

const LTN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
  'function burnOnTx()',
  'function totalBurned() view returns (uint256)',
  'function txCount() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function BURN_PER_TX() view returns (uint256)',
];

const FD_ABI = [
  'function ltn() view returns (address)',
  'function totalStaked() view returns (uint256)',
  'function rpt() view returns (uint256)',
  'function staked(address) view returns (uint256)',
  'function pending(address) view returns (uint256)',
  'function rewardDebt(address) view returns (uint256)',
  'function approved(address) view returns (bool)',
  'function stake(uint256 amount)',
  'function unstake(uint256 amount)',
  'function claim()',
  'function inflow(uint256 vol)',
  'function approve(address reporter)',
  'event Staked(address indexed user, uint256 amount)',
  'event Unstaked(address indexed user, uint256 amount)',
  'event Claimed(address indexed user, uint256 amount)',
  'event Inflow(address indexed reporter, uint256 vol, uint256 fee)',
];

// ── ABI-encoding helpers ──────────────────────────────────────────────────────

// Pre-computed keccak256 4-byte selectors (keccak256(sig).slice(0,10))
const SEL = {
  balanceOf: '70a08231', // balanceOf(address)
  staked: '98807d84', // staked(address)
  pending: '5eebea20', // pending(address)
  totalStaked: '817b1cd2', // totalStaked()
  rpt: 'd9c0347e', // rpt()
  totalBurned: 'd89135cd', // totalBurned()
  txCount: '3c540687', // txCount()
};

function _addr(address) {
  return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

function _call0(sel) {
  return '0x' + sel;
}

function _call1Addr(sel, address) {
  return '0x' + sel + _addr(address);
}

async function _ethCall(rpcUrl, to, data) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`eth_call failed: ${json.error.message}`);
  return json.result;
}

function _fromWei(hex) {
  // Convert 32-byte hex result to a float LTN value (18 decimals)
  const raw = BigInt(hex);
  return Number(raw) / 1e18;
}

// ── On-chain read queries ─────────────────────────────────────────────────────

/**
 * Get LTN balance of an address.
 * @param {string} address  wallet address
 * @param {string} [network='base']  'base' | 'base-sepolia'
 * @param {object} addresses  { ltn: '0x...', feeDistributor: '0x...' }
 * @returns {Promise<number>} balance in LTN (float)
 */
async function getBalance(address, network, addresses) {
  const rpc = RPC[network] || RPC.base;
  const data = _call1Addr(SEL.balanceOf, address);
  const result = await _ethCall(rpc, addresses.ltn, data);
  return _fromWei(result);
}

/**
 * Get staked LTN balance of an address in FeeDistributor.
 * @param {string} address
 * @param {string} [network='base']
 * @param {object} addresses  { ltn, feeDistributor }
 * @returns {Promise<number>} staked amount in LTN
 */
async function getStaked(address, network, addresses) {
  const rpc = RPC[network] || RPC.base;
  const data = _call1Addr(SEL.staked, address);
  const result = await _ethCall(rpc, addresses.feeDistributor, data);
  return _fromWei(result);
}

/**
 * Get pending (unclaimed) reward LTN for an address.
 * @param {string} address
 * @param {string} [network='base']
 * @param {object} addresses  { ltn, feeDistributor }
 * @returns {Promise<number>} pending rewards in LTN
 */
async function getPending(address, network, addresses) {
  const rpc = RPC[network] || RPC.base;
  const data = _call1Addr(SEL.pending, address);
  const result = await _ethCall(rpc, addresses.feeDistributor, data);
  return _fromWei(result);
}

/**
 * Get total staked LTN across all stakers.
 * @param {string} [network='base']
 * @param {object} addresses  { ltn, feeDistributor }
 * @returns {Promise<number>} total staked in LTN
 */
async function getTotalStaked(network, addresses) {
  const rpc = RPC[network] || RPC.base;
  const data = _call0(SEL.totalStaked);
  const result = await _ethCall(rpc, addresses.feeDistributor, data);
  return _fromWei(result);
}

// ── Pure math utilities ───────────────────────────────────────────────────────

/**
 * Estimate annualised staking APY.
 * @param {number} annualNetworkVol  USD volume processed per year
 * @param {number} totalStakedLtn   total LTN staked (float)
 * @param {number} ltnPriceUsd      current LTN price in USD
 * @returns {{ feeUsd: number, feeLtn: number, apyPct: number }}
 */
function apy(annualNetworkVol, totalStakedLtn, ltnPriceUsd) {
  if (totalStakedLtn <= 0 || ltnPriceUsd <= 0) return { feeUsd: 0, feeLtn: 0, apyPct: 0 };
  const feeUsd = annualNetworkVol * (FEE_BPS / 10000);
  const feeLtn = feeUsd / ltnPriceUsd;
  const stakedUsd = totalStakedLtn * ltnPriceUsd;
  const apyPct = (feeUsd / stakedUsd) * 100;
  return { feeUsd, feeLtn, apyPct };
}

/**
 * Project LTN burn over time.
 * @param {number} txPerMonth  transactions per month
 * @param {number} [months=12]
 * @returns {{ monthlyBurn: number, totalBurn: number, supplyRemaining: number }}
 */
function burnProjection(txPerMonth, months = 12) {
  const monthlyBurn = txPerMonth * BURN_PER_TX;
  const totalBurn = monthlyBurn * months;
  // Approximate circulating supply (simplification — actual burn reduces from txCount)
  const supplyRemaining = Math.max(0, INITIAL_SUPPLY - totalBurn);
  return { monthlyBurn, totalBurn, supplyRemaining };
}

/**
 * How many months until staking rewards cover the QWKS protocol fee?
 * @param {number} stakeAmt      LTN staked
 * @param {number} monthlyVol    monthly USD volume (user's transactions)
 * @param {number} totalStaked   total LTN staked in pool
 * @param {number} ltnPriceUsd   LTN price in USD
 * @returns {{ monthlyFeeUsd: number, monthlyRewardLtn: number, monthlyRewardUsd: number, months: number | null }}
 */
function stakingBreakeven(stakeAmt, monthlyVol, totalStaked, ltnPriceUsd) {
  const monthlyFeeUsd = monthlyVol * (FEE_BPS / 10000);
  if (totalStaked <= 0 || ltnPriceUsd <= 0) {
    return { monthlyFeeUsd, monthlyRewardLtn: 0, monthlyRewardUsd: 0, months: null };
  }
  const poolFee = monthlyFeeUsd / ltnPriceUsd; // pool-wide LTN rewards per month
  const share = stakeAmt / totalStaked;
  const monthlyRewardLtn = poolFee * share;
  const monthlyRewardUsd = monthlyRewardLtn * ltnPriceUsd;
  const months = monthlyRewardUsd >= monthlyFeeUsd ? 0 : null; // already covered or never
  return { monthlyFeeUsd, monthlyRewardLtn, monthlyRewardUsd, months };
}

/**
 * Project cumulative rewards for a staker over N months.
 * @param {number} stakeAmt        LTN staked by this user
 * @param {number} monthlyNetVol   total monthly network volume in USD
 * @param {number} totalStaked     total LTN staked in pool
 * @param {number} ltnPriceUsd     LTN price in USD
 * @param {number} [months=12]
 * @returns {{ rewardLtn: number, rewardUsd: number, apyPct: number }}
 */
function projectedRewards(stakeAmt, monthlyNetVol, totalStaked, ltnPriceUsd, months = 12) {
  if (totalStaked <= 0 || ltnPriceUsd <= 0) {
    return { rewardLtn: 0, rewardUsd: 0, apyPct: 0 };
  }
  const annualVol = monthlyNetVol * 12;
  const { feeLtn, apyPct } = apy(annualVol, totalStaked, ltnPriceUsd);
  const share = stakeAmt / totalStaked;
  const rewardLtn = (feeLtn * share * months) / 12;
  const rewardUsd = rewardLtn * ltnPriceUsd;
  return { rewardLtn, rewardUsd, apyPct };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // On-chain reads
  getBalance,
  getStaked,
  getPending,
  getTotalStaked,
  // Pure math
  apy,
  burnProjection,
  stakingBreakeven,
  projectedRewards,
  // ABI constants (use with ethers/wagmi/viem)
  LTN_ABI,
  FD_ABI,
  // Protocol constants
  MAX_SUPPLY,
  INITIAL_SUPPLY,
  BURN_PER_TX,
  FEE_BPS,
};
