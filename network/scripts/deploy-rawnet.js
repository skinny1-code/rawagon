/**
 * R3NET Testnet Deployment Script
 * Deploys all R3WAGON contracts to R3NET testnet (chainId 720701)
 * or Base Sepolia for testing while R3NET spins up.
 *
 * Usage:
 *   NETWORK=base_sepolia node network/scripts/deploy-rawnet.js
 *   NETWORK=rawnet_testnet node network/scripts/deploy-rawnet.js
 */
'use strict';

const NETWORK = process.env.NETWORK || 'base_sepolia';
const DEPLOYER = process.env.DEPLOYER_ADDRESS || '0x0000000000000000000000000000000000000001';

const DEPLOY_ORDER = [
  // 1. Core token (no dependencies)
  { name: 'LivingToken',       path: 'contracts/LTN/LivingToken.sol',         args: [DEPLOYER] },
  // 2. ZK verifier (no dependencies)
  { name: 'ZKVerifier',        path: 'contracts/shared/ZKVerifier.sol',        args: [] },
  // 3. EmployeeVault (needs ZKVerifier)
  { name: 'EmployeeVault',     path: 'contracts/AllCard/EmployeeVault.sol',    args: ['$ZKVerifier'] },
  // 4. FeeDistributor (needs LTN)
  { name: 'FeeDistributor',    path: 'contracts/QWKS/FeeDistributor.sol',      args: ['$LivingToken', DEPLOYER] },
  // 5. GoldMint (needs price oracle)
  { name: 'GoldMint',          path: 'contracts/GoldSnap/GoldMint.sol',        args: [DEPLOYER] },
  // 6. IQTitle (no dependencies)
  { name: 'IQTitle',           path: 'contracts/AutoIQ/IQTitle.sol',           args: [DEPLOYER] },
  // 7. MigrationReceiver (needs oracle)
  { name: 'MigrationReceiver', path: 'contracts/shared/MigrationReceiver.sol', args: [DEPLOYER, DEPLOYER] },
  // 8. R3NET Bridge (needs ZKVerifier)
  { name: 'R3NETBridge',      path: 'contracts/R3NET/R3NETBridge.sol',      args: [DEPLOYER, '$ZKVerifier', DEPLOYER] },
];

const GAS_ESTIMATES = {
  LivingToken:       2_100_000,
  ZKVerifier:          800_000,
  EmployeeVault:     1_200_000,
  FeeDistributor:    1_800_000,
  GoldMint:          1_400_000,
  IQTitle:           1_600_000,
  MigrationReceiver:   900_000,
  R3NETBridge:      1_500_000,
};

const NETWORK_GAS = {
  rawnet_testnet: 60,    // 0.00006 Gwei
  base_sepolia:   6000,  // 0.006 Gwei
  localhost:      1000,  // 0.001 Gwei
};

function estimateCost(contractName, network) {
  const gasUnits = GAS_ESTIMATES[contractName] || 1_500_000;
  const gasPriceWei = NETWORK_GAS[network] || 6000;
  const ethCost = gasUnits * gasPriceWei * 1e-18;
  const usdCost = ethCost * 2061;
  return { gasUnits, gasPriceWei, ethCost, usdCost };
}

function printDeployPlan() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  R3NET Deployment Plan                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Network: ${NETWORK}`);
  console.log(`Deployer: ${DEPLOYER}\n`);

  let totalGas = 0, totalUSD = 0;
  DEPLOY_ORDER.forEach((c, i) => {
    const est = estimateCost(c.name, NETWORK);
    totalGas += est.gasUnits;
    totalUSD += est.usdCost;
    console.log(`  ${i+1}. ${c.name.padEnd(20)} ~${est.gasUnits.toLocaleString()} gas  $${est.usdCost.toFixed(6)}`);
  });

  console.log(`\n  ${'TOTAL'.padEnd(20)} ~${totalGas.toLocaleString()} gas  $${totalUSD.toFixed(4)}`);
  console.log(`\n  On R3NET: $${(totalUSD * 60/6000).toFixed(6)} total (100x cheaper)`);
  console.log(`  On Visa:   N/A (can't even compare)\n`);
}

printDeployPlan();

// In production with hardhat:
// npx hardhat run network/scripts/deploy-rawnet.js --network rawnet_testnet

console.log('To deploy with Hardhat:');
console.log('  cd network/config');
console.log('  npm install @nomicfoundation/hardhat-toolbox dotenv');
console.log('  PRIVATE_KEY=0x... npx hardhat run ../../network/scripts/deploy-rawnet.js --network base_sepolia\n');
