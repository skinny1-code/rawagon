#!/usr/bin/env node
/**
 * Deploy CardVault.sol to Ganache
 * Usage: node scripts/deploy-card-vault.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const ethers = require('ethers');

const RPC = process.env.GANACHE_RPC || 'http://10.117.122.142:8545';
const DEPLOYER_PK = '0xddc06d1377bf042c34db9888bec9bea62cd90f8b2ab64216f051f345792bd50e';
const USDC_ADDR   = '0xFC628dd79137395F3C9744e33b1c5DE554D94882';
const FEE_COLL    = '0x74b63E1C79b5210Df0dac928806D2f09ad7Ae967';

// Minimal ABI for deployment — full contract in contracts/Droppa/CardVault.sol
// Since we can't run solc here, we provide the bytecode from a pre-compiled stub
// To deploy: compile CardVault.sol with solc 0.8.24, paste bytecode below
const BYTECODE_PLACEHOLDER = '0x'; // Replace with: solc --optimize contracts/Droppa/CardVault.sol

async function main() {
  if (BYTECODE_PLACEHOLDER === '0x') {
    console.log('\n⚠  CardVault bytecode not compiled yet.');
    console.log('   Compile with: npx solc --optimize --abi --bin contracts/Droppa/CardVault.sol');
    console.log('   Then paste the bytecode into this file and re-run.\n');
    process.exit(0);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(DEPLOYER_PK, provider);
  console.log('Deploying CardVault.sol...');
  const factory  = new ethers.ContractFactory([], BYTECODE_PLACEHOLDER, wallet);
  const contract = await factory.deploy(USDC_ADDR, FEE_COLL);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log('✓ CardVault deployed:', addr);
  console.log('  Update VAULT_ADDR in apps/droppa/index.html with this address');

  // Update deployed-addresses.json
  const addrs = JSON.parse(fs.readFileSync('deployed-addresses.json'));
  addrs.rawnet_testnet.CardVault = addr;
  fs.writeFileSync('deployed-addresses.json', JSON.stringify(addrs, null, 2));
  console.log('  deployed-addresses.json updated');
}

main().catch(e => { console.error(e.message); process.exit(1); });
