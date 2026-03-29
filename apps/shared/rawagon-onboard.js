/**
 * RAWagon Onboarding + Wallet UX v2
 * ─────────────────────────────────────────────────────────────
 * - First-run wizard that's actually dismissable
 * - Wallet connect with proper skip/demo mode
 * - No MetaMask-only lock: shows options + always lets you continue
 * - alert() replacement → toast
 * - Shared wallet state via localStorage
 */
(function () {
'use strict';

const CHAIN = {
  chainId:       '0xAFF1D',
  chainName:     'RAWNet Testnet',
  nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 },
  rpcUrls:       ['http://10.117.122.142:8545','http://localhost:8545'],
  blockExplorerUrls: ['http://10.117.122.142:3000'],
};
const SETUP_KEY  = 'rawagon-setup-done';
const WALLET_KEY = 'rawagon-wallet';

// ── Toast ──────────────────────────────────────────────────────────────────
function rwToast(msg, isErr) {
  if (typeof window.toast === 'function') { window.toast(msg, isErr); return; }
  let el = document.getElementById('rw-shared-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rw-shared-toast';
    el.style.cssText = [
      'position:fixed','bottom:28px','left:50%',
      'transform:translateX(-50%) translateY(16px)',
      'background:#160d22','border:1.5px solid #8b5cf6',
      'color:#f0eaff','padding:11px 22px',
      'border-radius:12px','font-size:.82rem','font-weight:600',
      'z-index:99999','opacity:0','transition:all .22s',
      'pointer-events:none','max-width:min(340px,90vw)',
      'text-align:center','white-space:nowrap',
      'box-shadow:0 8px 40px rgba(0,0,0,.5)'
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.borderColor = isErr ? '#f87171' : '#8b5cf6';
  el.style.color = isErr ? '#f87171' : '#f0eaff';
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(16px)';
  }, 3200);
}
window.rwToast = rwToast;

// ── Shared wallet ──────────────────────────────────────────────────────────
window.RWWallet = {
  addr: null,

  async connect() {
    if (!window.ethereum) { showWalletOptions(); return null; }
    const btn = document.querySelector('[data-rw-connect], #connect-btn');
    if (btn) { btn.textContent = 'Connecting…'; btn.disabled = true; }
    try {
      await window.ethereum.request({ method:'wallet_addEthereumChain', params:[CHAIN] }).catch(()=>{});
      await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:CHAIN.chainId}] }).catch(()=>{});
      const accounts = await window.ethereum.request({ method:'eth_requestAccounts' });
      const addr = accounts[0];
      if (!addr) throw new Error('No accounts returned');
      this.addr = addr;
      localStorage.setItem(WALLET_KEY, JSON.stringify({ address:addr, chainId:720701, ts:Date.now() }));
      if (window.RAWNet) RAWNet.setWallet(addr, 720701);
      document.dispatchEvent(new CustomEvent('rawagon:connected', { detail:{ address:addr } }));
      rwToast('Wallet connected ✓');
      _updateConnectBtns(addr);
      return addr;
    } catch(e) {
      const msg = e.code === 4001    ? 'Connection cancelled — tap Connect to try again' :
                  e.code === -32002  ? 'MetaMask already open — check your browser extension' :
                  'Could not connect: ' + (e.message || 'unknown');
      rwToast(msg, true);
      if (btn) { btn.textContent = '🔗 Connect'; btn.disabled = false; }
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

  disconnect() {
    this.addr = null;
    localStorage.removeItem(WALLET_KEY);
    _updateConnectBtns(null);
    rwToast('Wallet disconnected');
  },
};

function _updateConnectBtns(addr) {
  const short = addr ? addr.slice(0,6)+'…'+addr.slice(-4) : null;
  document.querySelectorAll('[data-rw-connect], #connect-btn').forEach(btn => {
    if (!btn) return;
    if (addr) {
      btn.textContent = '✓ ' + short;
      btn.classList.add('connected','on');
      btn.style.borderColor  = 'rgba(52,211,153,.4)';
      btn.style.color        = '#34d399';
      btn.style.background   = 'rgba(52,211,153,.07)';
    } else {
      btn.textContent = '🔗 Connect';
      btn.classList.remove('connected','on');
      btn.style.borderColor = btn.style.color = btn.style.background = '';
    }
  });
}

// Restore on load
const _saved = RWWallet.getAddr();
if (_saved) { RWWallet.addr = _saved; _updateConnectBtns(_saved); }

// Auto-wire
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-rw-connect], #connect-btn').forEach(btn => {
    btn.addEventListener('click', () => RWWallet.connect());
  });
  // First-run check
  const done   = localStorage.getItem(SETUP_KEY);
  const hasKey = !!(localStorage.getItem('rawagon-anthropic-key') || localStorage.getItem('dtr-anthropic'));
  if (!done && !hasKey) setTimeout(showSetupWizard, 600);
});

// ── Wallet options modal (no MetaMask lock) ────────────────────────────────
function showWalletOptions() {
  _closeById('rw-wallet-options');
  const el = document.createElement('div');
  el.id = 'rw-wallet-options';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(4,2,10,.88);display:flex;align-items:center;justify-content:center;z-index:99996;backdrop-filter:blur(14px)';
  el.innerHTML = `
    <div style="background:linear-gradient(160deg,#100a1e,#07040f);border:1px solid rgba(139,92,246,.25);border-radius:20px;padding:32px 36px;max-width:420px;width:92%;position:relative">
      <button onclick="document.getElementById('rw-wallet-options').remove()" style="position:absolute;top:14px;right:16px;background:transparent;border:none;color:rgba(255,255,255,.3);font-size:1.2rem;cursor:pointer;line-height:1;padding:4px">✕</button>
      <div style="font-size:1.2rem;font-weight:900;color:#f0eaff;margin-bottom:6px;text-align:center">Connect Wallet</div>
      <div style="font-size:.78rem;color:#5a4a7a;text-align:center;margin-bottom:22px;line-height:1.6">Connect to use on-chain features.<br>All AI features work without a wallet.</div>

      <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:18px">
        <!-- MetaMask -->
        <button onclick="document.getElementById('rw-wallet-options').remove(); if(window.ethereum){RWWallet.connect();}else{window.open('https://metamask.io/download','_blank')}"
                style="padding:13px 16px;background:rgba(246,133,27,.08);border:1px solid rgba(246,133,27,.25);border-radius:12px;color:#f6851b;font-size:.86rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;transition:.12s">
          <span style="font-size:1.4rem">🦊</span>
          <div><div>MetaMask</div><div style="font-size:.68rem;font-weight:400;opacity:.6;margin-top:1px">${window.ethereum ? 'Detected — click to connect' : 'Browser extension — click to install'}</div></div>
          <span style="margin-left:auto;font-size:.72rem;opacity:.5">${window.ethereum ? '●' : '↗'}</span>
        </button>

        <!-- WalletConnect -->
        <button onclick="rwToast('WalletConnect integration coming soon — use MetaMask for now',false)"
                style="padding:13px 16px;background:rgba(59,153,252,.06);border:1px solid rgba(59,153,252,.18);border-radius:12px;color:#3b99fc;font-size:.86rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;transition:.12s">
          <span style="font-size:1.4rem">🔗</span>
          <div><div>WalletConnect</div><div style="font-size:.68rem;font-weight:400;opacity:.6;margin-top:1px">Coinbase, Rainbow, Trust, and 300+ wallets</div></div>
          <span style="margin-left:auto;font-size:.68rem;background:rgba(59,153,252,.12);padding:2px 7px;border-radius:10px;opacity:.7">Soon</span>
        </button>

        <!-- Coinbase Wallet -->
        <button onclick="rwToast('Install Coinbase Wallet browser extension to connect',false); window.open('https://www.coinbase.com/wallet/downloads','_blank')"
                style="padding:13px 16px;background:rgba(22,82,240,.06);border:1px solid rgba(22,82,240,.18);border-radius:12px;color:#1652f0;font-size:.86rem;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;transition:.12s">
          <span style="font-size:1.4rem">🔵</span>
          <div><div style="color:#60a5fa">Coinbase Wallet</div><div style="font-size:.68rem;font-weight:400;color:#3d5a9a;margin-top:1px">Browser extension or mobile app</div></div>
          <span style="margin-left:auto;font-size:.72rem;opacity:.4">↗</span>
        </button>
      </div>

      <!-- SKIP — big and obvious -->
      <button onclick="document.getElementById('rw-wallet-options').remove(); rwToast('Continuing without wallet — AI features fully available')"
              style="width:100%;padding:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:rgba(255,255,255,.6);font-size:.84rem;font-weight:600;cursor:pointer;transition:.12s">
        Continue without wallet →
      </button>
      <div style="margin-top:10px;text-align:center;font-size:.7rem;color:#3d2d5a;line-height:1.6">
        All AI features (VIN decode, pawn valuations, film reviews, chat parsing) work without connecting a wallet.<br>
        A wallet is only needed for on-chain actions: minting, staking, pawn tickets on RAWNet.
      </div>
    </div>`;
  document.body.appendChild(el);
}

// ── Setup wizard ──────────────────────────────────────────────────────────
function showSetupWizard() {
  _closeById('rw-setup-wizard');
  const el = document.createElement('div');
  el.id = 'rw-setup-wizard';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(4,2,10,.92);display:flex;align-items:center;justify-content:center;z-index:99995;backdrop-filter:blur(18px)';
  el.innerHTML = `
    <div style="background:linear-gradient(160deg,#100a1e,#07040f);border:1px solid rgba(139,92,246,.22);border-radius:20px;padding:32px 36px;max-width:460px;width:92%;position:relative">
      
      <!-- X button — always visible, always works -->
      <button onclick="wizardFinish()" title="Close"
              style="position:absolute;top:14px;right:16px;width:32px;height:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:rgba(255,255,255,.5);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.12s">✕</button>

      <!-- Steps dots -->
      <div style="display:flex;gap:6px;margin-bottom:24px;justify-content:center">
        <div id="rw-dot-1" style="width:28px;height:6px;border-radius:3px;background:#8b5cf6;transition:.25s"></div>
        <div id="rw-dot-2" style="width:8px;height:6px;border-radius:3px;background:rgba(255,255,255,.1);transition:.25s"></div>
      </div>

      <!-- Step 1 -->
      <div id="rw-step1">
        <div style="font-size:2.2rem;text-align:center;margin-bottom:10px">⬡</div>
        <div style="font-size:1.25rem;font-weight:900;color:#f0eaff;text-align:center;margin-bottom:6px">Welcome to RAWagon</div>
        <div style="font-size:.78rem;color:#5a4a7a;text-align:center;line-height:1.7;margin-bottom:20px">
          Live card breaks, pawn management, vehicle titles, gold tokens, and DeFi — on one network.
        </div>

        <div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:12px;padding:16px;margin-bottom:14px">
          <div style="font-size:.66rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Step 1 — Wallet (Optional)</div>
          <div style="font-size:.76rem;color:#5a4a7a;margin-bottom:14px;line-height:1.65">
            A wallet unlocks on-chain features: pawn tickets, NFT minting, staking.<br>
            <strong style="color:#7c6a9a">All AI tools work without one.</strong>
          </div>
          <button id="rw-wiz-connect" onclick="wizardConnectWallet()"
                  style="width:100%;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:10px;font-size:.86rem;font-weight:800;cursor:pointer;transition:.12s;display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px">
            <span>🔗</span> Connect Wallet
          </button>
          <div id="rw-wiz-wallet-st" style="margin-top:6px;font-size:.72rem;text-align:center;color:#5a4a7a;min-height:16px"></div>
        </div>

        <!-- Skip — bold and big -->
        <button onclick="wizardGoStep2()"
                style="width:100%;padding:12px;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:700;cursor:pointer;transition:.12s;min-height:46px">
          Skip — continue without wallet →
        </button>
      </div>

      <!-- Step 2 -->
      <div id="rw-step2" style="display:none">
        <div style="font-size:2.2rem;text-align:center;margin-bottom:10px">🤖</div>
        <div style="font-size:1.25rem;font-weight:900;color:#f0eaff;text-align:center;margin-bottom:6px">Enable AI Features</div>
        <div style="font-size:.78rem;color:#5a4a7a;text-align:center;line-height:1.7;margin-bottom:20px">
          Add your Anthropic API key to unlock AI valuations, VIN reports, chat parsing, and film reviews.
        </div>

        <div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:12px;padding:16px;margin-bottom:14px">
          <div style="font-size:.66rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Step 2 — Anthropic API Key (Optional)</div>
          <input id="rw-wiz-key" type="password" placeholder="sk-ant-api03-..."
                 style="width:100%;background:rgba(255,255,255,.05);border:1.5px solid rgba(139,92,246,.2);border-radius:10px;padding:11px 13px;color:#f0eaff;font-size:.84rem;font-family:monospace;outline:none;margin-bottom:8px;min-height:46px;transition:.12s"
                 oninput="var ok=this.value.startsWith('sk-ant-');document.getElementById('rw-wiz-save').disabled=!ok;document.getElementById('rw-wiz-save').style.opacity=ok?'1':'.35'">
          <div style="font-size:.68rem;color:#3d2d5a;margin-bottom:12px;line-height:1.6">
            Free at <a href="https://console.anthropic.com" target="_blank" style="color:#8b5cf6;text-decoration:underline">console.anthropic.com</a> → API Keys. 
            Stored on this device only, never sent to our servers.
          </div>
          <button id="rw-wiz-save" onclick="wizardSaveKey()" disabled
                  style="width:100%;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:10px;font-size:.86rem;font-weight:800;cursor:pointer;opacity:.35;transition:.12s;min-height:46px">
            Save &amp; Finish Setup
          </button>
        </div>

        <!-- Skip — bold and big -->
        <button onclick="wizardFinish()"
                style="width:100%;padding:12px;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:700;cursor:pointer;transition:.12s;min-height:46px">
          Skip — I'll add it later in Settings →
        </button>
      </div>

    </div>`;
  document.body.appendChild(el);
  // Click backdrop to dismiss
  el.addEventListener('click', e => { if (e.target === el) wizardFinish(); });
}

async function wizardConnectWallet() {
  const btn = document.getElementById('rw-wiz-connect');
  const st  = document.getElementById('rw-wiz-wallet-st');
  if (!window.ethereum) {
    // Show wallet options instead of hard-failing
    wizardFinish();
    setTimeout(showWalletOptions, 150);
    return;
  }
  if (btn) { btn.innerHTML = '<span>⏳</span> Connecting…'; btn.disabled = true; }
  const addr = await RWWallet.connect();
  if (addr) {
    if (st) { st.textContent = '✓ Connected: ' + addr.slice(0,10)+'…'+addr.slice(-4); st.style.color = '#34d399'; }
    if (btn) { btn.innerHTML = '✓ Wallet connected'; btn.style.background = '#10b981'; }
    setTimeout(wizardGoStep2, 600);
  } else {
    if (btn) { btn.innerHTML = '<span>🔗</span> Connect Wallet'; btn.disabled = false; }
  }
}

function wizardGoStep2() {
  document.getElementById('rw-step1').style.display = 'none';
  document.getElementById('rw-step2').style.display = 'block';
  document.getElementById('rw-dot-1').style.background = '#34d399';
  document.getElementById('rw-dot-1').style.width = '8px';
  document.getElementById('rw-dot-2').style.background = '#8b5cf6';
  document.getElementById('rw-dot-2').style.width = '28px';
  document.getElementById('rw-wiz-key')?.focus();
}

function wizardSaveKey() {
  const key = document.getElementById('rw-wiz-key')?.value?.trim();
  if (!key?.startsWith('sk-ant-')) { rwToast('Enter a valid key (starts with sk-ant-)', true); return; }
  localStorage.setItem('rawagon-anthropic-key', key);
  localStorage.setItem('dtr-anthropic', key);
  wizardFinish();
  rwToast('API key saved — all AI features unlocked ✓');
}

function wizardFinish() {
  localStorage.setItem(SETUP_KEY, '1');
  const el = document.getElementById('rw-setup-wizard');
  if (el) { el.style.opacity='0'; el.style.transition='opacity .25s'; setTimeout(()=>el.remove(),250); }
}

function _closeById(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Intercept raw alert("Connect wallet") ────────────────────────────────
const _nativeAlert = window.alert.bind(window);
window.alert = function(msg) {
  const m = String(msg||'').toLowerCase();
  if (m.includes('connect wallet') || m.includes('wallet first') || m.includes('install metamask')) {
    if (!window.ethereum) showWalletOptions();
    else rwToast(msg, true);
    return;
  }
  _nativeAlert(msg);
};

// ── Public API ────────────────────────────────────────────────────────────
window.RWOnboard = { showSetupWizard, showWalletOptions, wizardFinish };

})();
