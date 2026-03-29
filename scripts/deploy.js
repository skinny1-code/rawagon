#!/usr/bin/env node
// Deploy all RAWagon contracts via Hardhat.
// Usage: node scripts/deploy.js [--network base-sepolia|base]
// Requires: PRIVATE_KEY + BASE_SEPOLIA_RPC_URL (or BASE_RPC_URL for mainnet) in .env
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const NET = process.argv.includes('--network')
  ? process.argv[process.argv.indexOf('--network') + 1]
  : 'base-sepolia';

if (!['base', 'base-sepolia'].includes(NET)) {
  console.error(`✗ Unknown network: "${NET}". Valid options: base, base-sepolia`);
  process.exit(1);
}

// ── Pre-flight: required env vars ────────────────────────────────────────────
const required = ['PRIVATE_KEY', NET === 'base' ? 'BASE_RPC_URL' : 'BASE_SEPOLIA_RPC_URL'];
const missing = required.filter(
  (k) => !process.env[k] || process.env[k] === '' || process.env[k].startsWith('0x_')
);
if (missing.length) {
  console.error(`\n✗ Missing or placeholder env vars: ${missing.join(', ')}`);
  console.error('  Copy .env.example → .env and fill in real values.\n');
  process.exit(1);
}

// ── Pre-flight: Hardhat artifacts must exist ─────────────────────────────────
// Hardhat's artifact directory (populated by npx hardhat compile)
const hardhatArtifacts = path.join(__dirname, '..', 'contracts', 'artifacts', 'contracts');
if (!fs.existsSync(hardhatArtifacts)) {
  console.error('\n✗ Hardhat artifacts not found.');
  console.error(
    '  Run `cd contracts && npm run compile:hardhat` first (requires internet for solc download).\n'
  );
  process.exit(1);
}

// ── Launch Hardhat deploy ─────────────────────────────────────────────────────
console.log(`\nLaunching Hardhat deploy on ${NET}...\n`);
try {
  execSync(`npx hardhat run scripts/deploy.js --network ${NET}`, {
    cwd: path.join(__dirname, '..', 'contracts'),
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch {
  process.exit(1);
}
