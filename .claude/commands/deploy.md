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
3. **EmployeeVault** — no dependencies (note: `verify()` is a stub — do not deploy to mainnet until ZK verifier is implemented)
4. **GoldMint** (GTX) — requires Chainlink XAU/USD oracle address + USDC address
5. **IQTitle** (IQCAR) — no dependencies

## Known Blockers
- `scripts/deploy.js` is currently a stub with TODO comments — full ethers.js deploy logic is not yet implemented
- `EmployeeVault.verify()` is a stub — **do not deploy to mainnet**
- Chainlink XAU/USD is not available on Base Sepolia — use placeholder `0x000...000` for testnet

## Next Steps
If asked to implement deploy logic, use ethers.js v6 with the Hardhat runtime environment.
Refer to `contracts/hardhat.config.js` for network configuration and `scripts/deploy.js` for
the list of contracts to deploy.

Ask the user which network they want to deploy to before proceeding.
