/**
 * @package @rawagon/gold-oracle
 * Live gold and silver spot prices via GLD/SLV ETF proxy
 * GLD = 1/10 troy oz gold → spot = GLD * 10
 * SLV = ~1 troy oz silver (adjusted) → spot = SLV / 0.9395
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cache = {};

async function fetchPrice(symbol) {
  const now = Date.now();
  if (_cache[symbol] && now - _cache[symbol].ts < CACHE_TTL_MS) {
    return _cache[symbol].price;
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  const price = data.chart.result[0].meta.regularMarketPrice;
  _cache[symbol] = { price, ts: now };
  return price;
}

async function goldSpot() {
  const gld = await fetchPrice('GLD');
  return { spot: gld * 10, etf: gld, symbol: 'GLD', unit: 'troy oz' };
}

async function silverSpot() {
  const slv = await fetchPrice('SLV');
  return { spot: slv / 0.9395, etf: slv, symbol: 'SLV', unit: 'troy oz' };
}

async function allMetals() {
  const [g, s] = await Promise.all([goldSpot(), silverSpot()]);
  return { gold: g, silver: s, timestamp: new Date().toISOString() };
}

function meltValue(metalType, grams, karatOrPurity, spotPrice) {
  // karatOrPurity: 24, 22, 18, 14, 10, or 0.925 for sterling
  // spotPrice: USD per troy oz (from goldSpot() or silverSpot())
  const purity = karatOrPurity > 1 ? karatOrPurity / 24 : karatOrPurity;
  const troyGrams = 31.1035;
  const pureOz = (grams / troyGrams) * purity;
  return {
    meltValue: pureOz * spotPrice,
    pureOz,
    purity,
    grams,
    spotPrice,
    metalType,
  };
}

async function pawnCalc(metalType, grams, karat, ltvPct = 0.60, buyPct = 0.85) {
  const purity = karat === 925 ? 0.925 : karat / 24;
  const troyGrams = 31.1035;
  const spotData = metalType === 'gold' ? await goldSpot() : await silverSpot();
  const melt = (grams / troyGrams) * spotData.spot * purity;
  return {
    meltValue: melt,
    pawnOffer: melt * ltvPct,
    buyOffer: melt * buyPct,
    spot: spotData.spot,
    purity,
    weightTroyOz: grams / troyGrams,
  };
}

module.exports = { goldSpot, silverSpot, allMetals, pawnCalc, meltValue };
