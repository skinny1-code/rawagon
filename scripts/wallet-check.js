#!/usr/bin/env node
/**
 * WAGON + FOUNDER wallet balance checker
 * Run: node scripts/wallet-check.js
 */
'use strict';
const { ethers } = require('ethers');

const WALLETS = [
  { name: 'WAGON Master',      addr: '0x629aa93822F3b4722934e8Edb68940e214a21ab7', role: 'network' },
  { name: 'WAGON Treasury',    addr: '0x781F67828a7835D10d997BF9894864A267E15fB6', role: 'network' },
  { name: 'WAGON Deployer',    addr: '0xd9676b253d2d644bB33339D74e16fb73216f0EfC', role: 'network' },
  { name: 'WAGON BridgeRelay', addr: '0x5117a5adc1b884a795B923916c27786988BCc648', role: 'network' },
  { name: 'FOUNDER EVM Main',  addr: '0x1eA5d26F9aaEFcc8A3684fB27D0005ABFbdA83d8', role: 'founder' },
  { name: 'FOUNDER Bridge',    addr: '0xC4ac99474A0839369E75D864Be39bdB927b7fcFa', role: 'founder' },
];

async function main() {
  const provider = new ethers.JsonRpcProvider(
    process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  );
  const [block, gas] = await Promise.all([
    provider.getBlockNumber(),
    provider.getFeeData(),
  ]);
  const gasGwei = parseFloat(ethers.formatUnits(gas.gasPrice || 0n, 'gwei')).toFixed(4);

  console.log('\n══════════════════════════════════════════════');
  console.log('  WAGON + FOUNDER Wallet Balances (Base L2)');
  console.log(`  Block: ${block.toLocaleString()} · Gas: ${gasGwei} Gwei`);
  console.log('══════════════════════════════════════════════\n');

  for (const w of WALLETS) {
    const bal = await provider.getBalance(w.addr);
    const eth = parseFloat(ethers.formatEther(bal)).toFixed(6);
    const tag = w.role === 'founder' ? '👤 FOUNDER' : '🪙 WAGON  ';
    const needsFunds = parseFloat(eth) === 0 ? ' ← needs testnet ETH' : '';
    console.log(`  ${tag} ${w.name.padEnd(20)} ${eth} ETH${needsFunds}`);
  }

  console.log('\n  RAWNet Testnet (chainId 720701):');
  console.log('  RPC: https://testnet-rpc.rawnet.io');
  console.log('  Faucet: https://faucet.testnet.rawnet.io');
  console.log('\n  Founder Solana: 6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78');
  console.log('══════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
