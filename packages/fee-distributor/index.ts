/**
 * @rawagon/fee-distributor
 * TypeScript implementation of QWKS fee distribution math.
 * Mirrors FeeDistributor.sol logic for off-chain calculations.
 * Patent pending: RAW-2026-PROV-001
 */

export interface SavingsResult {
  annualSavings:  number;
  monthlyFee:     number;
  yearlySavings:  number;
  visaCost:       number;
  qwksCost:       number;
  ratio:          number;
}

export interface TransitionPoint {
  pStar:       number;
  annualFee:   number;
  apy:         number;
  ltnPrice:    number;
  description: string;
}

export interface YieldResult {
  annualYield:  number;
  monthlyYield: number;
  apy:          number;
  ltnStaked:    number;
  ltnPriceUsd:  number;
}

export interface FeeInflowResult {
  fee:      number;
  toStakers:number;
  toBurn:   number;
  pct:      number;
}

/** Calculate merchant savings vs Visa (2.5% baseline) */
export function savings(
  monthlyVolume:  number,
  baselineBps:    number = 250,   // 2.5% = 250 bps
  qwksBps:        number = 1,     // 0.01% = 1 bps
): SavingsResult {
  const visaCost   = monthlyVolume * (baselineBps / 10_000);
  const qwksCost   = monthlyVolume * (qwksBps   / 10_000);
  const monthlySav = visaCost - qwksCost;
  const yearlySav  = monthlySav * 12;
  const monthlyFee = monthlySav * 0.10;   // QWKS takes 10% of savings
  const ratio      = visaCost / Math.max(qwksCost, 0.0001);
  return { annualSavings: yearlySav, monthlyFee, yearlySavings: yearlySav, visaCost, qwksCost, ratio };
}

/**
 * Transition point P* — staking position where yield ≥ subscription fee.
 * Phase 4 (Owner): staking yield exceeds fee → net income from network.
 */
export function transition(
  annualFee:  number,
  ltnPriceUsd:number = 0.084,
  apy:        number = 0.12,       // 12% APY on staked LTN
): TransitionPoint {
  // P* = F_sub / (price * APY)
  const pStar = annualFee / (ltnPriceUsd * apy);
  return { pStar, annualFee, apy, ltnPrice: ltnPriceUsd, description: `Stake ${pStar.toFixed(0)} LTN to reach Owner phase` };
}

/** How much of a volume inflow becomes staker yield */
export function feeDistInflow(volumeUsdc: number): FeeInflowResult {
  const pct      = 0.001;           // 0.1% of volume
  const fee      = volumeUsdc * pct;
  const toStakers= fee * 0.90;
  const toBurn   = fee * 0.10;
  return { fee, toStakers, toBurn, pct };
}

/** LTN staking yield for a given stake size */
export function yieldPerLTN(
  stakedLTN:   number,
  ltnPriceUsd: number = 0.084,
  apy:         number = 0.12,
): YieldResult {
  const annualYield  = stakedLTN * ltnPriceUsd * apy;
  const monthlyYield = annualYield / 12;
  return { annualYield, monthlyYield, apy, ltnStaked: stakedLTN, ltnPriceUsd };
}
