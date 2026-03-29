/**
 * @rawagon/allcard-sdk/wallet-connect
 * Shared MetaMask / EIP-1193 wallet connector for all R3WAGON apps.
 * Zero dependencies — uses window.ethereum directly.
 *
 * Usage in any app:
 *   <script src="../../packages/allcard-sdk/wallet-connect.js"></script>
 *   const wc = new R3WAGONWallet();
 *   await wc.connect();
 *
 * Or import in Node/bundler:
 *   const { RAWagonWallet } = require("@rawagon/allcard-sdk/wallet-connect");
 */

const CHAINS = {
  base_sepolia: {
    chainId:    "0x14A34",   // 84532
    chainName:  "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls:         ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
  },
  base: {
    chainId:    "0x2105",   // 8453
    chainName:  "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls:         ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
  rawnet_testnet: {
    chainId:    "0xAFD3D",  // 720701
    chainName:  "R3NET Testnet",
    nativeCurrency: { name: "RAW Ether", symbol: "rETH", decimals: 18 },
    rpcUrls:         ["http://10.117.122.142:8545"],
    blockExplorerUrls: ["http://localhost:3000"],
  },
};

class R3WAGONWallet {
  constructor(targetNetwork = "rawnet_testnet") {
    this.targetNetwork = targetNetwork;
    this.address     = null;
    this.chainId     = null;
    this.provider    = null;
    this._listeners  = {};
  }

  /** Connect wallet — prompts MetaMask, switches to correct chain */
  async connect() {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask not found. Install MetaMask or use a Web3 browser.");
    }

    this.provider = window.ethereum;

    // Request accounts
    const accounts = await this.provider.request({ method: "eth_requestAccounts" });
    this.address = accounts[0];

    // Get current chain
    const chainId = await this.provider.request({ method: "eth_chainId" });
    this.chainId = parseInt(chainId, 16);

    // Switch to target chain if needed
    const target = CHAINS[this.targetNetwork];
    if (target && "0x" + this.chainId.toString(16) !== target.chainId.toLowerCase()) {
      await this._switchChain(target);
    }

    // Set up listeners
    this.provider.on("accountsChanged", (accs) => {
      this.address = accs[0] || null;
      this._emit("accountsChanged", this.address);
    });
    this.provider.on("chainChanged", (cId) => {
      this.chainId = parseInt(cId, 16);
      this._emit("chainChanged", this.chainId);
    });

    return { address: this.address, chainId: this.chainId };
  }

  /** Switch to target chain, adding it if not present */
  async _switchChain(chainConfig) {
    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainConfig.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        // Chain not added — add it
        await this.provider.request({
          method: "wallet_addEthereumChain",
          params: [chainConfig],
        });
      } else {
        throw err;
      }
    }
    this.chainId = parseInt(chainConfig.chainId, 16);
  }

  /** Sign a message (for ZK proof attestation) */
  async signMessage(message) {
    if (!this.address) throw new Error("Not connected");
    return this.provider.request({
      method: "personal_sign",
      params: [message, this.address],
    });
  }

  /** Send a transaction */
  async sendTx({ to, data = "0x", value = "0x0", gasLimit }) {
    if (!this.address) throw new Error("Not connected");
    const params = { from: this.address, to, data, value };
    if (gasLimit) params.gas = "0x" + gasLimit.toString(16);
    return this.provider.request({ method: "eth_sendTransaction", params: [params] });
  }

  /** Call a read-only contract function via eth_call */
  async call({ to, data }) {
    return this.provider.request({
      method: "eth_call",
      params: [{ to, data }, "latest"],
    });
  }

  /** Get ETH balance */
  async getBalance(address) {
    const hex = await this.provider.request({
      method: "eth_getBalance",
      params: [address || this.address, "latest"],
    });
    return parseInt(hex, 16) / 1e18;
  }

  /** Disconnect (clears local state — MetaMask doesn't support true disconnect) */
  disconnect() {
    this.address  = null;
    this.chainId  = null;
    this.provider = null;
    this._emit("disconnected", null);
  }

  isConnected() { return !!this.address; }

  // Simple event emitter
  on(event, fn)       { (this._listeners[event] = this._listeners[event] || []).push(fn); }
  off(event, fn)      { this._listeners[event] = (this._listeners[event] || []).filter(f => f !== fn); }
  _emit(event, data)  { (this._listeners[event] || []).forEach(fn => fn(data)); }

  /** Render a connect button into a DOM element */
  renderButton(containerId, opts = {}) {
    if (typeof document === "undefined") return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const btn = document.createElement("button");
    btn.id = "rawagon-connect-btn";
    btn.style.cssText = `
      padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(0,212,255,.3);
      background: rgba(0,212,255,.1); color: #00d4ff; font-size: 14px; font-weight: 700;
      cursor: pointer; font-family: inherit; transition: all .15s;
      display: flex; align-items: center; gap: 8px;
    `;
    btn.innerHTML = '🦊 Connect Wallet';
    btn.onmouseenter = () => btn.style.background = "rgba(0,212,255,.2)";
    btn.onmouseleave = () => btn.style.background = "rgba(0,212,255,.1)";

    const statusEl = document.createElement("div");
    statusEl.id = "rawagon-wallet-status";
    statusEl.style.cssText = "font-size: 12px; color: #8080aa; margin-top: 6px; font-family: monospace;";

    const update = () => {
      if (this.address) {
        btn.innerHTML = `✓ ${this.address.slice(0,6)}...${this.address.slice(-4)}`;
        btn.style.borderColor = "rgba(16,185,129,.4)";
        btn.style.color = "#10b981";
        statusEl.textContent = `Chain: ${this.chainId} · ${opts.networkLabel || this.targetNetwork}`;
      } else {
        btn.innerHTML = "🦊 Connect Wallet";
        btn.style.borderColor = "rgba(0,212,255,.3)";
        btn.style.color = "#00d4ff";
        statusEl.textContent = "";
      }
    };

    btn.onclick = async () => {
      try {
        btn.innerHTML = "Connecting...";
        btn.disabled = true;
        await this.connect();
        update();
        if (opts.onConnect) opts.onConnect(this.address, this.chainId);
      } catch (e) {
        btn.innerHTML = "🦊 Connect Wallet";
        statusEl.textContent = "Error: " + e.message;
        statusEl.style.color = "#ef4444";
      } finally {
        btn.disabled = false;
      }
    };

    this.on("accountsChanged", update);
    this.on("chainChanged", update);

    container.appendChild(btn);
    container.appendChild(statusEl);
    return btn;
  }
}

// Make available globally in browser AND as CommonJS module
if (typeof window !== "undefined") window.R3WAGONWallet = R3WAGONWallet;
if (typeof module !== "undefined") module.exports = { R3WAGONWallet, CHAINS };
