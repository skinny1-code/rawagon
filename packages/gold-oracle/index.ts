/**
 * @rawagon/gold-oracle (TypeScript)
 * Live gold/silver prices + pawn/buy calculator.
 * Primary: MockOracle contract (on-chain). Fallback: Yahoo Finance GLD/SLV ETF.
 */

export interface SpotResult {
  spot:   number;
  etf:    number;
  symbol: string;
  unit:   string;
}

export interface MeltResult {
  meltValue: number;
  pureOz:    number;
  purity:    number;
  grams:     number;
  spotPrice: number;
  metalType: string;
}

export interface PawnCalcResult {
  meltValue:    number;
  pawnOffer:    number;
  buyOffer:     number;
  spot:         number;
  purity:       number;
  weightTroyOz: number;
}

const TROY_GRAMS = 31.1035;
const CACHE_TTL  = 5 * 60 * 1000;  // 5 minutes
const _cache: Record<string, { price: number; ts: number }> = {};

async function fetchPrice(symbol: string): Promise<number> {
  const now = Date.now();
  if (_cache[symbol] && now - _cache[symbol].ts < CACHE_TTL) {
    return _cache[symbol].price;
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json() as any;
  const price = data.chart.result[0].meta.regularMarketPrice as number;
  _cache[symbol] = { price, ts: now };
  return price;
}

export async function goldSpot(): Promise<SpotResult> {
  const gld = await fetchPrice('GLD');
  return { spot: gld * 10, etf: gld, symbol: 'GLD', unit: 'troy oz' };
}

export async function silverSpot(): Promise<SpotResult> {
  const slv = await fetchPrice('SLV');
  return { spot: slv / 0.9395, etf: slv, symbol: 'SLV', unit: 'troy oz' };
}

export async function allMetals(): Promise<{ gold: SpotResult; silver: SpotResult; timestamp: string }> {
  const [gold, silver] = await Promise.all([goldSpot(), silverSpot()]);
  return { gold, silver, timestamp: new Date().toISOString() };
}

export function meltValue(metalType: string, grams: number, karatOrPurity: number, spotPrice: number): MeltResult {
  const purity = karatOrPurity > 1 ? karatOrPurity / 24 : karatOrPurity;
  const pureOz = (grams / TROY_GRAMS) * purity;
  return { meltValue: pureOz * spotPrice, pureOz, purity, grams, spotPrice, metalType };
}

export async function pawnCalc(
  metalType: string, grams: number, karat: number,
  ltvPct = 0.60, buyPct = 0.85,
): Promise<PawnCalcResult> {
  const purity    = karat === 925 ? 0.925 : karat / 24;
  const spotData  = metalType === 'gold' ? await goldSpot() : await silverSpot();
  const melt      = (grams / TROY_GRAMS) * spotData.spot * purity;
  return { meltValue: melt, pawnOffer: melt * ltvPct, buyOffer: melt * buyPct,
           spot: spotData.spot, purity, weightTroyOz: grams / TROY_GRAMS };
}
