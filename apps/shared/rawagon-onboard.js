/**
 * RAWagon Onboarding + Wallet UX v3
 * Mobile-safe: no backdrop-filter, proper touch events,
 * wizard is opt-in only (not auto-blocking), real skip buttons
 */
(function () {
'use strict';

const CHAIN = {
  chainId:       '0xAFF1D',
  chainName:     'RAWNet Testnet',
  nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 },
  rpcUrls:       ['http://10.117.122.142:8545','http://localhost:8545'],
};
const WALLET_KEY = 'rawagon-wallet';

// ── Toast ──────────────────────────────────────────────────────────────────
function rwToast(msg, isErr) {
  if (typeof window.toast === 'function') { window.toast(msg, isErr); return; }
  let el = document.getElementById('rw-shared-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rw-shared-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a0f2e;border:1.5px solid #8b5cf6;color:#f0eaff;padding:12px 22px;border-radius:12px;font-size:15px;font-weight:600;z-index:99999;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.6)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.borderColor = isErr ? '#f87171' : '#8b5cf6';
  el.style.color = isErr ? '#f87171' : '#f0eaff';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 3500);
}
window.rwToast = rwToast;

// ── Wallet ─────────────────────────────────────────────────────────────────
window.RWWallet = {
  addr: null,

  async connect() {
    if (!window.ethereum) { showWalletOptions(); return null; }
    const btns = document.querySelectorAll('[data-rw-connect], #connect-btn');
    btns.forEach(b => { b.textContent = 'Connecting…'; b.disabled = true; });
    try {
      await window.ethereum.request({ method:'wallet_addEthereumChain', params:[CHAIN] }).catch(()=>{});
      await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:CHAIN.chainId}] }).catch(()=>{});
      const accounts = await window.ethereum.request({ method:'eth_requestAccounts' });
      const addr = accounts[0];
      if (!addr) throw new Error('No accounts');
      this.addr = addr;
      localStorage.setItem(WALLET_KEY, JSON.stringify({ address:addr, chainId:720701, ts:Date.now() }));
      if (window.RAWNet) RAWNet.setWallet(addr, 720701);
      document.dispatchEvent(new CustomEvent('rawagon:connected', { detail:{ address:addr } }));
      rwToast('Wallet connected ✓');
      _updateBtns(addr);
      return addr;
    } catch(e) {
      const msg = e.code === 4001   ? 'Cancelled' :
                  e.code === -32002 ? 'MetaMask already open' :
                  'Connection failed';
      rwToast(msg, true);
      btns.forEach(b => { b.textContent = '🔗 Connect'; b.disabled = false; });
      return null;
    }
  },

  getAddr() {
    if (this.addr) return this.addr;
    try {
      const s = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null');
      if (s?.address) { this.addr = s.address; return s.address; }
    } catch {}
    return null;
  },

  isConnected() { return !!this.getAddr(); },
};

function _updateBtns(addr) {
  const short = addr ? addr.slice(0,6)+'…'+addr.slice(-4) : null;
  document.querySelectorAll('[data-rw-connect], #connect-btn').forEach(b => {
    if (addr) {
      b.textContent = '✓ ' + short;
      b.classList.add('connected','on');
      b.style.cssText = (b.style.cssText || '') + ';border-color:rgba(52,211,153,.4)!important;color:#34d399!important;background:rgba(52,211,153,.07)!important';
    } else {
      b.textContent = '🔗 Connect';
      b.classList.remove('connected','on');
      b.style.borderColor = b.style.color = b.style.background = '';
    }
  });
}

// Restore wallet on load
const _saved = RWWallet.getAddr();
if (_saved) { RWWallet.addr = _saved; _updateBtns(_saved); }

// Auto-wire connect buttons — use touchstart for mobile responsiveness
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-rw-connect], #connect-btn').forEach(btn => {
    btn.addEventListener('click', () => RWWallet.connect());
  });
  // Restore again after DOM ready
  const addr = RWWallet.getAddr();
  if (addr) _updateBtns(addr);
});

// ── Wallet Options Modal ───────────────────────────────────────────────────
// No backdrop-filter (crashes Android), big touch targets
function showWalletOptions() {
  _rm('rw-wallet-opts');
  const d = document.createElement('div');
  d.id = 'rw-wallet-opts';
  // Solid dark overlay — no blur (mobile-safe)
  d.style.cssText = 'position:fixed;inset:0;background:rgba(4,2,12,.95);display:flex;align-items:flex-end;justify-content:center;z-index:99990;padding:0 0 env(safe-area-inset-bottom,0)';
  const hasMM = !!window.ethereum;
  d.innerHTML = `
  <div style="background:#0e0919;border:1px solid rgba(139,92,246,.25);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:480px">
    <!-- handle -->
    <div style="width:40px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto 20px;cursor:pointer" onclick="_rm('rw-wallet-opts')"></div>
    <div style="font-size:1.1rem;font-weight:800;color:#f0eaff;margin-bottom:4px">Connect Wallet</div>
    <div style="font-size:.82rem;color:#5a4a7a;margin-bottom:20px">All AI features work without one. Wallet needed only for on-chain actions.</div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
      <button ontouchstart="" onclick="javascript:_rm('rw-wallet-opts');void(${hasMM}?RWWallet.connect():window.open('https://metamask.io/download','_blank'))"
        style="min-height:58px;padding:14px 18px;background:rgba(246,133,27,.07);border:1.5px solid rgba(246,133,27,.22);border-radius:14px;color:#f6851b;font-size:.92rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:14px;width:100%;-webkit-tap-highlight-color:transparent">
        <span style="font-size:1.6rem;flex-shrink:0">🦊</span>
        <div>
          <div>MetaMask</div>
          <div style="font-size:.72rem;font-weight:400;opacity:.6;margin-top:2px">${hasMM ? 'Detected — tap to connect' : 'Tap to install browser extension'}</div>
        </div>
        <span style="margin-left:auto;font-size:.9rem;opacity:.4">${hasMM ? '→' : '↗'}</span>
      </button>

      <button ontouchstart="" onclick="javascript:rwToast('WalletConnect coming soon — use MetaMask for now')"
        style="min-height:58px;padding:14px 18px;background:rgba(59,153,252,.05);border:1.5px solid rgba(59,153,252,.18);border-radius:14px;color:#60a5fa;font-size:.92rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:14px;width:100%;-webkit-tap-highlight-color:transparent">
        <span style="font-size:1.6rem;flex-shrink:0">🔗</span>
        <div>
          <div>WalletConnect</div>
          <div style="font-size:.72rem;font-weight:400;opacity:.6;margin-top:2px">Coinbase, Rainbow, Trust + 300 wallets</div>
        </div>
        <span style="margin-left:auto;font-size:.72rem;background:rgba(96,165,250,.12);padding:3px 9px;border-radius:10px;opacity:.8">Soon</span>
      </button>
    </div>

    <!-- Skip — biggest button, most prominent -->
    <button ontouchstart="" onclick="javascript:_rm('rw-wallet-opts');rwToast('Continuing — AI features fully available')"
      style="min-height:56px;width:100%;padding:14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:14px;color:#e0d4ff;font-size:.92rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;letter-spacing:.01em">
      Continue without wallet →
    </button>
  </div>`;
  // Tap dark area to close
  d.addEventListener('click', e => { if (e.target === d) _rm('rw-wallet-opts'); });
  document.body.appendChild(d);
}

// ── Setup Wizard ───────────────────────────────────────────────────────────
// Sheet slides up from bottom — mobile-native feel, no blur
function showSetupWizard() {
  _rm('rw-wizard');
  const d = document.createElement('div');
  d.id = 'rw-wizard';
  d.style.cssText = 'position:fixed;inset:0;background:rgba(4,2,12,.95);display:flex;align-items:flex-end;justify-content:center;z-index:99989;padding:0 0 env(safe-area-inset-bottom,0)';
  d.innerHTML = `
  <div style="background:#0e0919;border:1px solid rgba(139,92,246,.2);border-radius:20px 20px 0 0;padding:24px 20px 36px;width:100%;max-width:480px;position:relative">
    <!-- handle / dismiss -->
    <div style="width:40px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto 20px;cursor:pointer" ontouchstart="" onclick="wizardDone()"></div>

    <!-- Step dots -->
    <div style="display:flex;gap:6px;margin-bottom:22px;justify-content:center">
      <div id="rw-d1" style="width:24px;height:5px;border-radius:3px;background:#8b5cf6;transition:.25s"></div>
      <div id="rw-d2" style="width:8px;height:5px;border-radius:3px;background:rgba(255,255,255,.12);transition:.25s"></div>
    </div>

    <!-- Step 1 -->
    <div id="rw-s1">
      <div style="font-size:1.15rem;font-weight:900;color:#f0eaff;margin-bottom:5px">Welcome to RAWagon ⬡</div>
      <div style="font-size:.82rem;color:#5a4a7a;margin-bottom:18px;line-height:1.65">Live card breaks · Pawn shop OS · Vehicle titles · Gold tokens · DeFi payments</div>

      <div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:14px;padding:16px;margin-bottom:12px">
        <div style="font-size:.68rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Wallet — Optional</div>
        <div style="font-size:.8rem;color:#5a4a7a;margin-bottom:14px;line-height:1.6">Needed only for on-chain features (staking, pawn tickets, NFT minting). All AI tools work without one.</div>
        <button ontouchstart="" onclick="wizardConnect()"
          style="min-height:52px;width:100%;background:#8b5cf6;color:#fff;border:none;border-radius:12px;font-size:.92rem;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent" id="rw-wb">
          🔗 Connect Wallet
        </button>
        <div id="rw-ws" style="margin-top:8px;font-size:.74rem;text-align:center;color:#5a4a7a;min-height:18px"></div>
      </div>

      <button ontouchstart="" onclick="wizardStep2()"
        style="min-height:52px;width:100%;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;color:#e0d4ff;font-size:.92rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent">
        Skip — continue without wallet →
      </button>
    </div>

    <!-- Step 2 -->
    <div id="rw-s2" style="display:none">
      <div style="font-size:1.15rem;font-weight:900;color:#f0eaff;margin-bottom:5px">Enable AI Features 🤖</div>
      <div style="font-size:.82rem;color:#5a4a7a;margin-bottom:18px;line-height:1.65">Add your Anthropic API key to unlock AI valuations, VIN reports, chat parsing, and film reviews.</div>

      <div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:14px;padding:16px;margin-bottom:12px">
        <div style="font-size:.68rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Anthropic API Key — Optional</div>
        <input id="rw-ki" type="password" placeholder="sk-ant-api03-..."
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          oninput="var v=this.value.startsWith('sk-ant-');var b=document.getElementById('rw-ks');b.disabled=!v;b.style.opacity=v?'1':'.35'"
          style="width:100%;background:rgba(255,255,255,.06);border:1.5px solid rgba(139,92,246,.2);border-radius:12px;padding:13px 14px;color:#f0eaff;font-size:.92rem;font-family:monospace;outline:none;margin-bottom:10px;min-height:50px;-webkit-appearance:none">
        <div style="font-size:.72rem;color:#3d2d5a;margin-bottom:14px;line-height:1.6">
          Free at <a href="https://console.anthropic.com" target="_blank" rel="noopener" style="color:#8b5cf6">console.anthropic.com</a> → API Keys.<br>Stored on this device only, never sent to our servers.
        </div>
        <button ontouchstart="" onclick="wizardSave()" id="rw-ks" disabled
          style="min-height:52px;width:100%;background:#8b5cf6;color:#fff;border:none;border-radius:12px;font-size:.92rem;font-weight:800;cursor:pointer;opacity:.35;transition:.15s;-webkit-tap-highlight-color:transparent">
          Save &amp; Finish →
        </button>
      </div>

      <button ontouchstart="" onclick="wizardDone()"
        style="min-height:52px;width:100%;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;color:#e0d4ff;font-size:.92rem;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent">
        Skip — I'll add it later in Settings →
      </button>
    </div>
  </div>`;
  d.addEventListener('click', e => { if (e.target === d) wizardDone(); });
  document.body.appendChild(d);
}

async function wizardConnect() {
  if (!window.ethereum) { wizardDone(); setTimeout(showWalletOptions, 150); return; }
  const btn = document.getElementById('rw-wb');
  const st  = document.getElementById('rw-ws');
  if (btn) { btn.textContent = '⏳ Connecting…'; btn.disabled = true; }
  const addr = await RWWallet.connect();
  if (addr) {
    if (st)  st.textContent = '✓ ' + addr.slice(0,8)+'…'+addr.slice(-4);
    if (st)  st.style.color = '#34d399';
    if (btn) { btn.textContent = '✓ Connected'; btn.style.background = '#10b981'; }
    setTimeout(wizardStep2, 500);
  } else {
    if (btn) { btn.textContent = '🔗 Connect Wallet'; btn.disabled = false; }
  }
}

function wizardStep2() {
  const s1 = document.getElementById('rw-s1');
  const s2 = document.getElementById('rw-s2');
  const d1 = document.getElementById('rw-d1');
  const d2 = document.getElementById('rw-d2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';
  if (d1) { d1.style.background = '#34d399'; d1.style.width = '8px'; }
  if (d2) { d2.style.background = '#8b5cf6'; d2.style.width = '24px'; }
  document.getElementById('rw-ki')?.focus();
}

function wizardSave() {
  const key = (document.getElementById('rw-ki')?.value || '').trim();
  if (!key.startsWith('sk-ant-')) { rwToast('Enter a valid key (starts with sk-ant-)', true); return; }
  localStorage.setItem('rawagon-anthropic-key', key);
  localStorage.setItem('dtr-anthropic', key);
  wizardDone();
  rwToast('API key saved — all AI features unlocked ✓');
}

function wizardDone() {
  localStorage.setItem('rawagon-setup-done', '1');
  const el = document.getElementById('rw-wizard');
  if (el) el.remove();
}

function _rm(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Intercept raw alert() calls ────────────────────────────────────────────
const _origAlert = window.alert.bind(window);
window.alert = function(msg) {
  const m = String(msg||'').toLowerCase();
  if (m.includes('connect wallet') || m.includes('wallet first') || m.includes('metamask')) {
    if (!window.ethereum) showWalletOptions();
    else rwToast(String(msg), true);
    return;
  }
  _origAlert(msg);
};

// ── Public ─────────────────────────────────────────────────────────────────
window.RWOnboard = { showSetupWizard, showWalletOptions, wizardDone };

// Expose wizard functions globally for inline onclick
window.wizardConnect  = wizardConnect;
window.wizardStep2    = wizardStep2;
window.wizardSave     = wizardSave;
window.wizardDone     = wizardDone;
window._rm            = _rm;

})();
