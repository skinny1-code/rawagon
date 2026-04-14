'use client';

import { useState } from 'react';

export default function AllCardPage() {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  async function handleShift() {
    setLoading(true);
    try {
      const res = await fetch('/api/pan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card ? { key: card.key } : {}),
      });
      const data = await res.json();
      setCard(data);
      setHistory((h) => [data.pan, ...h].slice(0, 5));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setCard(null);
    setHistory([]);
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          💳 1NCE <span style={{ color: 'var(--accent)' }}>AllCard</span>
        </h1>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm">
          Virtual prepaid card with deterministic PAN derivation. Each shift generates a new
          16-digit number — same key, different nonce. Zero PII on-chain.
        </p>
      </div>

      {/* Card display */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--accent-dim), #1a1050)',
          border: '1px solid var(--accent)',
        }}
        className="rounded-2xl p-6 space-y-6 font-mono"
      >
        <div className="flex justify-between items-start">
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            RAWagon / 1NCE AllCard
          </span>
          <span className="text-2xl">📶</span>
        </div>

        <div className="text-2xl tracking-[0.2em] font-bold text-center py-2">
          {card ? card.pan : '•••• •••• •••• ••••'}
        </div>

        <div
          className="flex justify-between items-end text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <div>
            <div className="uppercase tracking-wider mb-0.5">Nonce</div>
            <div className="text-white">{card ? `#${card.nonce}` : '—'}</div>
          </div>
          <div className="text-right">
            <div className="uppercase tracking-wider mb-0.5">Network</div>
            <div className="text-white">Base L2</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleShift}
          disabled={loading}
          style={{ background: 'var(--accent)' }}
          className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? 'Shifting…' : card ? 'Shift PAN' : 'Generate Card'}
        </button>
        {card && (
          <button
            onClick={reset}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            className="px-5 py-3 rounded-lg text-sm hover:border-indigo-500 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* PAN history */}
      {history.length > 0 && (
        <div
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          className="rounded-xl p-4 space-y-2"
        >
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Shift history (this session)
          </p>
          {history.map((pan, i) => (
            <div
              key={i}
              style={{ color: i === 0 ? 'var(--text)' : 'var(--text-muted)' }}
              className="font-mono text-sm flex items-center gap-2"
            >
              <span className="text-xs w-4">{i === 0 ? '→' : ''}</span>
              {pan}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        className="rounded-xl p-4 space-y-2 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        <p>
          <strong style={{ color: 'var(--text)' }}>How it works:</strong> Each card has a 32-byte
          master key. The PAN is derived via HMAC-SHA256 + BIP44 path over the key and a nonce
          counter. Shifting increments the nonce — same key, provably different PAN.
        </p>
        <p>Patent pending RAW-2026-PROV-001.</p>
      </div>
    </div>
  );
}
