'use strict';
/**
 * @rawagon/ltn-token
 * LivingToken (LTN) SDK — staking, burn simulation, transition math
 */

const LTN_PRICE_USD   = 0.084;
const MAX_SUPPLY      = 1_000_000_000;
const BURN_PER_TX     = 0.001;      // LTN per transaction
const STAKING_APY     = 0.12;       // 12% APY target
const FEE_DIST_BPS    = 10;         // 0.1% of network volume → stakers
const TOTAL_STAKED_EST= 40_000_000; // estimated total staked at Year 2

/**
 * Calculate staking yield for a given position.
 * @param {number} ltnStaked     Amount of LTN staked
 * @param {number} networkVolume Annual network transaction volume in USD
 * @param {number} totalStaked   Total LTN staked across network
 */
function stakingYield(ltnStaked, networkVolume = 3_444_000_000, totalStaked = TOTAL_STAKED_EST) {
  const feeInflow = networkVolume * (FEE_DIST_BPS / 10_000);
  const yieldPerLTN = feeInflow / totalStaked;
  return {
    feeInflow,
    yieldPerLTN,
    annualYield:   ltnStaked * yieldPerLTN,
    monthlyYield:  (ltnStaked * yieldPerLTN) / 12,
    positionUSD:   ltnStaked * LTN_PRICE_USD,
    apyActual:     (ltnStaked * yieldPerLTN) / (ltnStaked * LTN_PRICE_USD),
  };
}

/**
 * Calculate the LTN transition point P*.
 * P* = annualFee / (ltnPrice × stakingAPY)
 * At P* staked, annual yield = subscription fee → business pays net $0.
 */
function transitionPoint(annualFee, ltnPrice = LTN_PRICE_USD, apy = STAKING_APY) {
  const ltnNeeded = annualFee / (ltnPrice * apy);
  return {
    ltnNeeded: Math.round(ltnNeeded),
    usdNeeded: ltnNeeded * ltnPrice,
    annualYieldAtP: ltnNeeded * ltnPrice * apy,
    description: `Stake ${Math.round(ltnNeeded).toLocaleString()} LTN to fully offset $${annualFee}/yr fee`,
  };
}

/**
 * Simulate LTN burn over N transactions.
 */
function simulateBurn(txCount) {
  const burned = txCount * BURN_PER_TX;
  const burnedUSD = burned * LTN_PRICE_USD;
  const remainingSupply = MAX_SUPPLY - burned;
  return { txCount, burned, burnedUSD, remainingSupply,
           deflationPct: (burned / MAX_SUPPLY) * 100 };
}

/**
 * Calculate LTN earned from network participation.
 * 0.001 LTN minted as reward per transaction (before network reaches steady state).
 */
function earnRate(txPerMonth) {
  return {
    ltnPerMonth:  txPerMonth * BURN_PER_TX,
    ltnPerYear:   txPerMonth * BURN_PER_TX * 12,
    usdPerYear:   txPerMonth * BURN_PER_TX * 12 * LTN_PRICE_USD,
  };
}

/**
 * Five-phase lifecycle projection.
 */
function lifecycleProjection(monthlyVolume, txPerMonth, currentLTNPrice = LTN_PRICE_USD) {
  const annualFee = monthlyVolume * 12 * 0.025 * 0.10; // 10% of savings vs Visa
  const ltnEarnPerYear = txPerMonth * 12 * BURN_PER_TX;
  const phases = [
    { phase: 1, name: 'Subscriber',    year: '0-3',  desc: 'Pays fee, earns LTN per txn' },
    { phase: 2, name: 'Participant',   year: '3-5',  desc: 'Staking yield approaches fee' },
    { phase: 3, name: 'Stakeholder',   year: '5-7',  desc: 'Yield exceeds fee — net earner' },
    { phase: 4, name: 'Owner',         year: '7-10', desc: 'Revenue share kicks in' },
    { phase: 5, name: 'Partner',       year: '10+',  desc: 'Network pays business' },
  ];
  return phases.map((p, i) => {
    const yearsIn = [1.5, 4, 6, 8.5, 12][i];
    const ltnAccumulated = ltnEarnPerYear * yearsIn;
    const yieldUSD = ltnAccumulated * currentLTNPrice * STAKING_APY;
    return { ...p, ltnAccumulated: Math.round(ltnAccumulated),
             yieldUSD: parseFloat(yieldUSD.toFixed(2)),
             netVsFee: parseFloat((yieldUSD - annualFee).toFixed(2)) };
  });
}

module.exports = {
  stakingYield, transitionPoint, simulateBurn, earnRate,
  lifecycleProjection,
  LTN_PRICE_USD, MAX_SUPPLY, BURN_PER_TX, STAKING_APY
};
