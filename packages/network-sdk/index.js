/**
 * @rawagon/network-sdk
 * Shared network event bus + state for all RAWagon apps.
 * 
 * Browser: <script src="/packages/network-sdk/index.js"></script>
 *          → window.RAWNet
 * 
 * Publishes events to server SSE → all connected apps receive in real-time.
 * Falls back to localStorage broadcast when server unavailable.
 */
(function(global) {
'use strict';

const SERVER_ORIGIN = window.location.origin;
const EVENT_URL     = SERVER_ORIGIN + '/api/event';
const STATE_KEY     = 'rawagon-network-state';
const WALLET_KEY    = 'rawagon-wallet';

// ── Event types ──────────────────────────────────────────────────────────────
const EVENTS = {
  // Financial
  BREAK_COMPLETED:    'break.completed',    // { breakId, gmv, slots, seller }
  PAWN_TICKET_OPENED: 'pawn.ticket.opened', // { ticketId, loan, item }
  PAWN_TICKET_REDEEMED:'pawn.ticket.redeemed',
  IQCAR_MINTED:       'autoiq.minted',      // { vin, price, tokenId }
  GTX_MINTED:         'goldsnap.gtx.minted',
  LTN_STAKED:         'qwks.ltn.staked',    // { amount, staker }
  REVIEW_GENERATED:   'dtr.review',         // { title, critic }
  PAWNVAULT_TICKET:   'pawnvault.ticket',   // { item, loan }
  // Identity
  WALLET_CONNECTED:   'wallet.connected',   // { address, chainId }
  KEY_SAVED:          'key.saved',          // { type: 'anthropic'|'tmdb' }
  // App
  APP_OPENED:         'app.opened',         // { app }
  AGENT_PATCH:        'agent.patch',        // { agent, app, lines }
};

// ── Publish event ────────────────────────────────────────────────────────────
async function publish(type, data = {}) {
  const event = { type, data, app: _currentApp(), ts: Date.now() };
  // 1. Write to shared localStorage state
  const state = _readState();
  state.events = [event, ...(state.events || [])].slice(0, 100);
  state.stats = state.stats || {};
  // Update stats
  if (type === EVENTS.BREAK_COMPLETED)      state.stats.totalGMV    = (state.stats.totalGMV    || 0) + (data.gmv || 0);
  if (type === EVENTS.PAWN_TICKET_OPENED)   state.stats.totalLoanBook= (state.stats.totalLoanBook||0) + (data.loan||0);
  if (type === EVENTS.IQCAR_MINTED)         state.stats.titlesIssued= (state.stats.titlesIssued || 0) + 1;
  if (type === EVENTS.GTX_MINTED)           state.stats.gtxMinted   = (state.stats.gtxMinted   || 0) + (data.amount || 0);
  if (type === EVENTS.LTN_STAKED)           state.stats.ltnStaked   = (state.stats.ltnStaked   || 0) + (data.amount || 0);
  if (type === EVENTS.REVIEW_GENERATED)     state.stats.reviewCount = (state.stats.reviewCount || 0) + 1;
  if (type === EVENTS.PAWNVAULT_TICKET)     state.stats.pvTickets   = (state.stats.pvTickets   || 0) + 1;
  state.lastUpdate = Date.now();
  _writeState(state);
  // Broadcast via storage event (cross-tab)
  try { window.dispatchEvent(new StorageEvent('storage', { key: STATE_KEY, newValue: JSON.stringify(state) })); } catch {}
  // 2. POST to server SSE (best effort)
  try {
    fetch(EVENT_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(event) })
      .catch(() => {}); // silent fail
  } catch {}
  return event;
}

// ── Subscribe to events ──────────────────────────────────────────────────────
const _listeners = new Map();
let _sse = null;

function subscribe(typeOrTypes, handler) {
  const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];
  types.forEach(t => {
    if (!_listeners.has(t)) _listeners.set(t, new Set());
    _listeners.get(t).add(handler);
  });
  // Connect SSE if not already
  if (!_sse) _connectSSE();
  // Also listen via localStorage for same-device cross-tab
  window.addEventListener('storage', e => {
    if (e.key !== STATE_KEY) return;
    try {
      const state = JSON.parse(e.newValue || '{}');
      const latest = (state.events || [])[0];
      if (latest) _dispatch(latest);
    } catch {}
  });
  return () => types.forEach(t => _listeners.get(t)?.delete(handler));
}

function _connectSSE() {
  try {
    _sse = new EventSource(SERVER_ORIGIN + '/api/events');
    _sse.onmessage = e => {
      try { _dispatch(JSON.parse(e.data)); } catch {}
    };
    _sse.onerror = () => { _sse.close(); _sse = null; setTimeout(_connectSSE, 5000); };
  } catch {}
}

function _dispatch(event) {
  const handlers = _listeners.get(event.type) || new Set();
  const wildcards = _listeners.get('*') || new Set();
  [...handlers, ...wildcards].forEach(h => { try { h(event); } catch {} });
}

// ── Shared wallet state ──────────────────────────────────────────────────────
function setWallet(address, chainId) {
  localStorage.setItem(WALLET_KEY, JSON.stringify({ address, chainId, ts: Date.now() }));
  publish(EVENTS.WALLET_CONNECTED, { address, chainId });
}

function getWallet() {
  try { return JSON.parse(localStorage.getItem(WALLET_KEY) || 'null'); } catch { return null; }
}

// ── Shared API key (write once, read everywhere) ──────────────────────────────
function setKey(type, value) {
  const map = { anthropic: 'rawagon-anthropic-key', tmdb: 'rawagon-tmdb-key', elevenlabs: 'rawagon-elevenlabs-key' };
  if (map[type]) {
    localStorage.setItem(map[type], value);
    if (type === 'anthropic') localStorage.setItem('dtr-anthropic', value); // Drop The Reel compat
    publish(EVENTS.KEY_SAVED, { type });
  }
}

function getKey(type) {
  const map = { anthropic: 'rawagon-anthropic-key', tmdb: 'rawagon-tmdb-key', elevenlabs: 'rawagon-elevenlabs-key' };
  return localStorage.getItem(map[type] || type) || '';
}

// ── State helpers ────────────────────────────────────────────────────────────
function _readState()  { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch { return {}; } }
function _writeState(s){ try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {} }
function _currentApp() {
  const p = window.location.pathname;
  const m = p.match(/\/apps\/([^/]+)/);
  return m ? m[1] : 'unknown';
}

function getState()    { return _readState(); }
function getStats()    { return _readState().stats || {}; }
function getEvents(n)  { return (_readState().events || []).slice(0, n || 20); }

// ── anthropicFetch — uses proxy if key on server, falls back to browser ──────
async function anthropicFetch(messages, maxTokens = 800, system = '') {
  const body = { model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages };
  if (system) body.system = system;

  // Try server proxy first (key stays server-side)
  try {
    const r = await fetch(SERVER_ORIGIN + '/api/anthropic-proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    const d = await r.json();
    if (d.content?.[0]?.text) return d.content[0].text;
    if (d.error?.message?.includes('not set')) throw new Error('proxy_no_key');
  } catch(e) { if (!e.message?.includes('proxy_no_key')) { /* server down, fall through */ } }

  // Browser key fallback
  const key = getKey('anthropic');
  if (!key) throw new Error('No Anthropic API key — add in RAWagon OS → Settings');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key': key,
      'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text || '';
}

// ── Export ───────────────────────────────────────────────────────────────────
const RAWNet = { publish, subscribe, setWallet, getWallet, setKey, getKey,
  getState, getStats, getEvents, anthropicFetch, EVENTS };

if (typeof module !== 'undefined' && module.exports) module.exports = RAWNet;
else global.RAWNet = RAWNet;

})(typeof globalThis !== 'undefined' ? globalThis : this);
