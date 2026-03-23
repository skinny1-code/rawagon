# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install all workspace deps (run once after clone)
npm test             # vitest run (all packages)
npm run test:watch   # vitest watch mode
npm run lint:fix     # eslint --fix
npm run format       # prettier --write
npm run typecheck    # tsc --noEmit
npm run compile      # hardhat compile (all contracts)
npm run build        # tsc build all packages

# Single package
cd packages/zk-identity && npm test
cd packages/zk-identity && npm run build
```

## Architecture

RAWagon is a monorepo for a Base L2 (chain ID 8453) fintech platform. It has three layers:

### 1. Shared Package — `packages/zk-identity`
The cryptographic core. Implements:
- **Shifting PAN** — per-transaction card number derivation via HMAC-SHA256 (patent pending: RAW-2026-PROV-001)
- **BioDerive** — biometric key derivation from AuraMe vectors
- **ZK commitment** generation used by EmployeeVault on-chain

### 2. Smart Contracts — `contracts/`
All contracts target Solidity ^0.8.24 and OpenZeppelin v5. Key contracts:

| Contract | Token | Purpose |
|---|---|---|
| `LTN/LivingToken.sol` | LTN (ERC20) | Native token: 1B supply, per-tx burn, 12% staking APY |
| `QWKS/FeeDistributor.sol` | — | Distributes 0.1% network fees to LTN stakers (RPT model) |
| `AllCard/EmployeeVault.sol` | — | ZK credential registry; zero PII on-chain; proof verification with scopes 1–3 |
| `GoldSnap/GoldMint.sol` | GTX (ERC20) | 1 GTX = 1/100 troy oz gold; Chainlink XAU/USD oracle; USDC settlement |
| `AutoIQ/IQTitle.sol` | IQCAR (ERC721) | Vehicle title NFTs; tokenId = keccak256(VIN); 0.001 ETH mint fee |

### 3. Applications — `apps/`
Eight Next.js/frontend apps (all v0.1.0 scaffolds): `1nce-allcard`, `qwks-protocol`, `bitpawn`, `droppa`, `autoiq`, `goldsnap`, `rawagon-os`, `profitpilot`. Scripts are echo-only placeholders.

## Environment

Copy `.env.example` → `.env` before working with contracts or RPC calls:
- `BASE_RPC_URL` — Base L2 mainnet RPC
- `PRIVATE_KEY` — deployer wallet
- `BASESCAN_API_KEY` — contract verification
- `USDC_BASE` — `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- `CHAINLINK_XAU_USD` — `0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6`

## IP Notice

RAW-2026-PROV-001 covers shifting PAN, AuraMe biometric key derivation, ZK commerce protocols, FeeDistributor performance pricing, and Lifecycle Ownership Transition. MIT license applies to software; patent claims are reserved to RAWagon Systems, LLC.
