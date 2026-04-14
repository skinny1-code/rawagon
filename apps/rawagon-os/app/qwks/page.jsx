'use client';

import { useState } from 'react';

const PRESETS = [
  { label: '$10K/mo', vol: 10000, txMo: 200 },
  { label: '$50K/mo', vol: 50000, txMo: 1000 },
  { label: '$250K/mo', vol: 250000, txMo: 5000 },
  { label: '$1M/mo', vol: 1000000, txMo: 20000 },
];

export default function QWKSPage() {
  const [form, setForm] = useState({ vol: '50000', txMo: '1000', visaRate: '2.5' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function calculate(vol, txMo, visaRate) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ vol, txMo, visaRate });
      const res = await fetch(`/api/savings?${params}`);
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    calculate(form.vol, form.txMo, form.visaRate);
  }

  function applyPreset(p) {
    setForm((f) => ({ ...f, vol: String(p.vol), txMo: String(p.txMo) }));
    calculate(p.vol, p.txMo, form.visaRate);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          ⚡ <span style={{ color: '#38bdf8' }}>QWKS</span> Protocol
        </h1>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm">
          Business payment rails on Base L2. $0.000825/tx vs Visa&apos;s ~$0.20. Fee split: 80% back
          to merchant, 10% to LTN stakers, 10% to treasury.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-4 text-center">
        {[
          { icon: '💸', label: 'Per TX', value: '$0.000825' },
          { icon: '🏦', label: 'Visa Rate', value: '~2.5%' },
          { icon: '📈', label: 'Staker Share', value: '10%' },
        ].map(({ icon, label, value }) => (
          <div
            key={label}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-4"
          >
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xl font-bold font-mono">{value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Savings calculator */}
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        className="rounded-xl p-5 space-y-4"
      >
        <h2 className="font-semibold">Savings Calculator</h2>

        {/* Presets */}
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              className="text-xs px-3 py-1.5 rounded-full hover:border-indigo-500 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Monthly Volume ($)
              </label>
              <input
                type="number"
                min="1"
                value={form.vol}
                onChange={(e) => setForm((f) => ({ ...f, vol: e.target.value }))}
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
                TX / Month
              </label>
              <input
                type="number"
                min="1"
                value={form.txMo}
                onChange={(e) => setForm((f) => ({ ...f, txMo: e.target.value }))}
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
                Visa Rate (%)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={form.visaRate}
                onChange={(e) => setForm((f) => ({ ...f, visaRate: e.target.value }))}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                className="w-full rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ background: '#38bdf8', color: '#000' }}
            className="w-full py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            {loading ? 'Calculating…' : 'Calculate Savings'}
          </button>
        </form>

        {result && (
          <div
            className="grid grid-cols-2 gap-3 pt-3 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            {[
              {
                label: 'Visa Annual',
                value: `$${Math.round(result.visaAnnual).toLocaleString()}`,
                color: 'var(--red)',
              },
              {
                label: 'QWKS Annual',
                value: `$${Math.round(result.qwksAnnual).toLocaleString()}`,
                color: 'var(--green)',
              },
              {
                label: 'Net Saving',
                value: `$${Math.round(result.netSaving).toLocaleString()}`,
                color: 'var(--green)',
              },
              { label: 'ROI', value: `${result.roiPct.toFixed(1)}%`, color: '#38bdf8' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {label}
                </p>
                <p className="font-mono font-bold text-lg" style={{ color }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LTN staking info */}
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        className="rounded-xl p-5 space-y-2 text-sm"
      >
        <h2 className="font-semibold">LTN Staking</h2>
        <div style={{ color: 'var(--text-muted)' }} className="space-y-1">
          <p>• Stake LTN to earn a share of network fees (10% of all QWKS volume)</p>
          <p>• Lock with VeLTN for boosted rewards: up to 2.5× at 4-year tier</p>
          <p>• Participate in QWKS volume to earn activity multiplier (up to 2×)</p>
          <p>• Auto-compound available — rewards re-stake automatically each epoch</p>
        </div>
      </div>
    </div>
  );
}
