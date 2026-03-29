Walk through the RAWagon contract deployment process interactively.

## Pre-flight Checklist

Before deploying, verify:

1. `.env` exists and has `PRIVATE_KEY`, `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL`, `BASESCAN_API_KEY`
2. `npm run compile` passes — artifacts exist in `contracts/artifacts/`
3. `npm test` passes — all 42 unit tests green
4. Target network is confirmed (`base-sepolia` for testnet, `base` for mainnet)
5. Deployer wallet has enough ETH for gas (check balance via RPC)

## Deployment Order

Contracts must be deployed in this order due to dependencies:

1. **LivingToken** (LTN) — no dependencies
2. **FeeDistributor** — requires LivingToken address
3. **EmployeeVault** — no dependencies (uses commitment-hash verification; upgrade before high-value mainnet use)
4. **GoldMint** (GTX) — requires Chainlink XAU/USD oracle address + USDC address
5. **IQTitle** (IQCAR) — no dependencies

## Known Limitations

- **GoldMint on Base Sepolia**: No Chainlink XAU/USD oracle — `price()` will revert. Functional on Base mainnet only.
- **EmployeeVault**: Uses commitment-hash verification (not a full ZK circuit). Adequate for testnet; upgrade verifier before high-value mainnet use.

## Running the Deploy

```bash
# Step 1 — compile with Hardhat (needs internet for solc download)
cd contracts && npm run compile:hardhat

# Step 2 — deploy (env vars must be set in .env)
node scripts/deploy.js --network base-sepolia   # testnet
node scripts/deploy.js --network base           # mainnet (5s pause + warning)
```

After deployment, `contracts/deployments/<network>.json` is written with all addresses,
and Basescan verify commands are printed to stdout.

Ask the user which network they want to deploy to before proceeding.
