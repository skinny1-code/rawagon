/**
 * @rawagon/migration-sdk
 * Migrate businesses from Stripe, Square, PayPal, or any card processor to QWKS.
 * Handles: rate verification, onboarding flow, smart contract registration,
 *          AllCard setup, legacy system bridge, ROI reporting.
 *
 * Usage:
 *   const m = new QWKSMigration({ processor: 'stripe', monthlyVolume: 50000 });
 *   const plan = await m.generateMigrationPlan();
 *   await m.execute(plan);
 */
'use strict';

const { savings, transition } = require('../fee-distributor');

// Supported legacy processors with their typical fee structures
const PROCESSOR_PROFILES = {
  stripe:  { name: 'Stripe',        rateBps: 320, hasMDR: true,  hasMonthly: false },
  square:  { name: 'Square',        rateBps: 270, hasMDR: true,  hasMonthly: false },
  paypal:  { name: 'PayPal',        rateBps: 349, hasMDR: true,  hasMonthly: false },
  visa:    { name: 'Visa/MC',       rateBps: 250, hasMDR: true,  hasMonthly: false },
  venmo:   { name: 'Venmo Business',rateBps: 190, hasMDR: true,  hasMonthly: false },
  clover:  { name: 'Clover',        rateBps: 250, hasMDR: true,  hasMonthly: true  },
  toast:   { name: 'Toast',         rateBps: 250, hasMDR: true,  hasMonthly: true  },
  ach:     { name: 'ACH',           rateBps: 50,  hasMDR: false, hasMonthly: false, flatFee: 0.50 },
  wire:    { name: 'Wire Transfer',  rateBps: 0,   hasMDR: false, hasMonthly: false, flatFee: 25.00 },
  custom:  { name: 'Custom',        rateBps: null, hasMDR: true, hasMonthly: false },
};

// Onboarding steps with expected completion time
const ONBOARDING_STEPS = [
  { id: 1, name: 'Create Business Account',      time_min: 3,  required: true },
  { id: 2, name: 'Install Payment Widget',        time_min: 15, required: true },
  { id: 3, name: 'Migrate Employee Records',      time_min: 30, required: false },
  { id: 4, name: 'Issue AllCards to Employees',   time_min: 45, required: false },
  { id: 5, name: 'Configure Customer ZK Flow',    time_min: 55, required: false },
  { id: 6, name: 'Go Live — First Transaction',   time_min: 60, required: true },
];

class QWKSMigration {
  constructor({ processor = 'stripe', monthlyVolume, txPerMonth, businessName, industry, network = 'rawnet_testnet' }) {
    this.processor    = PROCESSOR_PROFILES[processor] || PROCESSOR_PROFILES.custom;
    this.monthlyVol   = monthlyVolume;
    this.txPerMonth   = txPerMonth || Math.ceil(monthlyVolume / 100); // estimate 1 txn per $100
    this.businessName = businessName || 'Business';
    this.industry     = industry || 'retail';
    this.network      = network;
    this.rateBps      = this.processor.rateBps || 250;
    this._startTime   = null;
    this._completedSteps = [];
  }

  /**
   * Generate a full migration plan with savings projections, step-by-step guide,
   * and RAWNet vs Base L2 comparison.
   */
  generateMigrationPlan() {
    const ratePct = this.rateBps / 100;
    const savingsData = savings(this.monthlyVol, this.txPerMonth, ratePct);
    const ltnPerMonth = Math.ceil(this.txPerMonth * 0.001); // 0.001 LTN reward per tx
    const transitionData = transition(savingsData.qwksFee, ltnPerMonth, 0.084);

    // RAWNet vs Base cost comparison
    const baseL2TxCost   = 0.000825;  // $
    const rawnetTxCost   = 0.0000082; // $
    const baseL2Annual   = this.txPerMonth * 12 * baseL2TxCost;
    const rawnetAnnual   = this.txPerMonth * 12 * rawnetTxCost;

    return {
      business: {
        name: this.businessName,
        industry: this.industry,
        monthlyVolume: this.monthlyVol,
        txPerMonth: this.txPerMonth,
        currentProcessor: this.processor.name,
        currentRatePct: ratePct,
      },
      savings: {
        ...savingsData,
        fiveYear: savingsData.toCustomer * 5,
      },
      network: {
        recommended: 'RAWNet Testnet',
        chainId: 720701,
        rpc: 'https://testnet-rpc.rawnet.io',
        baseL2AnnualCost: parseFloat(baseL2Annual.toFixed(4)),
        rawnetAnnualCost: parseFloat(rawnetAnnual.toFixed(6)),
        rawnetVsBase: Math.round(baseL2TxCost / rawnetTxCost) + 'x cheaper',
        rawnetVsVisa: Math.round((this.monthlyVol * ratePct / 100) / rawnetAnnual * 12) + 'x cheaper than Visa on same volume',
        gasPerTx: rawnetTxCost,
        blockTime: '500ms',
        batchSize: 10000,
      },
      ltn: {
        earnedPerMonth: ltnPerMonth,
        earnedPerYear: ltnPerMonth * 12,
        transitionMonths: transitionData.months,
        transitionYears: transitionData.years,
        ltnNeededForNeutral: transitionData.ltnNeeded,
        description: `You earn ${ltnPerMonth} LTN/month from transactions. After ${transitionData.ltnNeeded.toLocaleString()} LTN accumulated (${transitionData.years} years), staking yield covers your QWKS fee.`,
      },
      steps: ONBOARDING_STEPS.map(s => ({
        ...s,
        status: 'pending',
        estimatedTime: `${s.time_min} minutes`,
      })),
      totalOnboardingTime: '60 minutes',
      trialPeriod: '30 days free, no credit card required',
    };
  }

  /**
   * Execute step N of the migration.
   * Returns status and next action.
   */
  async executeStep(stepId, data = {}) {
    const step = ONBOARDING_STEPS.find(s => s.id === stepId);
    if (!step) throw new Error(`Unknown step: ${stepId}`);

    const result = { stepId, stepName: step.name, status: 'in_progress' };

    switch (stepId) {
      case 1: // Account creation
        result.action = 'POST /api/v1/business/register';
        result.payload = {
          name: this.businessName,
          industry: this.industry,
          monthlyVolume: this.monthlyVol,
          processor: this.processor.name,
          rateBps: this.rateBps,
          network: this.network,
        };
        result.expected = { businessRegistryNFT: '0x...', chainId: 720701, trialDays: 30 };
        break;

      case 2: // Widget install
        result.action = 'Widget snippet to add to checkout page';
        result.snippet = `<script src="https://js.qwks.io/v1/widget.js" data-key="YOUR_BUSINESS_KEY"><\/script>`;
        result.apiEndpoint = 'POST /api/v1/payment/process';
        result.accepts = ['USDC', 'AllCard', 'GTX', 'STX', 'LTN'];
        break;

      case 3: // Employee migration
        result.action = 'Upload employee CSV or connect to existing HR system';
        result.csvFormat = ['first_name', 'last_name', 'email', 'employee_id', 'start_date', 'salary'];
        result.contract = 'EmployeeVault.sol';
        result.note = 'Raw PII encrypted on employee devices. Only commitment hash stored on-chain.';
        break;

      case 4: // AllCard issuance
        result.action = 'Send AllCard enrollment link to each employee';
        result.enrollUrl = 'https://allcard.rawnet.io/enroll?employer=YOUR_REGISTRY_NFT';
        result.payrollCost = `$${(0.0000082 * 12).toFixed(7)}/employee/year (vs $0.50 ACH = ${Math.round(0.50/(0.0000082))}x more expensive)`;
        break;

      case 5: // Customer ZK
        result.action = 'Configure which attributes to verify (age, identity, balance)';
        result.contract = 'CustomerInteraction.sol';
        result.modes = ['identity', 'age_18', 'age_21', 'balance_check', 'kyc_verified'];
        result.note = 'You receive only true/false. No raw customer data stored or transmitted.';
        break;

      case 6: // Go live
        result.action = 'Process test transaction on RAWNet Testnet';
        result.testTx = {
          amount: 1.00,
          network: 'RAWNet Testnet (chainId 720701)',
          gasCost: '$0.0000082',
          expectedTime: '500ms',
          faucet: 'https://faucet.testnet.rawnet.io',
        };
        break;
    }

    result.status = 'ready';
    this._completedSteps.push(stepId);
    return result;
  }

  /**
   * Generate a legacy processor bridge configuration.
   * Allows running QWKS alongside Stripe/Square during transition.
   */
  generateBridgeConfig() {
    return {
      mode: 'parallel',
      description: 'Run QWKS alongside your existing processor. Route new customers to QWKS, existing to legacy.',
      legacyProcessor: this.processor.name,
      routingRules: [
        { condition: 'customer.hasAllCard === true', route: 'qwks', reason: 'AllCard customer — zero fee' },
        { condition: 'payment.amount > 100', route: 'qwks', reason: 'High value — save $2.50+ per transaction' },
        { condition: 'customer.type === "returning"', route: 'qwks', reason: 'Known customer — ZK identity ready' },
        { condition: 'default', route: this.processor.name.toLowerCase(), reason: 'New customer — keep legacy path during transition' },
      ],
      transitionSchedule: [
        { week: 1, qwksPct: 10, note: 'New AllCard customers only' },
        { week: 4, qwksPct: 40, note: 'All returning customers + high-value' },
        { week: 8, qwksPct: 80, note: 'All except first-time walk-ins' },
        { week: 12, qwksPct: 100, note: 'Full migration complete. Cancel legacy subscription.' },
      ],
      cancelLegacyAt: '12 weeks',
    };
  }

  /** Quick ROI summary for a one-page pitch */
  quickPitch() {
    const ratePct = this.rateBps / 100;
    const annualVisa = this.monthlyVol * 12 * (ratePct / 100);
    const annualQwks = this.txPerMonth * 12 * 0.0000082;
    const saved = annualVisa - annualQwks;
    return {
      headline: `Switch from ${this.processor.name} to QWKS`,
      currentAnnualCost: `$${annualVisa.toLocaleString('en', { maximumFractionDigits: 0 })}`,
      newAnnualCost:     `$${annualQwks.toFixed(4)}`,
      annualSavings:     `$${saved.toLocaleString('en', { maximumFractionDigits: 0 })}`,
      qwksFee:           `$${(saved * 0.10).toLocaleString('en', { maximumFractionDigits: 0 })} (10% of savings)`,
      youKeep:           `$${(saved * 0.90).toLocaleString('en', { maximumFractionDigits: 0 })} per year`,
      onboardingTime:    '60 minutes',
      riskNote:          'Keep your existing processor. QWKS runs in parallel. Cancel only when ready.',
      network:           `RAWNet (${Math.round(baseL2TxCost / 0.0000082)}x cheaper than Base L2 · ${Math.round(annualVisa / annualQwks)}x cheaper than ${this.processor.name})`,
    };
  }
}

const baseL2TxCost = 0.000825;

module.exports = { QWKSMigration, PROCESSOR_PROFILES, ONBOARDING_STEPS };
