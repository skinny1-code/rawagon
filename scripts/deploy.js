#!/usr/bin/env node
/**
 * R3WAGON — Full contract deployment script
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network base_sepolia
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network base
 *
 * Deploys in order:
 *   1. MockUSDC (testnet only — skip on mainnet)
 *   2. MockOracle x2 (XAU/USD, XAG/USD)
 *   3. LivingToken (LTN)
 *   4. FeeDistributor
 *   5. EmployeeVault
 *   6. GoldMint (GTX/STX)
 *   7. IQTitle (IQCAR)
 *   8. PawnRegistry
 *   9. BreakFactory
 *  10. EntityAllocation
 *
 * Output: deployed-addresses.json + .env patch
 */
require("dotenv").config();
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const MAINNET_USDC = {
  base:         "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  base_sepolia: null, // use MockUSDC
};

// Chainlink price feeds (mainnet only)
const CHAINLINK = {
  base: {
    XAU_USD: "0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6",
    XAG_USD: "0x379589227b15F1a12195D3f2d90bBc9F31f95235",
  },
};

// Wormhole token bridge
const WORMHOLE = {
  base:         "0x8EF8Cf077B2CCe4Ac97d2D6D57E81BeEe77D0A5a",
  base_sepolia: "0x86F55A04690fd7815A3D802bD587e83eA888B239",
};

// WAGON wallet addresses (from config/wallet.json)
const WAGON = {
  MASTER:       "0x629aa93822F3b4722934e8Edb68940e214a21ab7",
  TREASURY:     "0x781F67828a7835D10d997BF9894864A267E15fB6",
  FEE_COLL:     "0x74b63E1C79b5210Df0dac928806D2f09ad7Ae967",
  PRODUCT_DEV:  "0xf257c164737a5355A9535760Bbd4c6B5D9Af3b89",
  BD_MARKETING: "0x0Ae30f7026a8FcE130f49020F6d468dA8E4961d2",
  LTN_TREASURY: "0xAfA7c2c1872b2A377F77e1B3b3D4fB963ec2F316",
  RESERVE_FUND: "0x7C86E0C47c664D68C7D7511Bf091A2dFBCa6C572",
  DEPLOYER:     "0xd9676b253d2d644bB33339D74e16fb73216f0EfC",
};

const FOUNDER = {
  EVM_MAIN:     "0x1eA5d26F9aaEFcc8A3684fB27D0005ABFbdA83d8",
  BRIDGE_RELAY: "0xC4ac99474A0839369E75D864Be39bdB927b7fcFa",
};

async function deploy(name, args = []) {
  console.log(`  Deploying ${name}...`);
  const Factory = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`  ✓ ${name}: ${addr}`);
  return { contract, addr };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const netName = network.name;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const isTestnet = netName !== "base";

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  R3WAGON Contract Deployment                 ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Network:  ${netName} (chainId ${chainId})`);
  console.log(`  Deployer: ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:  ${ethers.formatEther(bal)} ETH`);
  if (bal === 0n) {
    console.error("  ✗ Deployer has no ETH! Get testnet ETH first:");
    console.error("    https://sepoliafaucet.com (then bridge to Base Sepolia)");
    console.error("    or https://www.alchemy.com/faucets/base-sepolia");
    process.exit(1);
  }
  console.log("");

  const addrs = { network: netName, chainId: Number(chainId), deployedAt: new Date().toISOString() };

  // ── Step 1: MockUSDC (testnet only) ──────────────────────────
  let usdcAddr;
  if (isTestnet) {
    console.log("── Step 1: MockUSDC (testnet) ──");
    const { addr } = await deploy("MockUSDC");
    addrs.MockUSDC = addr;
    usdcAddr = addr;
  } else {
    usdcAddr = MAINNET_USDC[netName];
    addrs.USDC = usdcAddr;
    console.log(`── Step 1: Using mainnet USDC: ${usdcAddr}`);
  }

  // ── Step 2: Mock Oracles (testnet) or Chainlink (mainnet) ────
  let xauOracle, xagOracle;
  console.log("── Step 2: Price Oracles ──");
  if (isTestnet) {
    const xau = await deploy("MockOracle", [8, "XAU/USD Mock"]);
    const xag = await deploy("MockOracle", [8, "XAG/USD Mock"]);
    // Set initial prices: gold $4133.80, silver $32.50
    await xau.contract.setPrice(413380000000n);
    await xag.contract.setPrice(3250000000n);
    console.log("  ✓ Oracle prices set: XAU=$4133.80, XAG=$32.50");
    xauOracle = xau.addr;
    xagOracle = xag.addr;
    addrs.MockOracleXAU = xauOracle;
    addrs.MockOracleXAG = xagOracle;
  } else {
    xauOracle = CHAINLINK[netName].XAU_USD;
    xagOracle = CHAINLINK[netName].XAG_USD;
    addrs.ChainlinkXAU = xauOracle;
    addrs.ChainlinkXAG = xagOracle;
    console.log(`  ✓ Chainlink XAU: ${xauOracle}`);
    console.log(`  ✓ Chainlink XAG: ${xagOracle}`);
  }

  // ── Step 3: LivingToken (LTN) ─────────────────────────────────
  console.log("── Step 3: LivingToken (LTN) ──");
  const ltn = await deploy("LivingToken", [WAGON.TREASURY]);
  addrs.LivingToken = ltn.addr;

  // ── Step 4: FeeDistributor ────────────────────────────────────
  console.log("── Step 4: FeeDistributor ──");
  const fd = await deploy("FeeDistributor", [ltn.addr, usdcAddr, WAGON.MASTER]);
  addrs.FeeDistributor = fd.addr;

  // Grant FeeDistributor burner role on LTN
  await ltn.contract.setBurner(fd.addr, true);
  console.log("  ✓ FeeDistributor granted LTN burn role");

  // ── Step 5: EmployeeVault ─────────────────────────────────────
  console.log("── Step 5: EmployeeVault ──");
  // Deploy a simple ZKVerifier stub for testnet
  const zkv = await deploy("ZKVerifier");
  addrs.ZKVerifier = zkv.addr;
  const ev = await deploy("EmployeeVault");
  addrs.EmployeeVault = ev.addr;

  // ── Step 6: GoldMint (GTX/STX) ───────────────────────────────
  console.log("── Step 6: GoldMint (GTX/STX) ──");
  const gm = await deploy("GoldMint", [xauOracle, xagOracle, usdcAddr, WAGON.TREASURY]);
  addrs.GoldMint = gm.addr;

  // ── Step 7: IQTitle (IQCAR ERC-721) ──────────────────────────
  console.log("── Step 7: IQTitle (IQCAR) ──");
  const iq = await deploy("IQTitle", [fd.addr]);
  addrs.IQTitle = iq.addr;

  // ── Step 8: PawnRegistry ──────────────────────────────────────
  console.log("── Step 8: PawnRegistry ──");
  const pr = await deploy("PawnRegistry");
  await pr.contract.setFeeDistributor(fd.addr);
  await pr.contract.setUSDC(usdcAddr);
  addrs.PawnRegistry = pr.addr;

  // ── Step 9: BreakFactory ──────────────────────────────────────
  console.log("── Step 9: BreakFactory ──");
  const bf = await deploy("BreakFactory");
  addrs.BreakFactory = bf.addr;

  // ── Step 10: EntityAllocation ─────────────────────────────────
  console.log("── Step 10: EntityAllocation ──");
  const wormhole = WORMHOLE[netName] || WORMHOLE["base_sepolia"];
  const ea = await deploy("EntityAllocation", [
    WAGON.PRODUCT_DEV,
    WAGON.BD_MARKETING,
    WAGON.LTN_TREASURY,
    WAGON.RESERVE_FUND,
    FOUNDER.BRIDGE_RELAY,   // FOUNDER bridge relay — separate from WAGON
    usdcAddr,
    ltn.addr,
    wormhole,
    WAGON.MASTER,
  ]);
  addrs.EntityAllocation = ea.addr;

  // Approve all products in FeeDistributor
  for (const addr of [pr.addr, bf.addr, iq.addr, gm.addr]) {
    await fd.contract.approveProduct(addr);
  }
  console.log("  ✓ All products approved in FeeDistributor");

  // ── Save addresses ─────────────────────────────────────────────
  const outPath = path.join(__dirname, "../deployed-addresses.json");
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  existing[netName] = addrs;
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
  console.log(`\n  ✓ Addresses saved to deployed-addresses.json`);

  // Generate .env patch
  const envPatch = Object.entries(addrs)
    .filter(([k]) => !["network","chainId","deployedAt"].includes(k))
    .map(([k, v]) => `${k.toUpperCase().replace(/([A-Z])/g, "_$1").replace(/^_/,"")}_ADDRESS=${v}`)
    .join("\n");

  const envPatchPath = path.join(__dirname, "../.env.deployed");
  fs.writeFileSync(envPatchPath, `# Auto-generated by deploy.js — ${new Date().toISOString()}\n# Network: ${netName}\n\n${envPatch}\n`);
  console.log(`  ✓ .env patch saved to .env.deployed`);

  // Print summary
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Deployment Complete                         ║");
  console.log("╚══════════════════════════════════════════════╝");
  Object.entries(addrs).forEach(([k, v]) => {
    if (!["network","chainId","deployedAt"].includes(k)) {
      console.log(`  ${k.padEnd(22)} ${v}`);
    }
  });

  const explorerBase = netName === "base_sepolia"
    ? "https://sepolia.basescan.org/address/"
    : "https://basescan.org/address/";
  console.log(`\n  Explorer: ${explorerBase}${addrs.EntityAllocation}`);
  console.log("\n  Next steps:");
  console.log("  1. Copy .env.deployed contents into .env");
  console.log("  2. Run: node scripts/wallet-check.js");
  console.log("  3. Get testnet USDC: call MockUSDC.faucet() from your wallet");
  console.log("  4. Open apps and connect MetaMask to Base Sepolia (chainId 84532)");
}

main().catch((e) => { console.error(e); process.exit(1); });
