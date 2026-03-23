# CLAUDE.md — RAWagon Codebase Guide

This file provides essential context for AI assistants working in this repository.

---

## Project Overview

**RAWagon** is an early-stage Base L2 fintech monorepo. It provides infrastructure for:

- **1NCE AllCard** — Virtual prepaid card with ZK identity and shifting PAN (Primary Account Number)
- **AutoIQ** — Vehicle title NFTs on Base L2 (ERC721)
- **BitPawn** — Pawn shop OS with live gold pricing
- **Droppa** — Live commerce breaks
- **GoldSnap** — Gold-backed ERC20 token (GTX) pegged via Chainlink oracle
- **ProfitPilot** — Analytics dashboard
- **QWKS Protocol** — Business payment rails with fee distribution
- **RAWagon OS** — Unified multi-product dashboard

The core innovation is **deterministic PAN derivation + ZK proofs** that eliminate on-chain PII, combined with a micro-fee model on Base L2 (claimed $0.000825/tx vs Visa's ~$0.20).

---

## Repository Structure

```
rawagon/
├── apps/                    # Frontend/application modules (currently stubs)
│   ├── 1nce-allcard/
│   ├── autoiq/
│   ├── bitpawn/
│   ├── droppa/
│   ├── goldsnap/
│   ├── profitpilot/
│   ├── qwks-protocol/
│   └── rawagon-os/
├── packages/                # Core JS/TS libraries (npm workspaces)
│   ├── allcard-sdk/         # AllCard class wrapping zk-identity
│   ├── fee-distributor/     # Fee calculation + Base RPC utilities
│   ├── gold-oracle/         # Gold/silver spot price feed (Yahoo Finance ETFs)
│   ├── ltn-token/           # LTN staking/governance client (placeholder)
│   └── zk-identity/         # Core ZK proofs + biometric key derivation
├── contracts/               # Solidity smart contracts (Hardhat project)
│   ├── LTN/                 # LivingToken.sol (ERC20, LTN)
│   ├── QWKS/                # FeeDistributor.sol
│   ├── AllCard/             # EmployeeVault.sol (ZK credential storage)
│   ├── GoldSnap/            # GoldMint.sol (GTX token)
│   └── AutoIQ/              # IQTitle.sol (ERC721 vehicle titles)
├── docs/
│   └── architecture/
│       └── SYSTEM_OVERVIEW.md
├── scripts/
│   └── deploy.js            # Contract deployment (WIP — mostly TODO)
├── .github/workflows/
│   └── test.yml             # CI (Node 20, non-blocking)
├── .env.example             # Required environment variables
└── package.json             # Root monorepo config
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity ^0.8.24, OpenZeppelin v5, Chainlink v1.2 |
| Contract tooling | Hardhat v2.22 |
| JavaScript runtime | Node.js ≥18 (ESM fetch, native crypto) |
| JavaScript style | CommonJS (`require()`), no TypeScript |
| Blockchain target | Base L2 mainnet / Base Sepolia testnet |
| CI | GitHub Actions (Node 20) |

**No frontend framework has been chosen yet** — `apps/` directories are stubs with placeholder `package.json` files only.

---

## Key Packages

### `packages/zk-identity`
Core cryptographic primitives. **No external deps** — uses Node's built-in `crypto` module.

```js
const { derivePAN, commit, prove, bioDerive, genKey } = require('./packages/zk-identity');
```

- `genKey()` — generates 32-byte random hex key
- `derivePAN(keyHex, nonce)` — deterministic 16-digit PAN via HMAC-SHA256 + BIP44 path. Returns formatted `XXXX XXXX XXXX XXXX` string.
- `commit(creds, keyHex)` — ZK commitment hash (no PII on-chain)
- `prove(creds, keyHex)` — returns `{ proof, commitment, timestamp }`
- `bioDerive(vec, salt)` — derives master key from behavioral biometric vector

### `packages/allcard-sdk`
Thin wrapper around `zk-identity` with nonce management.

```js
const card = AllCard.create();
card.shift();    // new PAN with incremented nonce
card.prove(creds);
```

### `packages/fee-distributor`
Base L2 RPC helpers and fee/savings math.

- `savings(volume, txMonth, visaRate=2.5%)` — calculates fee savings vs Visa. Fee split: 10% → LTN pool, 90% → customer.
- `transition(fee, ltnMonthly, price, apy=0.12)` — months to LTN-pays-for-itself calculator
- Hardcoded Base mainnet RPC and $0.000825 tx fee constant

### `packages/gold-oracle`
Fetches GLD/SLV ETF prices from Yahoo Finance. Results cached 5 minutes.

- `pawn(karat, grams, ltv)` — returns pawn offer and buy offer in USD

---

## Smart Contracts

All contracts target **Solidity ^0.8.24** and are deployed on **Base L2**.

### `LivingToken.sol` (LTN) — `contracts/LTN/`
- ERC20, max supply 1 billion
- Burns 1e15 wei (0.001 LTN) per transaction via `BURNER_ROLE`
- Admin mints up to cap; tracks total burned + tx count

### `FeeDistributor.sol` — `contracts/QWKS/`
- Accumulates 0.1% (10 bps) of network volume
- Distributes proportionally to LTN stakers
- Interface: `stake()`, `unstake()`, `claim()`
- Approved senders report volume; rewards tracked via RPT (reward-per-token)

### `EmployeeVault.sol` — `contracts/AllCard/`
- Stores ZK credential commitments (`bytes32`) — **no PII on-chain**
- Maps: `address → { employer, commitment, active }`
- `enroll()`, `verify()` (TODO: real ZK verifier), `update()`, `deactivate()`

### `GoldMint.sol` (GTX) — `contracts/GoldSnap/`
- ERC20 gold-backed token; 1 GTX = 1/100 troy oz
- Chainlink oracle for live XAU/USD price
- 0.25% minting fee; USDC-backed reserve
- `mint(usdcAmount)` / `redeem(gtxAmount)`

### `IQTitle.sol` (IQCAR) — `contracts/AutoIQ/`
- ERC721 vehicle title NFTs
- `tokenId = keccak256(VIN)`
- Immutable metadata: VIN, make, model, year, recalls, salvage flag, timestamp
- 0.001 ETH mint fee; 17-char VIN validation; no duplicate VINs

---

## Environment Variables

Copy `.env.example` to `.env` before running anything:

```env
BASE_RPC_URL=https://mainnet.base.org
ETH_RPC_URL=https://eth.llamarpc.com
PRIVATE_KEY=0x_your_deployer_key
BASESCAN_API_KEY=
USDC_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CHAINLINK_XAU_USD=0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6
NEXT_PUBLIC_CHAIN_ID=8453
NODE_ENV=development
```

**Never commit a real `PRIVATE_KEY` to the repo.**

---

## Development Workflows

### Install dependencies
```bash
npm install           # root (installs all workspaces)
cd contracts && npm install  # Hardhat + OpenZeppelin
```

### Compile contracts
```bash
cd contracts && npm run compile   # hardhat compile
```

### Run tests
```bash
cd contracts && npm test          # hardhat test
npm test                          # root (currently placeholder scripts)
```

### Deploy contracts
```bash
node scripts/deploy.js            # WIP — requires .env + Base Sepolia RPC
```

The deploy script accepts a `NETWORK` env var (`base-sepolia` default, `base-mainnet` for prod).

### CI
GitHub Actions runs on push to `main`/`develop` and on PRs to `main`. It executes test scripts for `fee-distributor`, `zk-identity`, and `gold-oracle` packages (currently non-blocking via `|| true`).

---

## Conventions & Patterns

### JavaScript
- Use **CommonJS** (`require`/`module.exports`), not ES modules
- Node.js built-in `crypto` module for all cryptographic operations — do not add external crypto deps
- Use native `fetch` (Node 18+) for HTTP — no axios or node-fetch
- No TypeScript — keep files as `.js`

### Solidity
- Solidity pragma: `^0.8.24`
- Import OpenZeppelin from `@openzeppelin/contracts` (v5 API)
- Import Chainlink from `@chainlink/contracts`
- Access control: prefer `AccessControl` over `Ownable` for multi-role contracts; use `Ownable` only for simple single-owner cases
- 0-PII policy: never store personal data on-chain; use `bytes32` commitment hashes
- Use `keccak256(abi.encodePacked(...))` for deterministic IDs

### File Organization
- Each package lives in `packages/<name>/index.js` (flat, single-file)
- Each app lives in `apps/<name>/` (stubs currently)
- Each contract family gets its own subdirectory under `contracts/`

### Testing
- Contract tests go in `contracts/test/` (Hardhat/Mocha/Chai)
- Package tests run via the `test` npm script in each package
- CI is currently non-blocking (`|| true`) — fix before shipping to production

---

## Known Incomplete Areas

- `apps/` — all frontend apps are directory stubs only; no implementation exists
- `scripts/deploy.js` — deployment logic is TODO comments; contracts cannot be deployed yet
- `contracts/AllCard/EmployeeVault.sol` — `verify()` function has a TODO for real ZK verifier integration
- `packages/ltn-token/index.js` — minimal placeholder (58 bytes), no real implementation
- Root `package.json` scripts (`dev`, `build`, `test`) are placeholder `echo` commands
- No unit tests exist for any package

---

## Important Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Chainlink XAU/USD | `0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6` |

---

## Security Notes

- ZK identity uses HMAC-SHA256 with BIP44 derivation paths for deterministic but non-reversible PAN generation
- All ZK credential verification is off-chain; only commitment hashes (`bytes32`) are stored on-chain
- `PRIVATE_KEY` in `.env` should be a dedicated deployer wallet, never a personal wallet
- The gold oracle uses Yahoo Finance (unofficial API) — suitable for development/demo, not production

---

## Patent Claims

The system references provisional patent **RAW-2026-PROV-001** covering:
1. Behavioral biometric master key derivation
2. Shifting PAN with ZK commitment
3. ZK commerce layer (off-chain proof, on-chain commitment)
4. Micro-fee distribution to token stakers
5. Lifecycle ownership NFTs (vehicle titles)

Do not reproduce these core algorithms in external projects without authorization.
