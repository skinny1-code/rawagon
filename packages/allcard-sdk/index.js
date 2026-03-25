
// ── CardVault ABI (Droppa physical card digitization) ─────────────────────
const CARD_VAULT_ABI = [
  "function submitIntake(bytes32 cardHash, uint256 estimatedValue) returns (uint256)",
  "function getIntakeRequests(address submitter) view returns (uint256[])",
  "function intakeFee() view returns (uint256)",
  "function monthlyFee() view returns (uint256)",
  "function redemptionFee() view returns (uint256)",
  "function getOwnerTokens(address) view returns (uint256[])",
  "function cards(uint256) view returns (uint256,address,bytes32,string,uint8,uint16,uint256,uint256,uint256,uint256,uint8,string,bytes32)",
  "function requestRedemption(uint256 tokenId, bytes32 shippingAddrHash)",
  "function totalVaulted() view returns (uint256)",
  "function totalRedeemed() view returns (uint256)",
];

'use strict';
/**
 * @rawagon/allcard-sdk
 * AllCard sovereign identity card SDK
 * Shifting PAN, ZK credential proofs, multi-mode switching
 * Patent pending: RAW-2026-PROV-001
 */
const crypto = require('crypto');
const zk = require('../zk-identity');

const MODES = {
  identity:   { prefix: '4532', network: 'Visa', emoji: '🪪' },
  debit:      { prefix: '5412', network: 'Mastercard', emoji: '💳' },
  crypto:     { prefix: '4111', network: 'Visa', emoji: '₿' },
  health:     { prefix: '3714', network: 'Amex', emoji: '🏥' },
  vehicle:    { prefix: '6011', network: 'Discover', emoji: '🚗' },
  gov:        { prefix: '3782', network: 'Amex', emoji: '🏛' },
  badge:      { prefix: '5105', network: 'Mastercard', emoji: '🪖' },
  retirement: { prefix: '4000', network: 'Visa', emoji: '🏦' },
};

class AllCard {
  constructor(masterKeyHex) {
    if (!masterKeyHex) masterKeyHex = zk.genKey();
    this.masterKey = masterKeyHex;
    this._nonce    = 0;
    this._mode     = 'identity';
  }

  /** Get current payment PAN (shifts each call) */
  shift(mode = this._mode) {
    const modeKey = crypto
      .createHmac('sha256', Buffer.from(this.masterKey, 'hex'))
      .update(Buffer.from(mode)).digest('hex');
    const pan = zk.derivePAN(modeKey, this._nonce++);
    const cfg = MODES[mode] || MODES.identity;
    return {
      pan:      pan.pan,
      mode,
      network:  cfg.network,
      emoji:    cfg.emoji,
      nonce:    this._nonce - 1,
      expires:  `${new Date().getFullYear() + 3}/${String(new Date().getMonth() + 1).padStart(2,'0')}`,
      cvv:      this._cvv(modeKey, this._nonce),
      path:     pan.path,
    };
  }

  /** Switch active mode */
  switchMode(mode) {
    if (!MODES[mode]) throw new Error(`Unknown mode: ${mode}. Valid: ${Object.keys(MODES).join(', ')}`);
    this._mode = mode;
    return this;
  }

  /** Generate ZK proof for a set of credential attributes */
  prove(attrs) {
    return zk.prove(attrs, this.masterKey);
  }

  /** Generate commitment for on-chain storage (EmployeeVault, etc.) */
  commit(attrs) {
    return zk.commit(attrs, this.masterKey);
  }

  /** Verify a proof against stored commitment */
  verify(proof, commitment) {
    return zk.verify(proof, commitment);
  }

  /** Encrypt PII to vault (never leaves device) */
  encryptVault(data) {
    return zk.encrypt(data, this.masterKey);
  }

  /** Decrypt vault */
  decryptVault(encrypted) {
    return zk.decrypt(encrypted, this.masterKey);
  }

  /** Derive AuraMe biometric key */
  static fromBiometrics(biometricVector, salt) {
    const { masterKey } = zk.bioDerive(biometricVector, salt);
    return new AllCard(masterKey);
  }

  /** Get list of available modes */
  static getModes() { return MODES; }

  /** Internal CVV derivation */
  _cvv(modeKey, nonce) {
    const h = crypto.createHmac('sha256', Buffer.from(modeKey, 'hex'))
      .update(Buffer.from('cvv:' + nonce)).digest();
    return String(parseInt(h.slice(0,2).toString('hex'), 16) % 1000).padStart(3, '0');
  }

  /** Payment record — what merchant receives (no PII) */
  paymentRecord(amount, currency = 'USDC') {
    const card = this.shift();
    const proof = this.prove({ payment_auth: true, amount_gte: 0 });
    return {
      pan_masked:   card.pan.slice(0,4) + ' **** **** ' + card.pan.slice(-4),
      commitment:   proof.commitment,
      proof_hash:   proof.proof,
      amount,
      currency,
      network:      card.network,
      timestamp:    Date.now(),
      gas_cost_usd: 0.0000082,
      chain:        'RAWNet',
      chain_id:     720701,
    };
  }
}

// WAGON wallet integration
function createWAGONPayment(wagonfromAddress, toAddress, amount, token = 'USDC') {
  return {
    from:     wagonfromAddress,
    to:       toAddress,
    amount,
    token,
    chainId:  720701,
    gasPrice: '60',    // 60 wei = 0.00006 Gwei
    gas:      65000,
    data:     '0x',
    network:  'RAWNet Testnet',
    estimatedCostUSD: 0.0000082,
  };
}

module.exports = { AllCard, MODES, CARD_VAULT_ABI, createWAGONPayment };
