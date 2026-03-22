#!/usr/bin/env node
/**
 * RAWagon — Base L2 deployment script
 * Usage: node scripts/deploy.js [--network base|base-sepolia]
 */

require('dotenv').config();

const DEPLOY_ORDER = [
  { name: 'LivingToken',     path: 'contracts/LTN/LivingToken.sol',        args: [] },
  { name: 'FeeDistributor',  path: 'contracts/QWKS/FeeDistributor.sol',    args: ['LivingToken'] },
  { name: 'EmployeeVault',   path: 'contracts/AllCard/EmployeeVault.sol',   args: [] },
  { name: 'GoldMint (GTX)', path: 'contracts/GoldSnap/GoldMint.sol',      args: ['CHAINLINK_XAU_USD', 'USDC_BASE'] },
  { name: 'IQTitle',         path: 'contracts/AutoIQ/IQTitle.sol',          args: ['FeeDistributor'] },
];

const CHAINLINK = {
  'base':         { XAU_USD: '0x...', XAG_USD: '0x...' },
  'base-sepolia': { XAU_USD: '0x...', XAG_USD: '0x...' },
};

const USDC = {
  'base':         '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x...',
};

async function main() {
  const network = process.argv.includes('--network')
    ? process.argv[process.argv.indexOf('--network') + 1]
    : 'base-sepolia';

  console.log(`\nDeploying RAWagon contracts to ${network}...`);
  console.log('─'.repeat(50));

  const deployed = {};

  for (const contract of DEPLOY_ORDER) {
    const resolvedArgs = contract.args.map(arg => {
      if (deployed[arg]) return deployed[arg];
      if (arg === 'CHAINLINK_XAU_USD') return CHAINLINK[network].XAU_USD;
      if (arg === 'USDC_BASE') return USDC[network];
      return arg;
    });

    console.log(`Deploying ${contract.name}...`);
    console.log(`  Path:  ${contract.path}`);
    console.log(`  Args:  ${JSON.stringify(resolvedArgs)}`);

    // TODO: Replace with actual ethers.js deployment:
    // const factory = await ethers.getContractFactory(contract.name);
    // const instance = await factory.deploy(...resolvedArgs);
    // await instance.waitForDeployment();
    // deployed[contract.name] = await instance.getAddress();

    deployed[contract.name] = `0x${'0'.repeat(40)}`; // placeholder
    console.log(`  ✓ ${contract.name}: ${deployed[contract.name]}\n`);
  }

  console.log('─'.repeat(50));
  console.log('Deployment complete. Update .env with contract addresses:\n');
  for (const [name, address] of Object.entries(deployed)) {
    console.log(`  ${name.toUpperCase().replace(/\s/g,'_')}_ADDRESS=${address}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
