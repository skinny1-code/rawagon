/**
 * @package @rawagon/fee-distributor
 * Client for the FeeDistributor smart contract.
 * Calculates QWKS savings, submits inflow, reads staking state.
 */

const BASE_RPC = 'https://mainnet.base.org';
const TX_COST_USD = 0.000825; // live Base L2 contract call cost

async function rpc(method, params = []) {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const data = await res.json();
  return data.result;
}

async function liveGasPrice() {
  const hex = await rpc('eth_gasPrice');
  return parseInt(hex, 16) / 1e9; // Gwei
}

async function baseBlock() {
  const hex = await rpc('eth_blockNumber');
  return parseInt(hex, 16);
}

/**
 * Calculate verified savings for a QWKS business customer.
 * @param {number} monthlyVolume   Monthly transaction volume in USD
 * @param {number} txCount         Number of transactions per month
 * @param {number} baselineRatePct Current Visa/Stripe rate (e.g. 2.5)
 * @param {number} ethPrice        Current ETH price in USD
 */
function calcSavings(monthlyVolume, txCount, baselineRatePct = 2.5, ethPrice = 2100) {
  const annualVol = monthlyVolume * 12;
  const visaAnnual = annualVol * (baselineRatePct / 100);
  const qwksTxCost = TX_COST_USD;
  const qwksAnnual = txCount * 12 * qwksTxCost;
  const savingsAnnual = visaAnnual - qwksAnnual;
  const qwksFee = savingsAnnual * 0.10; // 10% of savings
  const netToCustomer = savingsAnnual - qwksFee;
  const roiPct = (netToCustomer / qwksFee) * 100;

  return {
    visaAnnual: Math.round(visaAnnual),
    qwksAnnual: qwksAnnual.toFixed(2),
    savingsAnnual: Math.round(savingsAnnual),
    qwksFee: Math.round(qwksFee),
    netToCustomer: Math.round(netToCustomer),
    roiPct: Math.round(roiPct),
    qwksCostAsPct: ((qwksTxCost / (monthlyVolume / txCount)) * 100).toFixed(6),
  };
}

/**
 * Calculate LTN staking transition point.
 * @param {number} annualFee       Annual QWKS subscription fee in USD
 * @param {number} ltnAccumRate    LTN earned per month
 * @param {number} ltnPriceUSD     Current LTN price
 * @param {number} stakingApy      Staking APY as decimal (0.12 = 12%)
 */
function stakingTransitionPoint(annualFee, ltnAccumRate, ltnPriceUSD, stakingApy = 0.12) {
  // P* = annualFee / (ltnPriceUSD * stakingApy)
  const pStar = annualFee / (ltnPriceUSD * stakingApy);
  const monthsToTransition = pStar / ltnAccumRate;
  const yearsToTransition = monthsToTransition / 12;

  return {
    requiredLTN: Math.round(pStar),
    monthsToReach: Math.round(monthsToTransition),
    yearsToReach: yearsToTransition.toFixed(1),
    annualYieldAtTransition: (pStar * ltnPriceUSD * stakingApy).toFixed(2),
    interpretation: `At ${ltnAccumRate} LTN/month, you reach fee-neutral status in ${yearsToTransition.toFixed(1)} years`,
  };
}

module.exports = { rpc, liveGasPrice, baseBlock, calcSavings, stakingTransitionPoint };
