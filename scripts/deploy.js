#!/usr/bin/env node
require('dotenv').config({path:'../.env'});
const NET=process.argv.includes('--network')?process.argv[process.argv.indexOf('--network')+1]:'base-sepolia';
const USDC={'base':'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913','base-sepolia':'0x...'};
const XAU={'base':'0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6','base-sepolia':'0x...'};
const CONTRACTS=['LivingToken','FeeDistributor','EmployeeVault','GoldMint','IQTitle'];
console.log(`\nDeploying to ${NET}...`);
CONTRACTS.forEach(c=>{console.log(`  [todo] ${c} — add ethers.js deploy logic`);});
console.log('\nAdd PRIVATE_KEY + BASE_RPC_URL to .env then run with hardhat');
