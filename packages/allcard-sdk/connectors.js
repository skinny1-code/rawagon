/**
 * 1.nce :: connectors/connectors.js
 * Service Connectors
 *
 * 1.nce connects to every service you use.
 * Each connector knows exactly what data it can read/write.
 * YOU control which connectors are active.
 *
 * Connector types:
 *   FINANCIAL    → Banks, credit cards, investment accounts
 *   GOVERNMENT   → DMV, IRS, Social Security, passport office
 *   INSURANCE    → Auto, health, home, life
 *   AUTOMOTIVE   → Car dealers, repair shops, registration
 *   HEALTHCARE   → Hospitals, pharmacies, insurance
 *   UTILITIES    → Electric, water, internet
 *   COMMERCE     → Amazon, eBay, retail accounts
 *   IDENTITY     → CLEAR, TSA PreCheck, background checks
 */

const { v4: uuidv4 } = require('uuid');
const { OnceCredential, CredentialType } = require('../core/identity');

// ─────────────────────────────────────────────
// BASE CONNECTOR
// ─────────────────────────────────────────────
class BaseConnector {
  constructor({ id, name, category, logoUrl, description, requiredScopes }) {
    this.id             = id;
    this.name           = name;
    this.category       = category;
    this.logoUrl        = logoUrl;
    this.description    = description;
    this.requiredScopes = requiredScopes ?? [];
    this.connected      = false;
    this.lastSync       = null;
    this.credentials    = [];  // what this connector can issue
    this.error          = null;
  }

  async connect(authToken) {
    // Override in subclass
    this.connected = true;
    return { success: true };
  }

  async sync(identity, vault) {
    // Override in subclass
    this.lastSync = Date.now();
    return { synced: 0 };
  }

  async disconnect() {
    this.connected = false;
    return { success: true };
  }
}

// ─────────────────────────────────────────────
// DMV CONNECTOR
// ─────────────────────────────────────────────
class DMVConnector extends BaseConnector {
  constructor(stateCode = 'FL') {
    super({
      id:          `dmv-${stateCode.toLowerCase()}`,
      name:        `${stateCode} DMV`,
      category:    'government',
      description: 'Driver\'s license, vehicle registration, title records',
      requiredScopes: ['government.driving', 'vehicle.registration'],
    });
    this.stateCode = stateCode;
    this.mockData  = this._generateMockDMVData();
  }

  _generateMockDMVData() {
    return {
      license: {
        number:      'FL-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
        class:       'E',
        restrictions: [],
        expiresAt:   Date.now() + 4 * 365 * 24 * 3600 * 1000,
        issuedAt:    Date.now() - 2 * 365 * 24 * 3600 * 1000,
        valid:       true,
        address:     '123 Main St, Tampa, FL 33601',
        dob:         '1990-05-15',
      },
      vehicles: [
        {
          vin:        '1HGCM82633A123456',
          year:       2023,
          make:       'Honda',
          model:      'Accord',
          color:      'Silver',
          plate:      'ABC1234',
          regExpires: Date.now() + 180 * 24 * 3600 * 1000,
          title:      'CLEAN',
          owner:      'PRIMARY',
          liens:      [],
        }
      ],
    };
  }

  async connect(credentials) {
    // In production: OAuth with state DMV portal
    this.connected = true;
    return { success: true, portal: `${this.stateCode}dmv.gov` };
  }

  async sync(identity, vault) {
    const data   = this.mockData;
    const synced = [];

    // Issue drivers license credential
    const licenseValid = new OnceCredential({
      type:     CredentialType.LICENSE_VALID,
      value:    data.license.valid,
      issuer:   `dmv.${this.stateCode.toLowerCase()}.gov`,
      expiresAt: data.license.expiresAt,
    });
    identity.addCredential(licenseValid);
    synced.push('license_valid');

    // Store full license in vault
    vault.store({
      category: 'document',
      label:    `${this.stateCode} Driver\'s License`,
      data:     data.license,
      tags:     ['driving', 'government', 'id'],
      source:   this.id,
    });

    // Issue vehicle ownership credential for each vehicle
    for (const vehicle of data.vehicles) {
      const vehicleOwner = new OnceCredential({
        type:     CredentialType.VEHICLE_OWNER,
        value:    vehicle.vin,
        issuer:   `dmv.${this.stateCode.toLowerCase()}.gov`,
        metadata: { year: vehicle.year, make: vehicle.make, model: vehicle.model },
      });
      identity.addCredential(vehicleOwner);

      vault.store({
        category: 'document',
        label:    `${vehicle.year} ${vehicle.make} ${vehicle.model} Registration`,
        data:     vehicle,
        tags:     ['vehicle', 'registration', vehicle.make.toLowerCase()],
        source:   this.id,
      });
      synced.push(`vehicle:${vehicle.vin}`);
    }

    this.lastSync = Date.now();
    return { synced: synced.length, credentials: synced };
  }

  // Renew vehicle registration directly through 1.nce
  async renewRegistration(vin, paymentToken) {
    const vehicle = this.mockData.vehicles.find(v => v.vin === vin);
    if (!vehicle) return { success: false, reason: 'VEHICLE_NOT_FOUND' };

    const confirmationNumber = 'REG-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    vehicle.regExpires = Date.now() + 365 * 24 * 3600 * 1000;

    return {
      success:      true,
      vin,
      plate:        vehicle.plate,
      newExpiry:    new Date(vehicle.regExpires).toISOString(),
      confirmation: confirmationNumber,
      fee:          '$84.25',
      paid:         true,
      // Decal mailed to address on file
    };
  }
}

// ─────────────────────────────────────────────
// BANK CONNECTOR (Plaid-style)
// ─────────────────────────────────────────────
class BankConnector extends BaseConnector {
  constructor({ bankName, bankId }) {
    super({
      id:          `bank-${bankId}`,
      name:        bankName,
      category:    'financial',
      description: `${bankName} — checking, savings, credit`,
      requiredScopes: ['finance.read', 'finance.balance'],
    });
    this.bankId   = bankId;
    this.mockData = this._generateMockBankData();
  }

  _generateMockBankData() {
    return {
      accounts: [
        {
          id:        'chk-001',
          type:      'checking',
          name:      'Primary Checking',
          balance:   14250.87,
          available: 14200.00,
          currency:  'USD',
          last4:     '4521',
        },
        {
          id:        'sav-001',
          type:      'savings',
          name:      'High-Yield Savings',
          balance:   52150.00,
          available: 52150.00,
          currency:  'USD',
          last4:     '8832',
        },
      ],
      creditScore: 742,
      annualIncome: 95000,
      employer:     'Acme Corp',
      employedSince: '2019-03-01',
    };
  }

  async connect(credentials) {
    this.connected = true;
    return { success: true, linked: this.mockData.accounts.length + ' accounts' };
  }

  async sync(identity, vault) {
    const data   = this.mockData;
    const synced = [];

    const totalBalance = data.accounts.reduce((s, a) => s + a.balance, 0);

    // Income range credential (proves income bracket, not exact)
    const incomeRange = this._incomeRange(data.annualIncome);
    identity.addCredential(new OnceCredential({
      type:  CredentialType.INCOME_RANGE,
      value: incomeRange,
      issuer: this.id,
    }));
    synced.push('income_range');

    // Credit score credential (proves score ≥ X, not the number)
    identity.addCredential(new OnceCredential({
      type:  CredentialType.CREDIT_SCORE,
      value: data.creditScore,
      issuer: this.id,
    }));
    synced.push('credit_score');

    // Employment credential
    identity.addCredential(new OnceCredential({
      type:  CredentialType.EMPLOYED,
      value: true,
      issuer: this.id,
      metadata: { employer: data.employer, since: data.employedSince },
    }));
    synced.push('employed');

    // Store account details in vault
    vault.store({
      category: 'payment',
      label:    `${this.name} Accounts`,
      data:     data.accounts,
      tags:     ['bank', 'checking', 'savings'],
      source:   this.id,
    });
    synced.push('accounts');

    this.lastSync = Date.now();
    return { synced: synced.length, credentials: synced };
  }

  _incomeRange(income) {
    if (income < 30000)  return 'under_30k';
    if (income < 50000)  return '30k_50k';
    if (income < 75000)  return '50k_75k';
    if (income < 100000) return '75k_100k';
    if (income < 150000) return '100k_150k';
    if (income < 250000) return '150k_250k';
    return 'over_250k';
  }
}

// ─────────────────────────────────────────────
// AUTO INSURANCE CONNECTOR
// ─────────────────────────────────────────────
class InsuranceConnector extends BaseConnector {
  constructor({ insurerName, insurerId }) {
    super({
      id:          `insurance-${insurerId}`,
      name:        insurerName,
      category:    'insurance',
      description: `${insurerName} — auto, home, health`,
      requiredScopes: ['insurance.auto', 'insurance.status'],
    });
    this.insurerId = insurerId;
    this.mockData  = {
      auto: {
        policyNumber: 'AUTO-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        vehicles:     ['1HGCM82633A123456'],
        coverage:     { liability: '100/300/100', collision: true, comprehensive: true },
        expiresAt:    Date.now() + 180 * 24 * 3600 * 1000,
        premium:      { monthly: 127.50, annual: 1530 },
        active:       true,
      }
    };
  }

  async connect(credentials) {
    this.connected = true;
    return { success: true };
  }

  async sync(identity, vault) {
    const policy = this.mockData.auto;
    const synced = [];

    identity.addCredential(new OnceCredential({
      type:      CredentialType.INSURANCE_ACTIVE,
      value:     policy.active,
      issuer:    this.id,
      expiresAt: policy.expiresAt,
      metadata:  { policyNumber: policy.policyNumber },
    }));
    synced.push('insurance_active');

    vault.store({
      category: 'document',
      label:    `${this.name} Auto Insurance`,
      data:     policy,
      tags:     ['insurance', 'auto', 'policy'],
      source:   this.id,
    });
    synced.push('auto_policy');

    this.lastSync = Date.now();
    return { synced: synced.length, credentials: synced };
  }
}

// ─────────────────────────────────────────────
// CAR DEALERSHIP CONNECTOR
// Auto-fills every form when buying a car
// ─────────────────────────────────────────────
class DealershipConnector extends BaseConnector {
  constructor({ dealerName, dealerId }) {
    super({
      id:          `dealer-${dealerId}`,
      name:        dealerName,
      category:    'automotive',
      description: `${dealerName} — vehicle purchase, financing, trade-in`,
      requiredScopes: ['identity.basic', 'finance.credit', 'vehicle.ownership'],
    });
  }

  async connect() { this.connected = true; return { success: true }; }

  // Generate a financing application using 1.nce proofs
  // Dealer gets ONLY what they need — nothing more
  async generateFinancingApplication(identity, vault, vehiclePrice) {
    const proofs = {};

    // Prove income is sufficient (not the exact number)
    const incomeProof = identity.prove(CredentialType.INCOME_RANGE, { op: 'in', values: ['75k_100k', '100k_150k', '150k_250k', 'over_250k'] });
    proofs.incomeRange = incomeProof;

    // Prove credit score >= 680
    const creditProof = identity.prove(CredentialType.CREDIT_SCORE, { op: 'gte', value: 680 });
    proofs.creditScore = creditProof;

    // Prove employment
    const empProof = identity.prove(CredentialType.EMPLOYED, { op: 'bool', value: true });
    proofs.employed = empProof;

    // License is valid
    const licenseProof = identity.prove(CredentialType.LICENSE_VALID, { op: 'bool', value: true });
    proofs.license = licenseProof;

    const allPassed = Object.values(proofs).every(p => p.success);

    return {
      dealerId:    this.id,
      vehiclePrice,
      approved:    allPassed,
      proofs,
      // What dealer DOES NOT get: name, SSN, exact income, exact credit score
      // What dealer DOES get: credit >= 680 ✓, income in range ✓, employed ✓, valid license ✓
      privacyNote: 'Personal data not disclosed. Only pass/fail conditions shared.',
    };
  }

  // Complete vehicle purchase — fills all DMV paperwork
  async purchaseVehicle({ identity, vault, vin, price, tradeInVin, paymentToken }) {
    // Pull existing insurance for the new vehicle
    const insuranceItems = vault.search({ category: 'document', tags: ['insurance', 'auto'] });
    const hasInsurance   = insuranceItems.length > 0;

    // Create bill of sale
    const saleRecord = {
      id:          uuidv4(),
      vin,
      price,
      tradeInVin,
      date:        new Date().toISOString(),
      dealerId:    this.id,
      buyer:       identity.did,  // DID — no personal data
    };

    // File with DMV (simulated)
    const titleTransfer = {
      vin,
      newOwner:    identity.did,
      titleNumber: 'TN-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      filedAt:     new Date().toISOString(),
      status:      'PENDING',  // becomes COMPLETE in 3-5 business days
    };

    // Store in vault
    vault.store({
      category: 'document',
      label:    `Vehicle Purchase — ${vin}`,
      data:     { saleRecord, titleTransfer },
      tags:     ['vehicle', 'purchase', 'title'],
      source:   this.id,
    });

    return {
      success:       true,
      vin,
      saleId:        saleRecord.id,
      titleTransfer,
      nextSteps:     [
        hasInsurance ? '✓ Insurance will auto-update to cover new vehicle' : '⚠ Add vehicle to insurance policy',
        '→ Registration will arrive by mail in 2-3 weeks',
        '→ Title transfer filed with DMV — check 1.nce in 3-5 days',
      ],
    };
  }
}

// ─────────────────────────────────────────────
// CONNECTOR REGISTRY
// ─────────────────────────────────────────────
class ConnectorRegistry {
  constructor() {
    this.connectors = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    // Pre-built connectors
    const defaults = [
      new DMVConnector('FL'),
      new BankConnector({ bankName: 'Bank of America', bankId: 'bofa' }),
      new BankConnector({ bankName: 'Chase',           bankId: 'chase' }),
      new InsuranceConnector({ insurerName: 'Geico',    insurerId: 'geico' }),
      new InsuranceConnector({ insurerName: 'Progressive', insurerId: 'prog' }),
      new DealershipConnector({ dealerName: 'AutoNation', dealerId: 'autonation' }),
      new DealershipConnector({ dealerName: 'Carvana',    dealerId: 'carvana' }),
    ];
    defaults.forEach(c => this.connectors.set(c.id, c));
  }

  get(id)     { return this.connectors.get(id); }
  list()      { return [...this.connectors.values()].map(c => ({ id: c.id, name: c.name, category: c.category, connected: c.connected })); }
  listByCategory(cat) { return this.list().filter(c => c.category === cat); }

  // Sync all connected connectors
  async syncAll(identity, vault) {
    const results = {};
    for (const [id, connector] of this.connectors) {
      if (connector.connected) {
        results[id] = await connector.sync(identity, vault);
      }
    }
    return results;
  }
}

module.exports = { ConnectorRegistry, DMVConnector, BankConnector, InsuranceConnector, DealershipConnector, BaseConnector };

// ── AllCard class (main export) ──────────────────────────────
const crypto = require('crypto');

const MODES = {
  identity:'4532', debit:'5412', crypto:'4111', health:'3714',
  vehicle:'6011',  gov:'3782',   badge:'5105',  retirement:'4000'
};

class AllCard {
  constructor(masterKeyHex) {
    this.key = masterKeyHex || crypto.randomBytes(32).toString('hex');
    this._nonce = 0;
  }

  /** Derive next single-use PAN for a given mode */
  shift(mode = 'identity') {
    const prefix = MODES[mode] || MODES.identity;
    const path = `${mode}:${this._nonce++}`;
    const h = crypto.createHmac('sha256', Buffer.from(this.key,'hex'))
      .update(path).digest();
    const raw = BigInt('0x' + h.slice(0,8).toString('hex'));
    const d = String(raw % 9000000000000000n + 1000000000000000n);
    return {
      pan: `${prefix}${d.slice(4,8)} ${d.slice(8,12)} ${d.slice(12,16)}`,
      mode, nonce: this._nonce - 1, network: 'RAWNet'
    };
  }

  /** Generate ZK commitment for credential set */
  commit(credentials) {
    return '0x' + crypto.createHmac('sha256', Buffer.from(this.key,'hex'))
      .update(JSON.stringify(credentials)).digest('hex');
  }
}

module.exports = { ...module.exports, AllCard, MODES };
