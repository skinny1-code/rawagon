'use strict';
// Full Hardhat deploy script for all RAWagon contracts.
// Run via: npx hardhat run scripts/deploy.js --network base-sepolia
// Or from project root: node scripts/deploy.js [--network base-sepolia|base]
const hre = require('hardhat');
const path = require('path');
const fs = require('fs');

// Known external contract addresses per network
const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

// Chainlink XAU/USD — not yet available on Base Sepolia
const XAU = {
  base: '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6',
  'base-sepolia': '0x0000000000000000000000000000000000000000',
};

async function main() {
  const net = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log('='.repeat(60));
  console.log('RAWagon Contract Deployment');
  console.log('='.repeat(60));
  console.log(`Network:  ${net}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} ETH`);
  console.log('='.repeat(60));

  if (net === 'base') {
    console.warn('\n⚠  MAINNET DEPLOY — verify all addresses. Pausing 5s...\n');
    await new Promise((r) => setTimeout(r, 5000));
  }

  const oracleAddr = XAU[net];
  if (oracleAddr === '0x0000000000000000000000000000000000000000') {
    console.warn('⚠  Chainlink XAU/USD not available on Base Sepolia.');
    console.warn('   GoldMint.price() will revert until a real oracle is set.\n');
  }

  const deployed = {};

  // ── 1. LivingToken (LTN) ────────────────────────────────────────────────
  process.stdout.write('1/5  LivingToken (LTN)...');
  const LivingToken = await hre.ethers.getContractFactory('LivingToken');
  const ltn = await LivingToken.deploy(deployer.address);
  await ltn.waitForDeployment();
  deployed.LivingToken = await ltn.getAddress();
  console.log(`  ✓  ${deployed.LivingToken}`);

  // ── 2. FeeDistributor ────────────────────────────────────────────────────
  process.stdout.write('2/5  FeeDistributor...');
  const FeeDistributor = await hre.ethers.getContractFactory('FeeDistributor');
  const fd = await FeeDistributor.deploy(deployed.LivingToken, deployer.address);
  await fd.waitForDeployment();
  deployed.FeeDistributor = await fd.getAddress();
  console.log(`      ✓  ${deployed.FeeDistributor}`);

  // ── 3. EmployeeVault ─────────────────────────────────────────────────────
  process.stdout.write('3/5  EmployeeVault...');
  const EmployeeVault = await hre.ethers.getContractFactory('EmployeeVault');
  const ev = await EmployeeVault.deploy();
  await ev.waitForDeployment();
  deployed.EmployeeVault = await ev.getAddress();
  console.log(`      ✓  ${deployed.EmployeeVault}`);

  // ── 4. GoldMint (GTX) ────────────────────────────────────────────────────
  process.stdout.write('4/5  GoldMint (GTX)...');
  const GoldMint = await hre.ethers.getContractFactory('GoldMint');
  const gm = await GoldMint.deploy(oracleAddr, USDC[net], deployer.address);
  await gm.waitForDeployment();
  deployed.GoldMint = await gm.getAddress();
  console.log(`       ✓  ${deployed.GoldMint}`);

  // ── 5. IQTitle (IQCAR) ───────────────────────────────────────────────────
  process.stdout.write('5/5  IQTitle (IQCAR)...');
  const IQTitle = await hre.ethers.getContractFactory('IQTitle');
  const iq = await IQTitle.deploy(deployer.address);
  await iq.waitForDeployment();
  deployed.IQTitle = await iq.getAddress();
  console.log(`      ✓  ${deployed.IQTitle}`);

  // ── Save deployment manifest ─────────────────────────────────────────────
  const manifest = {
    network: net,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployed,
    externalAddresses: { USDC: USDC[net], XAU_USD_ORACLE: oracleAddr },
  };
  const outDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${net}.json`);
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('Deployment complete');
  console.log('='.repeat(60));
  console.log(JSON.stringify(deployed, null, 2));
  console.log(`\nManifest saved → contracts/deployments/${net}.json`);

  console.log('\nVerify on Basescan (run after deployment):');
  console.log(
    `  npx hardhat verify --network ${net} ${deployed.LivingToken} "${deployer.address}"`
  );
  console.log(
    `  npx hardhat verify --network ${net} ${deployed.FeeDistributor} "${deployed.LivingToken}" "${deployer.address}"`
  );
  console.log(`  npx hardhat verify --network ${net} ${deployed.EmployeeVault}`);
  console.log(
    `  npx hardhat verify --network ${net} ${deployed.GoldMint} "${oracleAddr}" "${USDC[net]}" "${deployer.address}"`
  );
  console.log(`  npx hardhat verify --network ${net} ${deployed.IQTitle} "${deployer.address}"`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
