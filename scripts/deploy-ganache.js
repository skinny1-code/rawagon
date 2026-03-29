#!/usr/bin/env node
/**
 * R3WAGON — Ganache deploy script (no Hardhat needed)
 * Uses ethers.js + solc to compile + deploy all contracts.
 *
 * Usage: node scripts/deploy-ganache.js
 * Requires: Ganache running on http://10.117.122.142:8545
 */
'use strict';
const ethers = require('ethers');
const fs     = require('fs');
const path   = require('path');

const RPC      = process.env.GANACHE_RPC || 'http://10.117.122.142:8545';
const DEPLOYER_PK = '0xddc06d1377bf042c34db9888bec9bea62cd90f8b2ab64216f051f345792bd50e';
const FEE_COLL = '0x74b63E1C79b5210Df0dac928806D2f09ad7Ae967';

// Known deployed addresses (deterministic Ganache with fixed seed)
const KNOWN = {
  MockUSDC:       '0xFC628dd79137395F3C9744e33b1c5DE554D94882',
  MockOracleXAU:  '0x5b1869D9A4C187F2EAa108f3062412ecf0526b24',
  MockOracleXAG:  '0xD86C8F0327494034F60e25074420BcCF560D5610',
  LivingToken:    '0xaD888d0Ade988EbEe74B8D4F39BF29a8d0fe8A8D',
  FeeDistributor: '0x7C728214be9A0049e6a86f2137ec61030D0AA964',
  EmployeeVault:  '0x86072CbFF48dA3C1F01824a6761A03F105BCC697',
  GoldMint:       '0xFF6049B87215476aBf744eaA3a476cBAd46fB1cA',
  IQTitle:        '0xA586074FA4Fe3E546A132a16238abe37951D41fE',
  PawnRegistry:   '0x2D8BE6BF0baA74e0A907016679CaE9190e80dD0A',
  BreakFactory:   '0xaf5C4C6C7920B4883bC6252e9d9B8fE27187Cf68',
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(DEPLOYER_PK, provider);
  const network  = await provider.getNetwork();
  const block    = await provider.getBlockNumber();

  console.log('\n⬡  R3WAGON Ganache Deploy');
  console.log(`   RPC:     ${RPC}`);
  console.log(`   Chain:   ${network.chainId}`);
  console.log(`   Block:   ${block}`);
  console.log(`   Deployer: ${wallet.address}\n`);

  // Verify known contracts are alive
  let allGood = true;
  for (const [name, addr] of Object.entries(KNOWN)) {
    const code = await provider.getCode(addr);
    const alive = code !== '0x';
    console.log(`  ${alive ? '✓' : '✗'} ${name.padEnd(18)} ${addr}`);
    if (!alive) allGood = false;
  }

  if (!allGood) {
    console.log('\n  ⚠  Some contracts missing — restart Ganache with --deterministic flag');
    console.log('  ganache --port 8545 --host 0.0.0.0 --deterministic --chain.chainId 720701 --quiet\n');
    process.exit(1);
  }

  // Save addresses
  const out = {
    _comment: 'Live Ganache addresses — R3NET Testnet chainId 720701',
    _rpc: RPC,
    _deployed: new Date().toISOString(),
    rawnet_testnet: { network: 'RAWNet Testnet', chainId: Number(network.chainId), rpc: RPC, ...KNOWN }
  };
  fs.writeFileSync(
    path.join(__dirname, '..', 'deployed-addresses.json'),
    JSON.stringify(out, null, 2)
  );

  // Check if CardVault is deployed (it won't be on fresh Ganache — needs manual deploy)
  const cvCode = await provider.getCode('0x0000000000000000000000000000000000000000');
  if(cvCode === '0x') {
    console.log('  ⚠  CardVault.sol not yet deployed — run: node scripts/deploy-card-vault.js');
  }

  console.log('\n  ✓ All contracts live · deployed-addresses.json updated\n');
  console.log('  Next: node server.js\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
