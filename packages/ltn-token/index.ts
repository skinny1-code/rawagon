/**
 * @rawagon/ltn-token
 * TypeScript implementation of LTN tokenomics.
 * Mirrors LivingToken.sol + FeeDistributor.sol lifecycle math.
 * Patent pending: RAW-2026-PROV-001
 */

export const LTN_PRICE_USD  = 0.084;
export const BURN_PER_TX    = 0.001;   // LTN burned per RAWNet tx
export const INITIAL_SUPPLY = 1_000_000_000;
export const STAKING_APY    = 0.12;

export interface StakingYield {
  annual:     number;
  monthly:    number;
  daily:      number;
  apy:        number;
  ltnStaked:  number;
}

export interface BurnSimulation {
  txCount:       number;
  ltnBurned:     number;
  supplyAfter:   number;
  burnPct:       number;
}

export interface LifecyclePhase {
  phase:       number;
  name:        string;
  description: string;
  netCost:     number;
  ltnStaked:   number;
  stakingYield:number;
}

export interface EarnRate {
  monthly: number;
  yearly:  number;
  perTx:   number;
}

/** Staking yield for a given LTN stake */
export function stakingYield(ltnAmount: number): StakingYield {
  const annual  = ltnAmount * LTN_PRICE_USD * STAKING_APY;
  return {
    annual,
    monthly: annual / 12,
    daily:   annual / 365,
    apy:     STAKING_APY,
    ltnStaked: ltnAmount,
  };
}

/** Simulate token burn over N transactions */
export function simulateBurn(txCount: number, currentSupply = INITIAL_SUPPLY): BurnSimulation {
  const ltnBurned  = txCount * BURN_PER_TX;
  const supplyAfter = currentSupply - ltnBurned;
  const burnPct    = (ltnBurned / currentSupply) * 100;
  return { txCount, ltnBurned, supplyAfter, burnPct };
}

/**
 * Transition point P* — LTN staked where annual yield ≥ subscription fee.
 * Owner phase: yield > fee → subscriber becomes network owner.
 */
export function transitionPoint(
  annualFee:   number,
  ltnPrice:    number = LTN_PRICE_USD,
  apy:         number = STAKING_APY,
): number {
  return annualFee / (ltnPrice * apy);
}

/** LTN earn rate from transaction volume */
export function earnRate(
  monthlyTxVol: number,
  totalNetworkVol = 50_000,
  rewardPoolLTN  = 10_000,
): EarnRate {
  const share  = monthlyTxVol / totalNetworkVol;
  const monthly = share * rewardPoolLTN;
  return { monthly, yearly: monthly * 12, perTx: rewardPoolLTN / totalNetworkVol };
}

/** Full lifecycle projection across 5 phases */
export function lifecycleProjection(
  monthlyFee:   number,
  startLTN:     number = 1_000,
  growthPerYear:number = 5_000,
): LifecyclePhase[] {
  const phases = ['Subscriber','Participant','Stakeholder','Owner','Partner'];
  return phases.map((name, i) => {
    const ltnStaked    = startLTN + (i * growthPerYear);
    const stakingYieldAmt = ltnStaked * LTN_PRICE_USD * STAKING_APY;
    const netCost      = (monthlyFee * 12) - stakingYieldAmt;
    return { phase: i + 1, name, description: `${name} phase`, netCost, ltnStaked, stakingYield: stakingYieldAmt };
  });
}
