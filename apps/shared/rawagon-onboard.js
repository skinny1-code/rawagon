/**
 * RAWagon Onboarding + Wallet UX
 * ────────────────────────────────────────────────────────────
 * Drop this <script src="/apps/shared/rawagon-onboard.js">
 * into any app to get:
 *   - First-run setup wizard (wallet + API key in 2 steps)
 *   - Graceful wallet-connect with helpful errors (no alert())
 *   - MetaMask install guide if not detected
 *   - All alert("Connect wallet") replaced with inline toast
 *   - Shared wallet state via RAWNet SDK
 */
(function () {
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const CHAIN = {
  chainId:       '0xAFF1D',          // 720701 decimal
  chainName:     'RAWNet Testnet',
  nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 },
  rpcUrls:       ['http://10.117.122.142:8545','http://localhost:8545'],
  blockExplorerUrls: ['http://10.117.122.142:3000'],
};
const SETUP_DONE_KEY = 'rawagon-setup-done';
const WALLET_KEY     = 'rawagon-wallet';

// ── Shared toast (works even if app hasn't loaded its own) ─────────────────
function rwToast(msg, isErr) {
  // Use app's toast() if available
  if (typeof window.toast === 'function') { window.toast(msg, isErr); return; }
  if (typeof window.showToast === 'function') { window.showToast(msg, isErr); return; }
  // Fallback: inject minimal toast
  let el = document.getElementById('rw-shared-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rw-shared-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:#160d22;border:1px solid #8b5cf6;color:#f0eaff;padding:10px 20px;border-radius:10px;font-size:.8rem;font-weight:600;z-index:99999;opacity:0;transition:.2s;pointer-events:none;white-space:nowrap;max-width:90vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.borderColor = isErr ? '#f87171' : '#8b5cf6';
  el.style.color = isErr ? '#f87171' : '#f0eaff';
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
  }, 3000);
}

// ── Wallet connect (shared, clean, no alert()) ─────────────────────────────
window.RWWallet = {
  addr:   null,
  signer: null,

  async connect() {
    if (!window.ethereum) {
      showMetaMaskGuide();
      return null;
    }
    const btn = document.querySelector('[data-rw-connect]') ||
                document.getElementById('connect-btn') ||
                document.getElementById('rwc-btn-wrap')?.querySelector('button');
    if (btn) { btn.textContent = 'Connecting…'; btn.disabled = true; }
    try {
      // Add RAWNet chain
      await window.ethereum.request({ method:'wallet_addEthereumChain', params:[CHAIN] }).catch(()=>{});
      await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:CHAIN.chainId}] }).catch(()=>{});
      const accounts = await window.ethereum.request({ method:'eth_requestAccounts' });
      const addr = accounts[0];
      if (!addr) throw new Error('No accounts returned');
      this.addr = addr;
      // Save to shared state
      localStorage.setItem(WALLET_KEY, JSON.stringify({ address: addr, chainId: 720701, ts: Date.now() }));
      if (window.RAWNet) RAWNet.setWallet(addr, 720701);
      document.dispatchEvent(new CustomEvent('rawagon:connected', { detail: { address: addr } }));
      rwToast('Wallet connected ✓');
      updateAllConnectBtns(addr);
      return addr;
    } catch(e) {
      const msg = e.code === 4001 ? 'Connection cancelled' :
                  e.code === -32002 ? 'MetaMask already open — check your browser' :
                  e.message?.includes('already pending') ? 'MetaMask already open' :
                  'Connection failed: ' + (e.message || 'unknown error');
      rwToast(msg, true);
      if (btn) { btn.textContent = '🦊 Connect'; btn.disabled = false; }
      return null;
    }
  },

  getAddr() {
    if (this.addr) return this.addr;
    try {
      const saved = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null');
      if (saved?.address) { this.addr = saved.address; return saved.address; }
    } catch {}
    return null;
  },

  isConnected() { return !!this.getAddr(); },
};

function updateAllConnectBtns(addr) {
  const short = addr ? addr.slice(0,6) + '…' + addr.slice(-4) : null;
  document.querySelectorAll('[data-rw-connect], #connect-btn').forEach(btn => {
    if (!btn) return;
    if (addr) {
      btn.textContent = '✓ ' + short;
      btn.classList.add('connected','on');
      btn.style.borderColor = 'rgba(52,211,153,.4)';
      btn.style.color = '#34d399';
    } else {
      btn.textContent = '🦊 Connect';
      btn.classList.remove('connected','on');
    }
  });
}

// Restore wallet on load
(function restoreWallet() {
  const saved = RWWallet.getAddr();
  if (saved) {
    RWWallet.addr = saved;
    updateAllConnectBtns(saved);
  }
})();

// Auto-wire all connect buttons
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-rw-connect], #connect-btn').forEach(btn => {
    btn.addEventListener('click', () => RWWallet.connect());
  });
  // Check if first run
  const setupDone   = localStorage.getItem(SETUP_DONE_KEY);
  const hasWallet   = !!RWWallet.getAddr();
  const hasKey      = !!(localStorage.getItem('rawagon-anthropic-key') || localStorage.getItem('dtr-anthropic'));
  if (!setupDone && !hasWallet && !hasKey) {
    setTimeout(() => showSetupWizard(), 800);
  }
});

// ── MetaMask install guide ─────────────────────────────────────────────────
function showMetaMaskGuide() {
  const existing = document.getElementById('rw-mm-guide');
  if (existing) { existing.style.display = 'flex'; return; }

  const el = document.createElement('div');
  el.id = 'rw-mm-guide';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(4,2,10,.92);display:flex;align-items:center;justify-content:center;z-index:99990;backdrop-filter:blur(12px)';
  el.innerHTML = `
    <div style="background:#160d22;border:1px solid rgba(139,92,246,.3);border-radius:16px;padding:32px 36px;max-width:440px;width:90%;text-align:center">
      <div style="font-size:3rem;margin-bottom:12px">🦊</div>
      <div style="font-size:1.1rem;font-weight:800;color:#f0eaff;margin-bottom:8px">MetaMask Required</div>
      <div style="font-size:.82rem;color:#7c6a9a;line-height:1.7;margin-bottom:20px">
        RAWagon uses MetaMask to connect to RAWNet Testnet. It's a free browser extension that takes 2 minutes to set up.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        <a href="https://metamask.io/download" target="_blank" rel="noopener"
           style="display:block;padding:11px 20px;background:#f6851b;color:#fff;border-radius:9px;font-weight:800;font-size:.88rem;text-decoration:none">
          Install MetaMask ↗
        </a>
        <div style="font-size:.72rem;color:#5a4a7a">After installing, refresh this page and connect</div>
      </div>
      <div style="padding:12px;background:rgba(255,255,255,.03);border-radius:8px;font-size:.74rem;color:#5a4a7a;margin-bottom:16px">
        <strong style="color:#7c6a9a">No wallet?</strong> You can still use most AI features without connecting. Only on-chain actions (minting, staking, tickets) require MetaMask.
      </div>
      <button onclick="document.getElementById('rw-mm-guide').style.display='none'"
              style="padding:8px 20px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#7c6a9a;border-radius:8px;cursor:pointer;font-size:.78rem">
        Continue without wallet
      </button>
    </div>`;
  document.body.appendChild(el);
}

// ── First-run setup wizard ─────────────────────────────────────────────────
function showSetupWizard() {
  if (document.getElementById('rw-setup-wizard')) return;

  const el = document.createElement('div');
  el.id = 'rw-setup-wizard';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(4,2,10,.95);display:flex;align-items:center;justify-content:center;z-index:99995;backdrop-filter:blur(16px)';
  el.innerHTML = `
    <div style="background:linear-gradient(160deg,#0c0716,#07040f);border:1px solid rgba(139,92,246,.25);border-radius:20px;padding:36px 40px;max-width:480px;width:92%;position:relative">

      <!-- Step indicators -->
      <div style="display:flex;gap:6px;margin-bottom:28px;justify-content:center" id="rw-setup-steps">
        <div id="rw-step-dot-1" style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;transition:.2s"></div>
        <div id="rw-step-dot-2" style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.1);transition:.2s"></div>
      </div>

      <!-- Step 1: Welcome + wallet -->
      <div id="rw-setup-step1">
        <div style="font-size:2rem;text-align:center;margin-bottom:10px">⬡</div>
        <div style="font-size:1.3rem;font-weight:900;color:#f0eaff;text-align:center;margin-bottom:8px">Welcome to RAWagon</div>
        <div style="font-size:.82rem;color:#7c6a9a;text-align:center;line-height:1.7;margin-bottom:24px">
          Network OS for live card breaks, gold pawning, vehicle titles, and DeFi payments. Let's get you set up in 2 steps.
        </div>

        <div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:10px;padding:14px 16px;margin-bottom:16px">
          <div style="font-size:.72rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Step 1 of 2 — Connect Wallet</div>
          <div style="font-size:.78rem;color:#7c6a9a;margin-bottom:12px;line-height:1.6">Connects to RAWNet Testnet (chainId 720701). Required for on-chain features like staking, pawn tickets, and NFT minting.</div>
          <button id="rw-wizard-connect" onclick="wizardConnectWallet()"
                  style="width:100%;padding:11px;background:#8b5cf6;color:#fff;border:none;border-radius:9px;font-size:.85rem;font-weight:800;cursor:pointer;transition:.12s;display:flex;align-items:center;justify-content:center;gap:8px">
            <span>🦊</span> Connect MetaMask
          </button>
          <div id="rw-wizard-wallet-status" style="margin-top:8px;font-size:.72rem;text-align:center;color:#5a4a7a;min-height:16px"></div>
          <div style="margin-top:10px;text-align:center">
            <span onclick="wizardSkipWallet()" style="font-size:.72rem;color:#3d2d5a;cursor:pointer;text-decoration:underline">Skip for now — use AI features without wallet</span>
          </div>
        </div>
      </div>

      <!-- Step 2: API Key -->
      <div id="rw-setup-step2" style="display:none">
        <div style="font-size:2rem;text-align:center;margin-bottom:10px">🤖</div>
        <div style="font-size:1.2rem;font-weight:900;color:#f0eaff;text-align:center;margin-bottom:8px">Enable AI Features</div>
        <div style="font-size:.82rem;color:#7c6a9a;text-align:center;line-height:1.7;margin-bottom:20px">
          Add your Anthropic API key to unlock AI valuations, VIN reports, break co-hosting, chat parsing, and more.
        </div>

        <div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:10px;padding:14px 16px;margin-bottom:16px">
          <div style="font-size:.72rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Step 2 of 2 — Anthropic API Key</div>
          <input id="rw-wizard-key" type="password" placeholder="sk-ant-..."
                 style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(139,92,246,.2);border-radius:8px;padding:10px 12px;color:#f0eaff;font-size:.82rem;font-family:monospace;outline:none;margin-bottom:8px"
                 oninput="document.getElementById('rw-wizard-save-btn').disabled=!this.value.startsWith('sk-ant-')">
          <div style="font-size:.68rem;color:#3d2d5a;margin-bottom:10px">
            Get a free key at <a href="https://console.anthropic.com" target="_blank" style="color:#8b5cf6">console.anthropic.com</a> → API Keys. Key stored locally only, never sent to our servers.
          </div>
          <button id="rw-wizard-save-btn" onclick="wizardSaveKey()" disabled
                  style="width:100%;padding:11px;background:#8b5cf6;color:#fff;border:none;border-radius:9px;font-size:.85rem;font-weight:800;cursor:pointer;transition:.12s;opacity:.4">
            Save Key &amp; Finish Setup
          </button>
          <div style="margin-top:10px;text-align:center">
            <span onclick="wizardFinish()" style="font-size:.72rem;color:#3d2d5a;cursor:pointer;text-decoration:underline">Skip — I'll add it later in Settings</span>
          </div>
        </div>
      </div>

    </div>`;

  document.body.appendChild(el);
}

async function wizardConnectWallet() {
  const btn = document.getElementById('rw-wizard-connect');
  const status = document.getElementById('rw-wizard-wallet-status');
  if (btn) { btn.textContent = 'Connecting…'; btn.disabled = true; }
  const addr = await RWWallet.connect();
  if (addr) {
    if (status) {
      status.textContent = '✓ Connected: ' + addr.slice(0,8) + '…' + addr.slice(-4);
      status.style.color = '#34d399';
    }
    if (btn) { btn.textContent = '✓ Connected'; btn.style.background = '#10b981'; }
    setTimeout(() => wizardGoStep2(), 700);
  } else {
    if (btn) { btn.textContent = '🦊 Connect MetaMask'; btn.disabled = false; }
  }
}

function wizardSkipWallet() { wizardGoStep2(); }

function wizardGoStep2() {
  document.getElementById('rw-setup-step1').style.display = 'none';
  document.getElementById('rw-setup-step2').style.display = 'block';
  document.getElementById('rw-step-dot-1').style.background = '#34d399';
  document.getElementById('rw-step-dot-2').style.background = '#8b5cf6';
  document.getElementById('rw-wizard-key')?.focus();
}

function wizardSaveKey() {
  const key = document.getElementById('rw-wizard-key')?.value?.trim();
  if (!key?.startsWith('sk-ant-')) { rwToast('Enter a valid Anthropic key (starts with sk-ant-)', true); return; }
  localStorage.setItem('rawagon-anthropic-key', key);
  localStorage.setItem('dtr-anthropic', key);
  wizardFinish();
  rwToast('API key saved — all AI features unlocked ✓');
}

function wizardFinish() {
  localStorage.setItem(SETUP_DONE_KEY, '1');
  const el = document.getElementById('rw-setup-wizard');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }
}

// ── Intercept alert("Connect wallet") calls globally ──────────────────────
// Store original alert
const _nativeAlert = window.alert.bind(window);
window.alert = function(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('connect wallet') || m.includes('metamask') || m.includes('install')) {
    if (!window.ethereum) { showMetaMaskGuide(); }
    else { rwToast(msg, true); }
    return;
  }
  // Pass through real alerts
  _nativeAlert(msg);
};

// ── Expose globally ────────────────────────────────────────────────────────
window.RWOnboard = { showSetupWizard, showMetaMaskGuide, wizardFinish };

})();
