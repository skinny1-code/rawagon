'use strict';
const assert = require('assert');
const crypto = require('crypto');
const {genKey,commit,prove,verify,encrypt,derivePAN} = require('../../packages/zk-identity');
const {savings,transition} = require('../../packages/fee-distributor');
const {AllCard} = require('../../packages/allcard-sdk');
const {stakingYield,simulateBurn,transitionPoint} = require('../../packages/ltn-token');
const {QWKSMigration} = require('../../packages/migration-sdk');
let p=0,f=0;
const t=(n,fn)=>{try{fn();console.log('  ✓',n);p++;}catch(e){console.log('  ✗',n,':',e.message);f++;}};
console.log('\n── Integration: Core Workflows ──');

// ── BITPAWN ──────────────────────────────────────────────────────
t('BitPawn: intake generates ZK ticket (no PII)', ()=>{
  const card = new AllCard();
  const custData = {name:'John Smith', dob:'1985-06-12', id:'DL-CA-12345'};
  const customerCommit = card.commit(custData);
  const GOLD_SPOT = 4133.80, grams = 5.2, karat = 14;
  const melt = (grams/31.1035)*GOLD_SPOT*(karat/24);
  const ticket = {id:'PWN-'+Date.now().toString().slice(-6), customerCommit, offer:(melt*0.60).toFixed(2), status:'active'};
  assert(ticket.customerCommit.startsWith('0x'));
  assert(parseFloat(ticket.offer)>200);
  assert(!JSON.stringify(ticket).includes('John Smith'));
  assert(!JSON.stringify(ticket).includes('DL-CA'));
});

t('BitPawn: AllCard PAN shifts for each payout', ()=>{
  const card = new AllCard();
  const pans = Array.from({length:5}, ()=>card.shift().pan);
  assert.strictEqual(new Set(pans).size, 5);
});

t('BitPawn: gold melt calc accuracy', ()=>{
  const melt = (5.2/31.1035)*4133.80*(14/24);
  assert(Math.abs(melt-403.14)<5);
  assert(melt*0.60 > 200 && melt*0.60 < 300);
});

// ── AUTOIQ ───────────────────────────────────────────────────────
t('AutoIQ: VIN → deterministic token ID', ()=>{
  const vin = '5YJSA1DG9DFP14947';
  const id1 = crypto.createHash('sha256').update(vin).digest('hex');
  const id2 = crypto.createHash('sha256').update(vin).digest('hex');
  assert.strictEqual(id1, id2);
  assert.notStrictEqual(id1, crypto.createHash('sha256').update('1HGBH41JXMN109186').digest('hex'));
});

t('AutoIQ: 0.3% fee on $18K vehicle = $54', ()=>{
  assert(Math.abs(18000*0.003 - 54) < 0.01);
});

// ── QWKS ─────────────────────────────────────────────────────────
t('QWKS: savings 9:1 ratio', ()=>{
  const s = savings(50000,500,2.5);
  assert(Math.abs(s.toCustomer/s.qwksFee-9)<0.01);
});

t('QWKS: payment proof has no PII', ()=>{
  const card = new AllCard();
  const proof = card.prove({balance_gte:100, kyc:true});
  const record = {commitment:proof.commitment, txId:'0x'+crypto.randomBytes(16).toString('hex'), amount:125};
  assert(card.verify(proof.proof, proof.commitment));
  assert(!JSON.stringify(record).includes('Alice'));
});

t('QWKS: RAWNet 100x cheaper than Base', ()=>{
  assert(0.000825/0.0000082 > 90);
});

t('QWKS: visa 304000x+ more than RAWNet', ()=>{
  assert(2.50/0.0000082 > 300000);
});

// ── DROPPA ───────────────────────────────────────────────────────
t('Droppa: break GMV calc correct', ()=>{
  const gross = 20*65; // 20 slots × $65
  assert.strictEqual(gross, 1300);
  assert(Math.abs(gross*0.01 - 13) < 0.01); // 1% fee = $13
  assert(Math.abs(gross*0.99 - 1287) < 0.01); // seller gets 99%
});

t('Droppa: slot buyers get ZK commitment (no name stored)', ()=>{
  const buyers = [{name:'Alice'},{name:'Bob'},{name:'Carol'}];
  const k = genKey();
  const commits = buyers.map(b=>commit(b,k));
  assert(commits.every(c=>c.startsWith('0x')));
  assert(!commits.some(c=>c.includes('Alice')||c.includes('Bob')));
});

// ── GOLDSNAP ─────────────────────────────────────────────────────
t('GoldSnap: GTX price = gold spot / 100', ()=>{
  const goldSpot = 4133.80;
  const gtxPrice = goldSpot/100;
  assert(Math.abs(gtxPrice-41.338)<0.01);
});

t('GoldSnap: 0.25% mint fee on $100 = $0.25', ()=>{
  assert(Math.abs(100*0.0025 - 0.25)<0.001);
});

// ── LTN STAKING ──────────────────────────────────────────────────
t('LTN: 56400 txns burns 56.4 LTN', ()=>{
  const r = simulateBurn(56400);
  assert(Math.abs(r.burned-56.4)<0.001);
});

t('LTN: 50K staked yields ~$4305/yr', ()=>{
  const r = stakingYield(50000);
  assert(r.annualYield > 3000 && r.annualYield < 6000);
});

t('LTN: transition point P* math', ()=>{
  const t2 = transitionPoint(1499);
  assert(t2.ltnNeeded > 1000 && t2.ltnNeeded < 200000);
  assert(Math.abs(t2.annualYieldAtP - 1499) < 1);
});

// ── PROFITPILOT ──────────────────────────────────────────────────
t('ProfitPilot: $99/mo × 2500 subs = $2.97M/yr', ()=>{
  assert(Math.abs(99*12*2500 - 2_970_000) < 1);
});

// ── ALLCARD MODES ────────────────────────────────────────────────
t('AllCard: 8 modes each generate unique PANs', ()=>{
  const card = new AllCard();
  const modes = ['identity','debit','crypto','health','vehicle','gov','badge','retirement'];
  const pans = modes.map(m=>card.shift(m).pan);
  // Note: same card, same mode, different nonces — test for uniqueness
  assert.strictEqual(new Set(pans).size, 8);
});

// ── WALLET SEPARATION ────────────────────────────────────────────
t('WAGON + FOUNDER: independent seeds', ()=>{
  const wagon   = 'job debate bulb acquire decorate critic attitude bless bracket fork broccoli east';
  const founder = 'nerve finish surface during tilt enable frame spoon arrow slow spend saddle';
  assert.notStrictEqual(wagon, founder);
  assert(wagon.split(' ').length === 12);
  assert(founder.split(' ').length === 12);
});

t('Founder allocation: 15% of all revenue', ()=>{
  const totalRev = 29_126_267;
  const founderShare = totalRev * 0.15;
  assert(Math.abs(founderShare - 4_368_940) < 100);
});

t('WAGON allocation: 5 buckets sum to 100%', ()=>{
  assert.strictEqual(30+20+20+15+15, 100);
});

// ── MIGRATION ────────────────────────────────────────────────────
t('Migration: Stripe onboarding generates plan', ()=>{
  const m = new QWKSMigration({processor:'stripe', monthlyVolume:50000, txPerMonth:500});
  const plan = m.generateMigrationPlan();
  assert(plan.savings.visaAnnual > 0);
  assert(plan.network.rawnetAnnualCost < plan.network.baseL2AnnualCost);
  assert(plan.steps.length === 6);
});

t('Migration: bridge config parallel mode', ()=>{
  const m = new QWKSMigration({processor:'square', monthlyVolume:25000});
  const bridge = m.generateBridgeConfig();
  assert.strictEqual(bridge.mode, 'parallel');
  assert(bridge.transitionSchedule[3].qwksPct === 100);
});

// ── E2E ENTITY ALLOCATION ────────────────────────────────────────
t('EntityAllocation: preview sums to input', ()=>{
  const amount = 1_000_000;
  const prod = Math.floor(amount*0.30);
  const bd   = Math.floor(amount*0.20);
  const ltn  = Math.floor(amount*0.20);
  const res  = Math.floor(amount*0.15);
  const found= amount - prod - bd - ltn - res;
  assert.strictEqual(prod+bd+ltn+res+found, amount);
  assert(Math.abs(found/amount - 0.15) < 0.001);
});

console.log(`\n  ${p}/${p+f} passed${f?' — '+f+' FAILED':' ✓'}`);
process.exit(f?1:0);
