'use client';

import { useState, useEffect } from 'react';

export default function GoldSnapPage() {
  const [prices, setPrices] = useState(null);
  const [pawnForm, setPawnForm] = useState({ metal: 'gold', grams: '10', karat: '14' });
  const [pawnResult, setPawnResult] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [loadingPawn, setLoadingPawn] = useState(false);

  useEffect(() => {
    fetch('/api/gold')
      .then((r) => r.json())
      .then(setPrices)
      .catch(() => {})
      .finally(() => setLoadingPrice(false));
  }, []);

  async function handlePawnQuote(e) {
    e.preventDefault();
    setLoadingPawn(true);
    try {
      const params = new URLSearchParams({
        metal: pawnForm.metal,
        grams: pawnForm.grams,
        karat: pawnForm.karat,
      });
      const res = await fetch(`/api/pawn?${params}`);
      const data = await res.json();
      setPawnResult(data);
    } finally {
      setLoadingPawn(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          🥇 <span style={{ color: 'var(--gold)' }}>GoldSnap</span>
        </h1>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm">
          Gold-backed ERC20 token (GTX) pegged via Chainlink XAU/USD. 1 GTX = 1/100 troy oz gold.
          Mint with USDC, redeem anytime.
        </p>
      </div>

      {/* Live price */}
      <div className="grid grid-cols-2 gap-4">
        <div
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          className="rounded-xl p-5"
        >
          <p
            className="text-xs uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Gold Spot
          </p>
          <p className="text-3xl font-bold font-mono" style={{ color: 'var(--gold)' }}>
            {loadingPrice
              ? '…'
              : prices
                ? `$${prices.spot.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                : '—'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            per troy oz (GLD ETF × 10)
          </p>
        </div>
        <div
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          className="rounded-xl p-5"
        >
          <p
            className="text-xs uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            GTX Price
          </p>
          <p className="text-3xl font-bold font-mono" style={{ color: 'var(--gold)' }}>
            {loadingPrice ? '…' : prices ? `$${(prices.spot / 100).toFixed(2)}` : '—'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            per GTX (1/100 oz)
          </p>
        </div>
      </div>

      {/* Mint / Redeem info */}
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        className="rounded-xl p-5 space-y-3"
      >
        <h2 className="font-semibold">Mint & Redeem</h2>
        <div className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
          <p>• Deposit USDC → receive GTX at live Chainlink XAU/USD price</p>
          <p>• 0.25% minting fee applied at time of mint</p>
          <p>• Redeem GTX → receive USDC at current oracle price</p>
          <p>• Oracle staleness check: reverts if price &gt; 2 hours old</p>
        </div>
        <div
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          className="rounded-lg p-3 text-xs font-mono"
          style={{ color: 'var(--text-muted)' }}
        >
          Note: GoldMint on Base Sepolia has no Chainlink XAU/USD oracle. Mainnet only.
        </div>
      </div>

      {/* BitPawn calculator */}
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        className="rounded-xl p-5 space-y-4"
      >
        <h2 className="font-semibold">Pawn Calculator</h2>
        <form onSubmit={handlePawnQuote} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Metal
              </label>
              <select
                value={pawnForm.metal}
                onChange={(e) => setPawnForm((f) => ({ ...f, metal: e.target.value }))}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                className="w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Grams
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={pawnForm.grams}
                onChange={(e) => setPawnForm((f) => ({ ...f, grams: e.target.value }))}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                className="w-full rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Karat
              </label>
              <select
                value={pawnForm.karat}
                onChange={(e) => setPawnForm((f) => ({ ...f, karat: e.target.value }))}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                className="w-full rounded-lg px-3 py-2 text-sm"
              >
                <option value="24">24K</option>
                <option value="18">18K</option>
                <option value="14">14K</option>
                <option value="10">10K</option>
                <option value="925">925 Sterling</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loadingPawn}
            style={{ background: 'var(--gold)', color: '#000' }}
            className="w-full py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            {loadingPawn ? 'Calculating…' : 'Get Quote'}
          </button>
        </form>

        {pawnResult && (
          <div
            className="grid grid-cols-3 gap-3 pt-2 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Melt Value
              </p>
              <p className="font-mono font-bold">${pawnResult.melt.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Pawn Offer
              </p>
              <p className="font-mono font-bold" style={{ color: 'var(--green)' }}>
                ${pawnResult.pawnOffer.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Buy Offer
              </p>
              <p className="font-mono font-bold" style={{ color: 'var(--gold)' }}>
                ${pawnResult.buyOffer.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
