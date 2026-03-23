#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const path = require('path');

const TESTS = [
  'tests/unit/zk.test.js',
  'tests/unit/fee-distributor.test.js',
  'tests/unit/ltn.test.js',
  'tests/unit/allcard.test.js',
  'tests/integration/workflows.test.js',
  'tests/e2e/network.test.js',
];

let total = 0, failed = 0;
const start = Date.now();

console.log('\n╔══════════════════════════════════════════╗');
console.log('║  RAWagon Full Test Suite                 ║');
console.log('╚══════════════════════════════════════════╝\n');

for (const t of TESTS) {
  const name = path.basename(t, '.js').replace('.test','');
  try {
    const out = execSync(`node ${t}`, { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    const match = out.match(/(\d+)\/(\d+) passed/);
    const p = match ? parseInt(match[1]) : 0;
    const n = match ? parseInt(match[2]) : 0;
    total += n;
    console.log(`  ✓ ${name.padEnd(26)} ${p}/${n}`);
  } catch(e) {
    failed++;
    const out = e.stdout || '';
    const match = out.match(/(\d+)\/(\d+)/);
    console.log(`  ✗ ${name.padEnd(26)} ${match ? match[0] : 'FAILED'}`);
    const failLines = out.split('\n').filter(l => l.includes('✗'));
    failLines.forEach(l => console.log('      ' + l.trim()));
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n══════════════════════════════════════════`);
console.log(`  ${failed === 0 ? '✓ ALL PASSING' : '✗ FAILURES: ' + failed} · ${total} tests · ${elapsed}s`);
console.log(`══════════════════════════════════════════\n`);
process.exit(failed ? 1 : 0);
