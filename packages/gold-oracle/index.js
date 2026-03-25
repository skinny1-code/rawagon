// @rawagon/gold-oracle — live gold/silver spot from GLD/SLV ETF
const C = {};
const T = 300000;
async function etf(s) {
  if (C[s] && Date.now() - C[s].t < T) return C[s].v;
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  const d = await r.json();
  const v = d.chart.result[0].meta.regularMarketPrice;
  C[s] = { v, t: Date.now() };
  return v;
}
async function gold() {
  const g = await etf('GLD');
  return { spot: g * 10, etf: g };
}
async function silver() {
  const s = await etf('SLV');
  return { spot: s / 0.9395, etf: s };
}
async function pawn(metal, grams, karat, ltv = 0.6, buy = 0.85) {
  const p = karat === 925 ? 0.925 : karat / 24;
  const d = metal === 'gold' ? await gold() : await silver();
  const m = (grams / 31.1035) * d.spot * p;
  return { melt: m, pawnOffer: m * ltv, buyOffer: m * buy, spot: d.spot };
}
module.exports = { gold, silver, pawn };
