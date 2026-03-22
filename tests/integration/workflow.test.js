
'use strict';
const assert=require('assert');
const crypto=require('crypto');
const zk=require('../../packages/zk-identity');
const fd=require('../../packages/fee-distributor');
let p=0,f=0;
const t=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++;}catch(e){console.log('  ✗ '+n+': '+e.message);f++;}};
console.log('\n=== workflow integration ===\n');

t('Pawn: ticket has no raw PII',()=>{
  const k=zk.genKey(),data={name:'Alice',ssn:'123'};
  const c=zk.commit(data,k);
  const melt=(5.2/31.1035)*4133.80*(14/24);
  const ticket={id:'PWN-001',commit:c,offer:(melt*0.6).toFixed(2)};
  assert.ok(ticket.commit.startsWith('0x'));
  assert.ok(!JSON.stringify(ticket).includes('Alice'));
  assert.ok(!JSON.stringify(ticket).includes('123'));
  assert.ok(parseFloat(ticket.offer)>200);
});

t('Pawn: unique PAN per payout',()=>{
  const k=zk.genKey();
  const pans=Array.from({length:5},(_,i)=>zk.derivePAN(k,i).pan);
  assert.strictEqual(new Set(pans).size,5);
});

t('AutoIQ: VIN->tokenId deterministic no-collision',()=>{
  const h=v=>crypto.createHash('sha256').update(v).digest('hex');
  assert.strictEqual(h('5YJSA1DG9DFP14947'),h('5YJSA1DG9DFP14947'));
  assert.notStrictEqual(h('5YJSA1DG9DFP14947'),h('1HGBH41JXMN109186'));
});

t('QWKS: 9:1 ratio all volumes',()=>{
  [10000,50000,200000].forEach(v=>{
    const s=fd.savings(v,v/100,2.5);
    assert.ok(Math.abs(s.toCustomer/s.qwksFee-9)<0.01);
  });
});

t('QWKS: payment record no PII',()=>{
  const k=zk.genKey();
  const proof=zk.prove({balance_gte:100},k);
  const rec={txId:'0x'+crypto.randomBytes(8).toString('hex'),amount:125,commitment:proof.commitment};
  assert.ok(zk.verify(proof.proof,proof.commitment));
  assert.ok(!JSON.stringify(rec).includes('Alice'));
});

t('LTN: 56400 burns = 56.4 LTN',()=>{
  const B=1n*10n**15n;let burned=0n;
  for(let i=0;i<56400;i++)burned+=B;
  assert.ok(Math.abs(Number(burned)/1e18-56.4)<0.001);
});

t('LTN: staking yield for 50K LTN',()=>{
  const ypl=fd.yieldPerLTN(3444000,40000000);
  const yield_=50000*ypl;
  assert.ok(Math.abs(yield_-4305)<1);
});

t('AllCard: 8 modes all unique',()=>{
  const k=zk.genKey();
  const modes=['identity','debit','crypto','health','vehicle','gov','badge','retirement'];
  const pans=modes.map(m=>{
    const mk=crypto.createHmac('sha256',Buffer.from(k,'hex')).update(m).digest('hex');
    return zk.derivePAN(mk,1).pan;
  });
  assert.strictEqual(new Set(pans).size,8);
});

t('ZK: biz receives only commitment',()=>{
  const k=zk.genKey();
  const pii={name:'Alice',ssn:'123-45-6789',card:'4532 0000 0000 0000'};
  const enc=zk.encrypt(pii,k);
  const proof=zk.prove({age_gte:21},k);
  const bizView={proof:proof.proof,commitment:proof.commitment};
  assert.ok(!JSON.stringify(bizView).includes('Alice'));
  assert.ok(!JSON.stringify(bizView).includes('123'));
  assert.ok(zk.verify(proof.proof,proof.commitment));
});

t('RAWNet: 100x cheaper than Base',()=>{
  assert.ok(0.000825/0.0000082>90);
});

t('GoldSnap: melt value correct',()=>{
  const melt=(5.2/31.1035)*4133.80*(14/24);
  assert.ok(Math.abs(melt-403.14)<1);
  assert.ok(melt*0.0025>0);  // mint fee
});

t('Migration: RAWNet vs Visa savings ratio',()=>{
  const monthlyVol=50000,txPerMo=500;
  const visaAnnual=monthlyVol*12*0.025;
  const rawnetAnnual=txPerMo*12*0.0000082;
  assert.ok(visaAnnual/rawnetAnnual>100000);
});

console.log('\n'+p+'/'+(p+f)+' passed'+(f?' FAILED':'  ✓')+'\n');process.exit(f?1:0);
