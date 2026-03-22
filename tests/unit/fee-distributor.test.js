
'use strict';
const assert=require('assert');
const fd=require('../../packages/fee-distributor');
let p=0,f=0;
const t=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++;}catch(e){console.log('  ✗ '+n+': '+e.message);f++;}};
console.log('\n=== fee-distributor ===\n');
t('savings visa correct',()=>{assert.strictEqual(fd.savings(50000,500,2.5).visaAnnual,15000);});
t('savings qwks minimal',()=>{assert.ok(fd.savings(50000,500,2.5).qwksAnnual<10);});
t('savings 9:1 ratio',()=>{const s=fd.savings(50000,500,2.5);assert.ok(Math.abs(s.toCustomer/s.qwksFee-9)<0.01);});
t('savings higher rate = more',()=>{assert.ok(fd.savings(50000,500,3.2).netSaving>fd.savings(50000,500,2.5).netSaving);});
t('transition pStar formula',()=>{const tgt=Math.round(1499/(0.084*0.12));assert.ok(Math.abs(fd.transition(1499,100,0.084,0.12).ltnNeeded-tgt)<=1);});
t('transition yield at P*',()=>{assert.ok(Math.abs(fd.transition(1499,100,0.084,0.12).annualYieldAtTransition-1499)<1);});
t('feeDistInflow 0.1%',()=>{assert.strictEqual(fd.feeDistInflow(3444000000),3444000);});
t('yieldPerLTN correct',()=>{assert.ok(Math.abs(fd.yieldPerLTN(3444000,40000000)-0.0861)<0.001);});
console.log('\n'+p+'/'+(p+f)+' passed'+(f?' FAILED':'  ✓')+'\n');process.exit(f?1:0);
