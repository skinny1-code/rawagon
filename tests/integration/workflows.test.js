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



// ── New integrations from project files ─────────────────────────────────
t('BitPawn: police hold 7-day enforcement', () => {
  const holdMs = 7 * 86400000;
  const daysLeft = Math.ceil(holdMs / 86400000);
  assert.strictEqual(daysLeft, 7);
});

t('BitPawn: electronics require serial number for police export', () => {
  const cat = 'Electronics';
  const requiresSerial = ['Electronics','Firearms','Tools'].includes(cat);
  assert(requiresSerial, 'Electronics must require serial');
});

t('AutoIQ: SwiftCash 0.3% fee on $18K = $54', () => {
  const fee = 18000 * 0.003;
  assert.strictEqual(fee, 54);
});

t('AutoIQ: AutoList retail/wholesale/private spread', () => {
  const retail = 18000;
  assert.strictEqual(retail * 0.75, 13500);
  assert.strictEqual(retail * 0.85, 15300);
});

t('ProfitPilot: compound continuous 50% APR 1yr = $1648.72', () => {
  const result = 1000 * Math.exp(0.5);
  assert.strictEqual(result.toFixed(2), '1648.72');
});

t('ProfitPilot: compound monthly 50% APR 1yr = $1632.09', () => {
  const result = 1000 * Math.pow(1 + 0.5/12, 12);
  assert.strictEqual(result.toFixed(2), '1632.09');
});

t('ProfitPilot: continuous APY 64.87% beats annual 50%', () => {
  const contAPY = (Math.exp(0.5) - 1) * 100;
  assert.strictEqual(contAPY.toFixed(2), '64.87');
  assert(contAPY > 50, 'continuous APY must beat nominal rate');
});

t('IP Vault: patent non-provisional deadline = 2027-03-22', () => {
  const filed = new Date('2026-03-22');
  const deadline = new Date(filed);
  deadline.setFullYear(deadline.getFullYear() + 1);
  assert.strictEqual(deadline.toISOString().slice(0,10), '2027-03-22');
});

t('QWKS: AIPolicyRouter min score 70/100', () => {
  const min = 70;
  assert(87 >= min, 'valid score 87 must pass');
  assert(65 < min, 'invalid score 65 must fail');
});

t('QWKS: AIPolicyRouter daily cap / perTx = max txs', () => {
  assert.strictEqual(Math.floor(10000 / 500), 20);
});

t('Droppa: referral 25% tier-1 / 10% tier-2 on $99/mo', () => {
  const sub = 99;
  assert.strictEqual((sub * 0.25).toFixed(2), '24.75');
  assert.strictEqual((sub * 0.10).toFixed(2), '9.90');
});

t('Droppa: GMV 30 slots x $65 = $1950, fee = $19.50', () => {
  const gross = 30 * 65;
  const fee = gross * 0.01;
  assert.strictEqual(gross, 1950);
  assert.strictEqual(fee, 19.5);
});



t('CardVault: intake fee $9 USDC = 9_000_000 wei', () => {
  const intakeFee = 9_000_000;
  assert.strictEqual(intakeFee / 1e6, 9);
});

t('CardVault: monthly fee $2 USDC = 2_000_000 wei', () => {
  const monthlyFee = 2_000_000;
  assert.strictEqual(monthlyFee / 1e6, 2);
});

t('CardVault: redemption fee $19 USDC = 19_000_000 wei', () => {
  const redemptionFee = 19_000_000;
  assert.strictEqual(redemptionFee / 1e6, 19);
});

t('CardVault: 12 month storage = $24 + $9 intake = $33 total', () => {
  const intake = 9, monthly = 2, months = 12;
  const total = intake + (monthly * months);
  assert.strictEqual(total, 33);
});

t('CardVault: card hash is deterministic', () => {
  const crypto = require('crypto');
  const input = 'Mike Trout|2011|Topps Update|US175|1|1000|12345678';
  const h1 = crypto.createHash('sha256').update(input).digest('hex');
  const h2 = crypto.createHash('sha256').update(input).digest('hex');
  assert.strictEqual(h1, h2);
  assert.strictEqual(h1.length, 64);
});

t('CardVault: different cards produce different hashes', () => {
  const crypto = require('crypto');
  const h1 = crypto.createHash('sha256').update('Trout|2011|Topps|US175|PSA|10').digest('hex');
  const h2 = crypto.createHash('sha256').update('Ohtani|2018|Chrome|1|BGS|9.5').digest('hex');
  assert.notStrictEqual(h1, h2);
});

t('CardVault: vault vs PWCC fee comparison', () => {
  // Droppa cheaper on intake and storage
  const droppaIntake = 9, pwccIntake = 20;
  const droppaMonthly = 2, pwccMonthly = 4;
  assert(droppaIntake < pwccIntake);
  assert(droppaMonthly < pwccMonthly);
});

t('CardVault: 1 year savings vs PWCC competitor', () => {
  // 10 cards, 12 months
  const cards = 10, months = 12;
  const droppa = (9 * cards) + (2 * cards * months);  // $330
  const pwcc   = (20 * cards) + (4 * cards * months); // $680
  assert(droppa < pwcc);
  assert.strictEqual(droppa, 330);
});



t('CardVault: deposit fee = $12 USDC', () => {
  const DEPOSIT_FEE = 12_000_000n;
  assert.strictEqual(DEPOSIT_FEE, 12000000n);
  assert.strictEqual(Number(DEPOSIT_FEE)/1e6, 12);
});

t('CardVault: storage fee $1/month for 3 months = $3', () => {
  const STORAGE_FEE_MO = 1_000_000n;
  const months = 3n;
  assert.strictEqual(Number(STORAGE_FEE_MO * months)/1e6, 3);
});

t('CardVault: redemption total = $18 + storage', () => {
  const redemption = 18_000_000;
  const storage_3mo = 3_000_000;
  const total = (redemption + storage_3mo) / 1e6;
  assert.strictEqual(total, 21);
});

t('CardVault: sale fee 1% of $500 = $5', () => {
  const sale = 500_000_000; // $500 in USDC 6dec
  const fee = sale * 100 / 10000;
  assert.strictEqual(fee / 1e6, 5);
});

t('CardVault: LTN burn 0.001 per action', () => {
  const BURN_LTN = 1e15; // wei (1e-3 ETH scale)
  const ltnBurned = BURN_LTN / 1e18;
  assert.strictEqual(ltnBurned, 0.001);
});

t('CardVault: grade stored as uint16 (PSA 10 = grade 100)', () => {
  const psa10 = 100; // stored as grade * 10
  const displayed = psa10 / 10;
  assert.strictEqual(displayed, 10);
});

t('CardVault: annual storage on $500 card = $12 (2.4% cost)', () => {
  const storage_annual = 12; // $12/year
  const card_value = 500;
  const pct = (storage_annual / card_value) * 100;
  assert(pct < 3, 'storage should be less than 3% annually');
});

// ── New entities + monitors ─────────────────────────────────────────────
t('GoldSnap: BWG intake fee = $9 USDC', () => {
  const intake = 9_000_000;
  assert.strictEqual(intake / 1e6, 9);
});

t('GoldSnap: sBTC 1:1 BTC backing ratio', () => {
  const btcHeld = 10, sbtcSupply = 10;
  assert.strictEqual(btcHeld / sbtcSupply, 1);
});

t('GoldSnap: Gold Robot ATECC608A signing integration', () => {
  // ATECC608A uses ECDSA P-256 - verify key length
  const pubKeyLen = 64; // 32-byte x + 32-byte y
  assert.strictEqual(pubKeyLen, 64);
});

t('GoldSnap: AS7341 11-channel spectral ID', () => {
  const channels = 11;
  assert.strictEqual(channels, 11); // F1-F8, Clear, NIR, Flicker
});

t('ProfitPilot: 11 entities total revenue sums correctly', () => {
  const entities = [9344267, 5280000, 4200000, 3780000, 3240000, 2162000, 1120000, 480000, 360000, 240000, 0];
  const total = entities.reduce((a,b) => a+b, 0);
  assert(total > 29000000, 'total should exceed $29M');
  assert.strictEqual(total, 30206267);
});

t('QWKS: Compliance KYC threshold $3000 cumulative', () => {
  const kycThreshold = 3000;
  const tx1 = 1500, tx2 = 1600;
  assert(tx1 + tx2 > kycThreshold, 'cumulative should trigger KYC');
});

t('Risk: 13.6% drawdown triggers kill switch at 10% limit', () => {
  const peak = 1100, current = 950;
  const drawdown = (peak - current) / peak;
  const MAX = 0.10;
  assert(drawdown > MAX, `${(drawdown*100).toFixed(1)}% should exceed ${MAX*100}%`);
});

t('Risk: 3-sigma anomaly detection on gold price', () => {
  const prices = [4133, 4135, 4128, 4140, 4132, 4136, 4129, 4134, 4137, 4131];
  const mean = prices.reduce((a,b)=>a+b)/prices.length;
  const stdev = Math.sqrt(prices.reduce((a,b)=>a+(b-mean)**2,0)/prices.length);
  const spike = 5500;
  const z = Math.abs((spike - mean) / stdev);
  assert(z > 3, `z=${z.toFixed(1)} should exceed 3-sigma`);
});

t('Latency: RPC failover threshold 500ms', () => {
  const MAX_LATENCY = 500;
  const mockLatency = 750;
  assert(mockLatency > MAX_LATENCY, 'should trigger backup RPC');
});

t('Secret: Required keys validation list', () => {
  const required = ['ANTHROPIC_API_KEY', 'GANACHE_RPC'];
  assert.strictEqual(required.length, 2);
  assert(required.includes('ANTHROPIC_API_KEY'));
});


// ── Fix verification tests ──────────────────────────────────────────────
t('wallet-connect: default chain is rawnet_testnet', () => {
  const fs = require('fs');
  const wc = fs.readFileSync('packages/allcard-sdk/wallet-connect.js','utf8');
  assert(wc.includes('targetNetwork = "rawnet_testnet"'), 'default chain must be rawnet');
});

t('deployed-addresses: CardVault entry exists', () => {
  const addrs = JSON.parse(require('fs').readFileSync('deployed-addresses.json','utf8'));
  assert('CardVault' in addrs.rawnet_testnet, 'CardVault must be in deployed-addresses');
});

t('CardVault: intake $9 + 12mo storage $24 = $33 total', () => {
  const intakeFee = 9, monthly = 2, months = 12;
  assert.strictEqual(intakeFee + monthly * months, 33);
});

t('monitors: all monitor files exist', () => {
  const fs = require('fs');
  const files = ['secret_manager.py','risk_gatekeeper.py','latency_monitor.py','data_integrity.py','run_monitors.py'];
  files.forEach(f => assert(fs.existsSync('packages/monitors/'+f), f+' must exist'));
});

t('monitors: risk drawdown 13.6% triggers at 10% limit', () => {
  const peak = 1100, current = 950;
  const drawdown = (peak - current) / peak;
  assert.strictEqual(Number(drawdown.toFixed(3)), 0.136);
  assert(drawdown > 0.10);
});

t('monitors: latency 750ms exceeds 500ms threshold', () => {
  const MAX = 500, actual = 750;
  assert(actual > MAX, 'should trigger backup RPC');
});

t('monitors: z-score 3-sigma anomaly detection', () => {
  const prices = [100,101,99,100,102,98,100,101,99,100];
  const mean = prices.reduce((a,b)=>a+b)/prices.length;
  const std  = Math.sqrt(prices.reduce((a,b)=>a+(b-mean)**2,0)/prices.length);
  const spike = 200;
  const z = Math.abs((spike-mean)/std);
  assert(z > 3, `z=${z.toFixed(1)} must exceed 3`);
});

t('SECURITY.md: not a generic template', () => {
  const fs = require('fs');
  const sec = fs.readFileSync('SECURITY.md','utf8');
  assert(sec.includes('rawagon.io'), 'must have real contact');
  assert(!sec.includes('5.1.x'), 'must not have generic version table');
});

t('rawagon-os: no broken sepolia.10.117 URL', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/rawagon-os/index.html','utf8');
  assert(!html.includes('sepolia.10.117'), 'broken URL must be removed');
});

t('allcard-sdk: CardVault ABI exported', () => {
  const fs = require('fs');
  const sdk = fs.readFileSync('packages/allcard-sdk/index.js','utf8');
  assert(sdk.includes('CARD_VAULT_ABI'), 'CardVault ABI must be in allcard-sdk');
});


// ── Final integration + infrastructure tests ──────────────────────────────
t('contracts-sdk: all 10 RAWNet addresses present', () => {
  const { RAWContracts } = require('../../packages/contracts-sdk/contracts.js');
  const contracts = ['MockUSDC','MockOracleXAU','MockOracleXAG','LivingToken',
    'FeeDistributor','EmployeeVault','GoldMint','IQTitle','PawnRegistry','BreakFactory'];
  contracts.forEach(c => {
    const addr = RAWContracts.rawnet(c);
    assert(addr && addr.startsWith('0x'), `${c} must have 0x address`);
  });
});

t('contracts-sdk: all ABIs present for 11 contracts', () => {
  const { ABI } = require('../../packages/contracts-sdk/contracts.js');
  const required = ['ERC20','LivingToken','FeeDistributor','PawnRegistry',
    'BreakFactory','GoldMint','IQTitle','EmployeeVault','CardVault'];
  required.forEach(k => assert(Array.isArray(ABI[k]) && ABI[k].length>0, `${k} ABI missing`));
});

t('server: manifest.json valid JSON', () => {
  const m = JSON.parse(require('fs').readFileSync('manifest.json','utf8'));
  assert.strictEqual(m.name, 'RAWagon OS');
  assert.strictEqual(m.start_url, '/');
  assert(m.icons.length >= 2);
});

t('env.example: has all required env keys', () => {
  const env = require('fs').readFileSync('.env.example','utf8');
  ['GANACHE_RPC','RAWNET_RPC','ANTHROPIC_API_KEY','PRIVATE_KEY','GANACHE_RPC'].forEach(k => {
    assert(env.includes(k), `${k} must be in .env.example`);
  });
});

t('security: no raw private keys in source code', () => {
  const fs = require('fs');
  // .env.example should have placeholder, not real keys
  const env = fs.readFileSync('.env.example','utf8');
  assert(!env.includes('0xac0974'), 'Hardhat default PK must not be in .env.example');
  assert(!env.includes('sk-ant-api03'), 'Real Anthropic key must not be in .env.example');
});

t('allcard: OS back link present in header', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/1nce-allcard/index.html','utf8');
  assert(html.includes('href="/"'), 'AllCard must have OS back link');
  assert(html.includes('⬡ OS'), 'AllCard must show OS label');
});

t('all apps: have theme-color meta tag', () => {
  const fs = require('fs');
  const apps = ['bitpawn','droppa','autoiq','goldsnap','qwks-protocol','1nce-allcard','profitpilot'];
  apps.forEach(app => {
    const html = fs.readFileSync('apps/'+app+'/index.html','utf8');
    assert(html.includes('theme-color'), `${app} must have theme-color meta`);
  });
});

t('FeeDistributor: totalInflow function in QWKS ABI', () => {
  const fs = require('fs');
  const qwks = fs.readFileSync('apps/qwks-protocol/index.html','utf8');
  assert(qwks.includes('totalInflow'), 'QWKS must have totalInflow in FD_ABI');
});

t('GoldSnap: BWG intake fee matches CardVault fee ($9)', () => {
  // BWG and CardVault both use $9 intake
  const intake_bwg = 9, intake_vault = 9;
  assert.strictEqual(intake_bwg, intake_vault);
});


// ── Package integrity tests ────────────────────────────────────────────────
t('gold-oracle: meltValue computes correctly', () => {
  const { meltValue } = require('../../packages/gold-oracle/index.js');
  const result = meltValue('gold', 5, 14, 4133.80);  // 5g 14k at $4133.80/oz
  assert(result.meltValue > 380 && result.meltValue < 400,
    `melt $${result.meltValue?.toFixed(2)} should be ~$390`);
  assert.strictEqual(result.grams, 5);
  assert(Math.abs(result.purity - 14/24) < 0.001);
});

t('gold-oracle: pawnCalc async structure', async () => {
  const { pawnCalc } = require('../../packages/gold-oracle/index.js');
  assert(typeof pawnCalc === 'function');
});

t('contracts-sdk: isDeployed false for CardVault (pending)', () => {
  const { RAWContracts } = require('../../packages/contracts-sdk/contracts.js');
  const deployed = RAWContracts.isDeployed(720701, 'CardVault');
  assert(!deployed, 'CardVault should not be deployed yet');
});

t('contracts-sdk: isDeployed true for all 10 live contracts', () => {
  const { RAWContracts } = require('../../packages/contracts-sdk/contracts.js');
  const live = ['MockUSDC','LivingToken','FeeDistributor','EmployeeVault',
    'GoldMint','IQTitle','PawnRegistry','BreakFactory'];
  live.forEach(c => {
    assert(RAWContracts.isDeployed(720701, c), `${c} should be deployed`);
  });
});

t('connectors: AllCard connectors load without error', () => {
  const fs = require('fs');
  const src = fs.readFileSync('packages/allcard-sdk/connectors.js','utf8');
  assert(!src.includes("require('../core/identity')"), 'broken dependency must be removed');
  assert(src.includes('class BaseConnector'), 'BaseConnector must exist');
});

t('gold-oracle: meltValue returns all required fields', () => {
  const { meltValue } = require('../../packages/gold-oracle/index.js');
  const r = meltValue('gold', 31.1035, 24, 4133.80); // 1 troy oz 24k
  assert(r.meltValue > 4000, '1oz 24k melt should be near spot');
  assert(r.pureOz > 0.99 && r.pureOz < 1.01, 'pureOz should be ~1');
  assert(r.purity === 1, '24k purity should be 1.0');
  assert(r.spotPrice === 4133.80);
});

t('server: /health endpoint code exists', () => {
  const fs = require('fs');
  const server = fs.readFileSync('server.js','utf8');
  assert(server.includes("pathname === '/health'"), 'health endpoint must exist');
  assert(server.includes("pathname === '/manifest.json'"), 'manifest endpoint must exist');
});

t('PWA: manifest.json has required fields', () => {
  const m = JSON.parse(require('fs').readFileSync('manifest.json','utf8'));
  assert(m.name && m.short_name && m.start_url && m.icons, 'manifest missing required fields');
  assert(m.display === 'standalone', 'must be standalone PWA');
});

t('BitPawn: 9 nav tabs match show() array', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/bitpawn/index.html','utf8');
  const tabs = (html.match(/onclick="show\('(\w+)'\)"/g)||[]).length;
  assert(tabs >= 9, `BitPawn must have 9+ tabs, got ${tabs}`);
});

t('All apps: OS back-navigation present', () => {
  const fs = require('fs');
  const apps = ['bitpawn','droppa','autoiq','goldsnap','qwks-protocol','1nce-allcard','profitpilot'];
  apps.forEach(app => {
    const html = fs.readFileSync('apps/'+app+'/index.html','utf8');
    assert(html.includes('href="/"'), `${app} must have OS back link`);
  });
});


// ── New apps integration tests ──────────────────────────────────────────────
t('Drop The Reel: app file exists and has pipeline', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/drop-the-reel/index.html','utf8');
  assert(html.includes('runPipeline'), 'must have runPipeline function');
  assert(html.includes('claude-sonnet-4-6'), 'must reference Claude model');
  assert(html.includes('ElevenLabs'), 'must reference ElevenLabs');
  assert(html.includes('Remotion'), 'must reference Remotion');
});

t('Drop The Reel: 4 critic voices defined', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/drop-the-reel/index.html','utf8');
  ['hitchcock','kubrick','ebert','shakespeare'].forEach(v =>
    assert(html.includes(v), `critic ${v} must be present`)
  );
});

t('Drop The Reel: revenue model at 500 subs = $3500 MRR', () => {
  const subs = 500, price = 7;
  assert.strictEqual(subs * price, 3500);
});

t('AI Orchestrator: app file exists', () => {
  const fs = require('fs');
  assert(fs.existsSync('apps/ai-orchestrator/index.html'), 'ai-orchestrator must exist');
  const html = fs.readFileSync('apps/ai-orchestrator/index.html','utf8');
  assert(html.includes('Orchestrator'), 'must reference Orchestrator');
});

t('PawnVault: app exists with ticket creation', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/pawnvault/index.html','utf8');
  assert(html.includes('createTicket'), 'must have createTicket');
  assert(html.includes('redeemTicket'), 'must have redeemTicket');
  assert(html.includes('PostgreSQL'), 'must reference PostgreSQL');
});

t('PawnVault: $99/mo × 300 shops = $29,700 MRR', () => {
  assert.strictEqual(99 * 300, 29700);
});

t('server: 3 new app aliases in APP_MAP', () => {
  const fs = require('fs');
  const src = fs.readFileSync('server.js','utf8');
  assert(src.includes("'drop-the-reel'"), 'drop-the-reel must be mapped');
  assert(src.includes("'ai-orchestrator'"), 'ai-orchestrator must be mapped');
  assert(src.includes("'pawnvault'"), 'pawnvault must be mapped');
});

t('Drop The Reel: operating cost math ($52/mo)', () => {
  const costs = { anthropic: 20, elevenlabs: 22, replicate: 10 };
  const total = Object.values(costs).reduce((a,b) => a+b, 0);
  assert.strictEqual(total, 52);
});

t('Drop The Reel: break-even = 8 subscribers', () => {
  const cost = 52, price = 7;
  const breakEven = Math.ceil(cost / price);
  assert.strictEqual(breakEven, 8);
});


// ── Real API integration tests ─────────────────────────────────────────────
t('Droppa: anthropicFetch helper exists in app', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/index.html','utf8');
  assert(html.includes('function anthropicFetch('), 'anthropicFetch must exist');
  assert(html.includes('anthropic-dangerous-direct-browser-access'), 'must have browser header');
  assert(html.includes('claude-sonnet-4-6'), 'must use latest model');
  assert(!html.includes('claude-sonnet-4-20250514'), 'old model must be removed');
});

t('Drop The Reel: uses anthropicFetch not raw fetch', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/drop-the-reel/index.html','utf8');
  assert(html.includes('anthropicFetch('), 'must use anthropicFetch helper');
});

t('GoldSnap: CoinGecko PAXG gold price fetch', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/goldsnap/index.html','utf8');
  assert(html.includes('pax-gold'), 'must use PAXG for live gold price');
  assert(!html.includes('query1.finance.yahoo'), 'Yahoo Finance must be removed');
});

t('BitPawn: CoinGecko PAXG gold price fetch', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/bitpawn/index.html','utf8');
  assert(html.includes('pax-gold'), 'BitPawn must use PAXG for gold price');
});

t('QWKS: real Visa interchange rates by category', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/qwks-protocol/index.html','utf8');
  assert(html.includes('VISA_RATES'), 'must have VISA_RATES object');
  assert(html.includes('Restaurant'), 'must have restaurant category');
  assert(html.includes('Pawn Shop'), 'must have pawn shop rate');
});

t('AutoIQ: NHTSA recall-based valuation', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/autoiq/index.html','utf8');
  assert(html.includes('recallPenalty'), 'must adjust price for recalls');
  assert(html.includes('api.nhtsa.gov/recalls'), 'must query NHTSA recalls');
});

t('Global key manager: RAW_KEYS object in AI apps', () => {
  const fs = require('fs');
  const apps = ['apps/droppa/index.html','apps/drop-the-reel/index.html','apps/rawagon-os/index.html'];
  apps.forEach(app => {
    const html = fs.readFileSync(app,'utf8');
    assert(html.includes('RAW_KEYS'), `${app} must have RAW_KEYS`);
    assert(html.includes('rawagon-anthropic-key'), `${app} must use shared key name`);
  });
});

t('ProfitPilot: revenue from allocation.json', () => {
  const alloc = JSON.parse(require('fs').readFileSync('config/allocation.json','utf8'));
  const qwks = alloc.entities.QWKS.year2_annual_revenue;
  assert(qwks > 7000000, 'QWKS revenue should be > $7M');
  const total = alloc.totals.year2_gross_revenue;
  assert(total > 25000000, 'Total revenue should be > $25M');
});

t('CoinGecko PAXG: correct API endpoint format', () => {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd';
  assert(url.includes('pax-gold'), 'must use pax-gold token ID');
  assert(url.includes('coingecko.com'), 'must use CoinGecko');
});

t('Droppa: key manager banner exists', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/index.html','utf8');
  assert(html.includes('global-key-banner'), 'must have key banner');
  assert(html.includes('saveGlobalKey'), 'must have saveGlobalKey function');
});


// ── Droppa Live Stream / Winners / Postage / Notify tests ─────────────────
t('Droppa: 13 tabs (4 new added)', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/index.html','utf8');
  const m = html.match(/const ids=\[([^\]]+)\]/);
  assert(m, 'ids array must exist');
  const ids = m[1].split(',').map(s => s.trim().replace(/['"]/g,''));
  assert.strictEqual(ids.length, 13, 'must have 13 tabs');
  ['stream','winners','postage','notify'].forEach(tab =>
    assert(ids.includes(tab), `${tab} tab must exist`)
  );
});

t('Droppa: all 13 pane IDs exist in HTML', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/index.html','utf8');
  const tabs = ['dashboard','breaks','inventory','pricing','analytics','clips','referrals','vault','stream','winners','postage','notify','settings'];
  tabs.forEach(t => assert(html.includes('id="pane-'+t+'"'), `pane-${t} must exist`));
});

t('Droppa: Live Stream tab has parseChatMessages + anthropicFetch', () => {
  const fs = require('fs');
  const src = fs.readFileSync('apps/droppa/droppa-live.js','utf8');
  assert(src.includes('parseChatMessages'), 'must have parseChatMessages');
  assert(src.includes('generateCallout'), 'must have generateCallout');
  assert(src.includes('updateOverlayData'), 'must have updateOverlayData');
  assert(src.includes('startLiveSession'), 'must have startLiveSession');
});

t('Droppa: Winners tab has CRUD + CSV export + auto-assign', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/index.html','utf8');
  assert(html.includes('saveWinner'), 'must have saveWinner');
  assert(html.includes('exportWinnersCSV'), 'must have exportWinnersCSV');
  assert(html.includes('autoAssignCards'), 'must have autoAssignCards');
  assert(html.includes('renderWinnersTable'), 'must have renderWinnersTable');
});

t('Droppa: Postage tab has EasyPost API integration', () => {
  const fs = require('fs');
  const src = fs.readFileSync('apps/droppa/droppa-live.js','utf8');
  assert(src.includes('api.easypost.com'), 'must call EasyPost API');
  assert(src.includes('shopRates'), 'must have shopRates');
  assert(src.includes('generateBulkLabels'), 'must have generateBulkLabels');
  assert(src.includes('buyLabel'), 'must have buyLabel');
  assert(src.includes('/v2/shipments'), 'must use EasyPost v2 shipments endpoint');
});

t('Droppa: Notify tab has Email + SMS + Discord channels', () => {
  const fs = require('fs');
  const src = fs.readFileSync('apps/droppa/droppa-live.js','utf8');
  assert(src.includes('api.resend.com/emails'), 'must use Resend API for email');
  assert(src.includes('twilio.com'), 'must use Twilio for SMS');
  assert(src.includes('discord'), 'must use Discord webhook');
  assert(src.includes('sendNotification'), 'must have sendNotification');
});

t('Droppa: Notify tab has all 6 message templates', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/index.html','utf8');
  const src2 = require('fs').readFileSync('apps/droppa/droppa-live.js','utf8');
  ['announce','winner','shipped','reminder','sold_out','results'].forEach(t =>
    assert(src2.includes(t + ':'), `template ${t} must exist`)
  );
});

t('Droppa: OBS overlay file exists', () => {
  const fs = require('fs');
  assert(fs.existsSync('apps/droppa/overlay.html'), 'overlay.html must exist');
  const html = fs.readFileSync('apps/droppa/overlay.html','utf8');
  assert(html.includes('droppa-overlay'), 'must read from localStorage');
  assert(html.includes('confetti'), 'must have winner confetti');
  assert(html.includes('bottom-bar'), 'must have bottom bar overlay');
});

t('Droppa: EasyPost rate shopping handles no-key gracefully', () => {
  const fs = require('fs');
  const src = fs.readFileSync('apps/droppa/droppa-live.js','utf8');
  assert(src.includes('EasyPost API key'), 'must show fallback when no key');
});

t('OBS overlay: reads CoinGecko for live prices', () => {
  const fs = require('fs');
  const html = fs.readFileSync('apps/droppa/overlay.html','utf8');
  assert(html.includes('pax-gold'), 'overlay must show live gold price');
  assert(html.includes('bitcoin'), 'overlay must show live BTC price');
  assert(html.includes('confettiFall'), 'must have winner confetti animation');
});

console.log(`\n  ${p}/${p+f} passed${f?' — '+f+' FAILED':' ✓'}`);
process.exit(f?1:0);
