// @rawagon/fee-distributor — savings calculator + Base L2 RPC + staking transition
const RPC = 'https://mainnet.base.org',
  TX = 0.000825;
async function rpc(m, p = []) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: m, params: p, id: 1 }),
  });
  return (await r.json()).result;
}
async function gasPrice() {
  return parseInt(await rpc('eth_gasPrice'), 16) / 1e9;
}
async function block() {
  return parseInt(await rpc('eth_blockNumber'), 16);
}
function savings(vol, txMo, visa = 2.5) {
  const a = vol * 12;
  const vf = a * (visa / 100);
  const qf = txMo * 12 * TX;
  const n = vf - qf;
  return {
    visaAnnual: Math.round(vf),
    qwksAnnual: qf.toFixed(2),
    netSaving: Math.round(n),
    qwksFee: Math.round(n * 0.1),
    toCustomer: Math.round(n * 0.9),
    roiPct: Math.round(((n * 0.9) / (n * 0.1)) * 100),
  };
}
function transition(fee, ltnMo, price, apy = 0.12) {
  const p = fee / (price * apy);
  return {
    ltnNeeded: Math.round(p),
    months: Math.round(p / ltnMo),
    years: (p / ltnMo / 12).toFixed(1),
  };
}
module.exports = { rpc, gasPrice, block, savings, transition };
