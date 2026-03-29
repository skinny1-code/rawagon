#!/usr/bin/env node
// Convert compile-local.js artifacts → Hardhat artifact format.
// Run before `npx hardhat test --no-compile` in network-restricted environments.
// Usage: node hh-artifacts.js
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'artifacts');
const OUT_DIR = path.join(__dirname, 'artifacts');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else if (e.name.endsWith('.json') && !e.name.endsWith('.dbg.json')) files.push(full);
  }
  return files;
}

let converted = 0;
let skipped = 0;

for (const file of walk(SRC_DIR)) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

  // Skip files that are already in Hardhat format or lack required fields
  if (!raw.contractName || !raw.abi || !raw.bytecode || !raw.sourceName) {
    skipped++;
    continue;
  }

  // Map compile-local.js sourceName (e.g. "LTN/LivingToken.sol")
  // to Hardhat sourceName under src/ (e.g. "src/LTN/LivingToken.sol")
  const hhSourceName = raw.sourceName.startsWith('src/') ? raw.sourceName : `src/${raw.sourceName}`;

  const hhArtifact = {
    _format: 'hh-sol-artifact-1',
    contractName: raw.contractName,
    sourceName: hhSourceName,
    abi: raw.abi,
    bytecode: raw.bytecode,
    deployedBytecode: raw.deployedBytecode || '0x',
    linkReferences: {},
    deployedLinkReferences: {},
  };

  // Write to artifacts/<sourceName>/<contractName>.json
  const outDir = path.join(OUT_DIR, hhSourceName);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${raw.contractName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(hhArtifact, null, 2));

  // Write minimal .dbg.json (required by some Hardhat internals)
  const dbgFile = path.join(outDir, `${raw.contractName}.dbg.json`);
  if (!fs.existsSync(dbgFile)) {
    fs.writeFileSync(
      dbgFile,
      JSON.stringify({ _format: 'hh-sol-dbg-1', buildInfo: '../../build-info/mock.json' }, null, 2)
    );
  }

  converted++;
}

console.log(`Converted ${converted} artifacts to Hardhat format (skipped ${skipped}).`);
