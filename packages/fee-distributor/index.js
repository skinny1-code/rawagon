/**
 * @rawagon/fee-distributor
 * QWKS savings calculator + staking transition point + Base L2 RPC
 */
'use strict';

const BASE_RPC = 'https://mainnet.base.org';
const TX_COST_USD = 0.000825; // live Base L2 contract call cost

async function rpc(method, params = []) {
  const r = await fetch(BASE_RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method, params, id:1 })
  });
  return (await r.json()).result;
}

async function liveGasPrice() {
  const hex = await rpc('eth_gasPrice');
  return parseInt(hex, 16) / 1e9;
}

async function baseBlock() {
  const hex = await rpc('eth_blockNumber');
  return parseInt(hex, 16);
}

/**
 * Calculate QWKS savings for a business.
 * @param {number} monthlyVolume  USD per month in card transactions
 * @param {number} txPerMonth     Transaction count per month
 * @param {number} visaRatePct    Current processor rate (e.g. 2.5)
 * @param {number} txCostUSD      Per-tx cost override (optional)
 */
function savings(monthlyVolume, txPerMonth, visaRatePct = 2.5, txCostUSD = TX_COST_USD) {
  const annualVol  = monthlyVolume * 12;
  const visaAnnual = annualVol * (visaRatePct / 100);
  const qwksAnnual = txPerMonth * 12 * txCostUSD;
  const netSaving  = visaAnnual - qwksAnnual;
  const qwksFee    = netSaving * 0.10;
  const toCustomer = netSaving - qwksFee;
  const roiPct     = Math.round((toCustomer / qwksFee) * 100);
  return { visaAnnual, qwksAnnual: parseFloat(qwksAnnual.toFixed(4)),
           netSaving: parseFloat(netSaving.toFixed(2)),
           qwksFee: parseFloat(qwksFee.toFixed(2)),
           toCustomer: parseFloat(toCustomer.toFixed(2)), roiPct };
}
const calcSavings = savings; // alias

/**
 * Calculate the LTN staking transition point.
 * P* = annualFee / (ltnPrice * stakingApy)
 * At P*, staking yield = subscription fee (customer pays net $0)
 */
function transition(annualFee, ltnPerMonth, ltnPrice, stakingApy = 0.12) {
  const ltnNeeded = annualFee / (ltnPrice * stakingApy);
  const months = ltnNeeded / ltnPerMonth;
  return {
    ltnNeeded: Math.round(ltnNeeded),
    months: Math.round(months),
    years: parseFloat((months / 12).toFixed(1)),
    annualYieldAtTransition: parseFloat((ltnNeeded * ltnPrice * stakingApy).toFixed(2)),
  };
}
const stakingTransitionPoint = transition; // alias

/** FeeDistributor inflow for a given transaction volume */
function feeDistInflow(networkVolumeUSD) {
  return networkVolumeUSD * 0.001; // 0.1% of volume
}

/** Per-LTN yield given total fee inflow and total staked */
function yieldPerLTN(annualFeeInflow, totalLTNStaked) {
  return annualFeeInflow / totalLTNStaked;
}

module.exports = {
  rpc, liveGasPrice, baseBlock,
  savings, calcSavings,
  transition, stakingTransitionPoint,
  feeDistInflow, yieldPerLTN
};
