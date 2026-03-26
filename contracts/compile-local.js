#!/usr/bin/env node
// compile-local.js — compiles all contracts using the bundled solc npm package.
// Use this instead of `npx hardhat compile` in network-restricted environments.
// solc@0.8.26 is a transitive dep of @nomicfoundation/hardhat-toolbox and is
// always present after `npm install` in this directory.
'use strict';
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'artifacts');

// Recursively collect all .sol files under a directory
function findSolFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? findSolFiles(full) : e.name.endsWith('.sol') ? [full] : [];
  });
}

// Resolve @package/... imports from contracts/node_modules (or root node_modules)
function findImports(importPath) {
  const candidates = [
    path.join(__dirname, 'node_modules', importPath),
    path.join(__dirname, '..', 'node_modules', importPath),
  ];
  for (const p of candidates) {
    try {
      return { contents: fs.readFileSync(p, 'utf8') };
    } catch {
      // file not found — try next candidate
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const solFiles = findSolFiles(SRC);
const sources = {};
for (const f of solFiles) {
  sources[path.relative(SRC, f)] = { content: fs.readFileSync(f, 'utf8') };
}

const input = JSON.stringify({
  language: 'Solidity',
  sources,
  settings: {
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
    },
    optimizer: { enabled: true, runs: 200 },
  },
});

console.log(`\nCompiling ${solFiles.length} contracts with solc ${solc.version()}...\n`);
const output = JSON.parse(solc.compile(input, { import: findImports }));

let hasErrors = false;
for (const e of output.errors || []) {
  if (e.severity === 'error') {
    console.error('ERROR:', e.formattedMessage);
    hasErrors = true;
  } else {
    // print only the first line of warnings to keep output tidy
    console.warn('warn:', e.formattedMessage.split('\n')[0]);
  }
}
if (hasErrors) process.exit(1);

fs.mkdirSync(OUT, { recursive: true });
for (const [file, contracts] of Object.entries(output.contracts || {})) {
  for (const [name, artifact] of Object.entries(contracts)) {
    const outDir = path.join(OUT, path.dirname(file));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      JSON.stringify(
        {
          contractName: name,
          sourceName: file,
          abi: artifact.abi,
          bytecode: '0x' + artifact.evm.bytecode.object,
          deployedBytecode: '0x' + artifact.evm.deployedBytecode.object,
        },
        null,
        2
      )
    );
    console.log(`  ✓  ${name}  (${file})`);
  }
}
console.log('\nCompilation successful.\n');
