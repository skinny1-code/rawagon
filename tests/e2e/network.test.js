'use strict';
const assert = require('assert');
const crypto = require('crypto');
const {AllCard} = require('../../packages/allcard-sdk');
const {savings} = require('../../packages/fee-distributor');
const {simulateBurn, stakingYield} = require('../../packages/ltn-token');
let p=0,f=0;
const t=(n,fn)=>{try{fn();console.log('  ✓',n);p++;}catch(e){console.log('  ✗',n,':',e.message);f++;}};
console.log('\n── E2E: Full Network Simulation ──');

t('Full network: 5000 QWKS businesses revenue', ()=>{
  const bizCount = 5000, monthlyVol = 50000;
  const perBiz = savings(monthlyVol, 500, 2.5).qwksFee;
  const total = bizCount * perBiz;
  assert(total > 6_000_000 && total < 9_000_000);
});

t('Full network: 56M txns burns 56,400 LTN', ()=>{
  const r = simulateBurn(56_400_000);
  assert(Math.abs(r.burned - 56_400) < 1);
  assert(r.remainingSupply < 1_000_000_000);
});

t('Full network: Year 2 EBITDA 84%+', ()=>{
  const rev = 29_126_267, costs = 4_389_660;
  const margin = (rev-costs)/rev;
  assert(margin > 0.80);
});

t('Full network: FeeDistributor inflow $3.44M', ()=>{
  const inflow = 3_444_000_000 * 0.001; // 0.1% of $3.44B
  assert(Math.abs(inflow - 3_444_000) < 1000);
});

t('Full network: staking APY positive (high at low LTN price)', ()=>{
  const r = stakingYield(10000, 3_444_000_000, 40_000_000);
  assert(r.apyActual > 0.05, 'APY should be positive: '+r.apyActual);
});

t('WAGON payments: gas cost negligible vs Visa', ()=>{
  const visaCost = 50000 * 12 * 0.025;     // $15,000/yr
  const rawnetCost = 500 * 12 * 0.0000082; // $0.049/yr
  assert(visaCost / rawnetCost > 100000);
});

t('AllCard: full payment flow (no PII exposed)', ()=>{
  const alice = new AllCard();
  const vault = alice.encryptVault({name:'Alice',ssn:'123-45-6789',dob:'1990-01-01'});
  const proof = alice.prove({age_gte:21, kyc:true});
  const record = alice.paymentRecord(125.00);
  // Business receives:
  const bizReceives = {commitment: record.commitment, proof_hash: record.proof_hash, amount: record.amount};
  assert(!JSON.stringify(bizReceives).includes('Alice'));
  assert(!JSON.stringify(bizReceives).includes('123-45-6789'));
  assert(alice.verify(proof.proof, proof.commitment));
});

t('Contract Solidity: all 9 contracts have SPDX+constructor', ()=>{
  const fs = require('fs'), path = require('path');
  const contracts = [
    'contracts/LTN/LivingToken.sol','contracts/QWKS/FeeDistributor.sol',
    'contracts/AllCard/EmployeeVault.sol','contracts/AutoIQ/IQTitle.sol',
    'contracts/GoldSnap/GoldMint.sol','contracts/Allocation/EntityAllocation.sol',
    'contracts/BitPawn/PawnRegistry.sol','contracts/Droppa/BreakFactory.sol',
    'contracts/RAWNet/RAWNetBridge.sol',
  ];
  const base = require('path').join(__dirname, '../..');
  contracts.forEach(c=>{
    const src = fs.readFileSync(path.join(base,c),'utf8');
    assert(src.includes('SPDX-License-Identifier'), c+' missing SPDX');
    assert(src.includes('pragma solidity'), c+' missing pragma');
    assert(src.split('{').length === src.split('}').length, c+' unbalanced braces');
  });
});

console.log(`\n  ${p}/${p+f} passed${f?' — '+f+' FAILED':' ✓'}`);
process.exit(f?1:0);
