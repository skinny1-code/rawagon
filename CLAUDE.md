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
├── apps/                         # Frontend/application modules (currently stubs)
│   ├── 1nce-allcard/
│   ├── autoiq/
│   ├── bitpawn/
│   ├── droppa/
│   ├── goldsnap/
│   ├── profitpilot/
│   ├── qwks-protocol/
│   └── rawagon-os/
├── packages/                     # Core JS libraries (npm workspaces)
│   ├── allcard-sdk/              # AllCard class wrapping zk-identity
│   │   └── test/index.test.js
│   ├── fee-distributor/          # Fee calculation + Base RPC utilities
│   │   └── test/index.test.js
│   ├── gold-oracle/              # Gold/silver spot price feed (Yahoo Finance ETFs)
│   │   └── test/index.test.js
│   ├── ltn-token/                # LTN staking/governance client (stub)
│   │   └── test/index.test.js
│   └── zk-identity/              # Core ZK proofs + biometric key derivation
│       └── test/index.test.js
├── contracts/                    # Solidity smart contracts (Hardhat project)
│   ├── src/                      # Solidity source files (moved here to avoid node_modules glob)
│   │   ├── LTN/LivingToken.sol
│   │   ├── QWKS/FeeDistributor.sol
│   │   ├── AllCard/EmployeeVault.sol
│   │   ├── GoldSnap/GoldMint.sol
│   │   └── AutoIQ/IQTitle.sol
│   ├── scripts/
│   │   └── deploy.js             # Hardhat deploy script (all 5 contracts, ordered)
│   ├── deployments/              # Deployment manifests written after each deploy
│   │   └── base-sepolia.json     # example — created on first deploy
│   ├── compile-local.js          # Offline compiler using bundled solc npm package
│   ├── hardhat.config.js         # Hardhat config (networks, etherscan, paths)
│   └── package.json
├── docs/
│   └── architecture/
│       └── SYSTEM_OVERVIEW.md
├── scripts/
│   └── deploy.js                 # Root deploy runner — pre-flight checks + delegates to Hardhat
├── .github/workflows/
│   └── test.yml                  # CI: lint → format-check → typecheck → vitest → compile
├── vitest.config.mjs             # Vitest config (globals: true, node env)
├── eslint.config.mjs             # ESLint v10 flat config
├── .prettierrc                   # Prettier config
├── tsconfig.json                 # TypeScript config (allowJs, noEmit, paths)
├── .env.example                  # Required environment variables
└── package.json                  # Root monorepo config + all scripts
```

---

## Tech Stack

| Layer              | Technology                                                  |
| ------------------ | ----------------------------------------------------------- |
| Smart contracts    | Solidity ^0.8.24, OpenZeppelin v5, Chainlink v1.2           |
| Contract tooling   | Hardhat v2.22 + dotenv                                      |
| JavaScript runtime | Node.js ≥18 (native fetch, native crypto)                   |
| JavaScript style   | CommonJS (`require()`), no TypeScript                       |
| Test framework     | Vitest v4 (`globals: true`, node environment)               |
| Linter             | ESLint v10 (flat config, `eslint.config.mjs`)               |
| Formatter          | Prettier v3 (`.prettierrc`)                                 |
| Type checking      | TypeScript v6 (`tsc --noEmit`, `allowJs`, `checkJs: false`) |
| Blockchain target  | Base L2 mainnet / Base Sepolia testnet                      |
| CI                 | GitHub Actions (Node 20)                                    |

**No frontend framework has been chosen yet** — `apps/` directories are stubs with placeholder `package.json` files only.

---

## Development Workflows

### Install dependencies

```bash
npm install                   # root — installs all workspaces + links internal packages
cd contracts && npm install   # Hardhat, OpenZeppelin, Chainlink, dotenv
```

### All root scripts

```bash
npm test               # vitest run — 42 tests across 5 packages
npm run test:watch     # vitest watch mode
npm run lint:fix       # eslint --fix .
npm run format         # prettier --write .
npm run typecheck      # tsc --noEmit
npm run compile        # compile-local.js via --prefix contracts (bundled solc, no download)
npm run build          # alias for compile
```

### Run tests

```bash
npm test               # all packages via vitest
npm run test:watch     # interactive re-run on save
```

Test files live at `packages/<name>/test/index.test.js`. They are CJS files (use `require()`) — vitest globals (`describe`, `it`, `expect`, `vi`, etc.) are injected automatically via `globals: true` in `vitest.config.mjs`. Do **not** `require('vitest')` in test files.

### Compile contracts

```bash
npm run compile                          # from root — runs compile-local.js in contracts/
cd contracts && npm run compile          # direct — same result
cd contracts && npm run compile:hardhat  # Hardhat compiler (requires solc binary download)
```

`compile-local.js` is the default compiler. It uses `solc@0.8.26` bundled as a transitive dep
of `@nomicfoundation/hardhat-toolbox` — no network required. It reads all `.sol` files from
`contracts/src/`, resolves `@openzeppelin/` and `@chainlink/` imports from
`contracts/node_modules/` via a `findImports` callback, and writes JSON artifacts to
`contracts/artifacts/`.

`compile:hardhat` is retained for when you need Hardhat's full pipeline (deployment scripts,
gas reports, etc.) and have internet access to download the `solc 0.8.24` binary.

Solidity sources are in `contracts/src/` (not `contracts/` root) to avoid Hardhat picking up `node_modules/**/*.sol`.

### Deploy contracts

```bash
node scripts/deploy.js                       # base-sepolia (default)
node scripts/deploy.js --network base        # mainnet

# or directly via Hardhat (from contracts/ directory):
cd contracts && npm run deploy               # base-sepolia
cd contracts && npm run deploy:mainnet       # base mainnet
```

**Deploy requires Hardhat compilation first** (needs internet for solc binary):

```bash
cd contracts && npm run compile:hardhat      # produces Hardhat-format artifacts
node scripts/deploy.js --network base-sepolia
```

Deployment order is fixed (dependency-driven):

1. `LivingToken` → 2. `FeeDistributor` (needs LTN address) → 3. `EmployeeVault` → 4. `GoldMint` (needs XAU oracle + USDC) → 5. `IQTitle`

After deploy, addresses are saved to `contracts/deployments/<network>.json` and Basescan
verify commands are printed to stdout.

Requires `PRIVATE_KEY` and `BASE_SEPOLIA_RPC_URL` (or `BASE_RPC_URL` for mainnet) in `.env`.
The root `scripts/deploy.js` validates env vars and artifact presence before launching Hardhat.

### CI pipeline

GitHub Actions runs on push to `main`/`develop` and PRs to `main`:

1. `npm install` (root) + `npm install` (contracts)
2. `npm run lint:fix` — ESLint
3. `npx prettier --check .` — format check
4. `npm run typecheck` — tsc
5. `npm test` — vitest (42 tests, all blocking)
6. `npm run compile` — compile-local.js (bundled solc@0.8.26, no binary download)

---

## Key Packages

### `packages/zk-identity`

Core cryptographic primitives. **No external deps** — uses Node's built-in `crypto` module.

```js
const { derivePAN, commit, prove, bioDerive, genKey } = require('@rawagon/zk-identity');
```

| Function                   | Description                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `genKey()`                 | Returns a 32-byte random hex key (64-char string)                                                        |
| `derivePAN(keyHex, nonce)` | Deterministic 16-digit PAN via HMAC-SHA256 + BIP44 path. Returns `{ pan: "XXXX XXXX XXXX XXXX", nonce }` |
| `commit(creds, keyHex)`    | ZK commitment hash — returns `0x`-prefixed hex. No PII leaves the client                                 |
| `prove(creds, keyHex)`     | Returns `{ proof, commitment, ts }`                                                                      |
| `bioDerive(vec, salt?)`    | Derives master key from behavioral biometric vector. Returns `{ masterKey, salt }`                       |

**Patent pending RAW-2026-PROV-001** — do not reproduce outside this repo.

### `packages/allcard-sdk`

Thin wrapper around `zk-identity` with nonce management. Depends on `@rawagon/zk-identity` (workspace link).

```js
const { AllCard } = require('@rawagon/allcard-sdk');
const card = AllCard.create(); // new card with generated key, nonce=0
card.shift(); // { pan, nonce } — increments nonce each call
card.prove(creds); // { proof, commitment, ts }
new AllCard(existingKeyHex); // restore a card from a persisted key
```

### `packages/fee-distributor`

Base L2 RPC helpers and fee/savings math. No external deps.

```js
const { savings, transition, gasPrice, block } = require('@rawagon/fee-distributor');
```

| Function                                  | Description                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `savings(vol, txMo, visaRate=2.5)`        | Fee savings vs Visa. `vol` = monthly USD volume. Returns `{ visaAnnual, qwksAnnual, netSaving, qwksFee, toCustomer, roiPct }`. Fee split: 10% → LTN pool, 90% → customer |
| `transition(fee, ltnMo, price, apy=0.12)` | Months until LTN staking income covers fees. Returns `{ ltnNeeded, months, years }`                                                                                      |
| `gasPrice()`                              | Live Base mainnet gas price in Gwei (async)                                                                                                                              |
| `block()`                                 | Latest Base mainnet block number (async)                                                                                                                                 |

Hardcoded constants: `RPC = 'https://mainnet.base.org'`, `TX = 0.000825` (USD per tx).

### `packages/gold-oracle`

Fetches GLD/SLV ETF prices from Yahoo Finance. Module-level cache, TTL = 5 minutes.

```js
const { gold, silver, pawn } = require('@rawagon/gold-oracle');
```

| Function                                       | Description                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `gold()`                                       | Returns `{ spot, etf }` — spot in USD/troy oz (etf × 10)                                                               |
| `silver()`                                     | Returns `{ spot, etf }` — spot in USD/troy oz (etf / 0.9395)                                                           |
| `pawn(metal, grams, karat, ltv=0.6, buy=0.85)` | Returns `{ melt, pawnOffer, buyOffer, spot }`. `metal`: `'gold'` or `'silver'`. `karat`: 10/14/18/24 or 925 (sterling) |

> **Note:** Uses Yahoo Finance unofficial API — suitable for development/demo, not production.

### `packages/ltn-token`

Placeholder stub. Exports `{}`. Will implement LTN staking/governance client once contracts are deployed.

---

## Smart Contracts

All contracts in `contracts/src/`, target **Solidity ^0.8.24**, deploy on **Base L2**.

### `LivingToken.sol` (LTN) — `contracts/src/LTN/`

- ERC20, max supply 1 billion LTN
- Admin mints up to cap (`DEFAULT_ADMIN_ROLE`)
- Burns 0.001 LTN per transaction via `burnOnTx()` (requires `BURNER_ROLE`)
- Tracks `totalBurned` and `txCount`

### `FeeDistributor.sol` — `contracts/src/QWKS/`

- Accumulates 0.1% (10 bps) of reported network volume via `inflow(vol)`
- Distributes proportionally to LTN stakers via reward-per-token (RPT) accounting
- Interface: `stake(amount)`, `unstake(amount)`, `claim()`
- Approved senders report volume; approval via `approve(addr)` (owner only)

### `EmployeeVault.sol` — `contracts/src/AllCard/`

- Stores ZK credential commitments (`bytes32`) — **zero PII on-chain**
- Maps: `address → { employer, commitment, active }`
- `enroll(employer, commitment)` — stores HMAC commitment; `update(commitment)` — key rotation
- `verify(proof bytes32, scope 1-3)` — checks `bytes32(proof) == commit[msg.sender]` via assembly
  (proof is the 32-byte HMAC from `zk-identity prove().proof`, hex-decoded)
- `deactivate(addr)` — callable by employee or their employer

### `GoldMint.sol` (GTX) — `contracts/src/GoldSnap/`

- ERC20 gold-backed token; 1 GTX = 1/100 troy oz gold
- Chainlink XAU/USD oracle for live price; 0.25% minting fee; USDC-backed reserve
- `price()` enforces oracle freshness (`ORACLE_MAX_AGE = 2 hours`) and positive price — reverts if stale
- `mint(usdcAmount)` → mints GTX; `redeem(gtxAmount)` → returns USDC

### `IQTitle.sol` (IQCAR) — `contracts/src/AutoIQ/`

- ERC721 vehicle title NFTs; `tokenId = keccak256(VIN)`
- Immutable metadata: VIN, make, model, year, recalls, salvage flag, timestamp
- 0.001 ETH mint fee; 17-char VIN validation; no duplicate VINs
- `vinToId(vin)`, `setFee(fee)` (owner), `withdraw()` (owner)

---

## Environment Variables

Copy `.env.example` to `.env` before running anything:

```env
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
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

## Conventions & Patterns

### JavaScript

- Use **CommonJS** (`require`/`module.exports`), not ES modules — all source files are `.js`
- Node.js built-in `crypto` module for all cryptographic operations — do not add external crypto deps
- Use native `fetch` (Node 18+) for HTTP — no axios or node-fetch
- No TypeScript in source files — keep as `.js`
- Config files (`vitest.config.mjs`, `eslint.config.mjs`) use `.mjs` ESM format since tooling requires it

### Testing

- Test files live at `packages/<name>/test/index.test.js` — CJS, use `require()` for source modules
- Vitest globals (`describe`, `it`, `expect`, `vi`, `beforeAll`, etc.) are injected automatically — **do not** `require('vitest')`
- To mock `fetch` in tests, use `vi.stubGlobal('fetch', mockFn)` before calling the function under test
- Gold-oracle has a module-level cache (`C = {}`); tests work because the cache is empty on first import and `fetch` is stubbed before any test runs
- Contract tests go in `contracts/test/` (Hardhat/Mocha/Chai) — directory exists but no tests written yet

### Solidity

- Pragma: `^0.8.24`
- Import OpenZeppelin from `@openzeppelin/contracts` (v5 API)
- Import Chainlink from `@chainlink/contracts`
- Access control: prefer `AccessControl` for multi-role contracts; `Ownable` for simple single-owner
- 0-PII policy: never store personal data on-chain; use `bytes32` commitment hashes
- Use `keccak256(abi.encodePacked(...))` for deterministic IDs

### File Organization

- Each package: `packages/<name>/index.js` (flat, single-file) + `packages/<name>/test/index.test.js`
- Each contract family: `contracts/src/<Family>/<Contract>.sol`
- Apps: `apps/<name>/` (stubs — `package.json` only)

### Tooling

- **ESLint** (`eslint.config.mjs`): flat config v9+. CJS globals declared globally; vitest globals declared for `**/test/**/*.test.js` files only. Ignores `contracts/src/`, `contracts/artifacts/`, `contracts/cache/`
- **Prettier** (`.prettierrc`): `singleQuote: true`, `semi: true`, `tabWidth: 2`, `printWidth: 100`, `trailingComma: "es5"`
- **TypeScript** (`tsconfig.json`): `allowJs: true`, `checkJs: false`, `noEmit: true`. Paths map `@rawagon/*` to workspace `packages/*/index.js`. Excludes `contracts/` and `**/test/**`. Uses `ignoreDeprecations: "6.0"` for TS 6 compatibility
- **Hardhat** (`contracts/hardhat.config.js`): sources path is `./src` (not `.`); supports `base` and `base-sepolia` networks; Basescan etherscan config included
- **compile-local.js** (`contracts/compile-local.js`): offline-capable compiler using the `solc` npm package bundled with `hardhat-toolbox`. Invoked by `npm run compile` (root) and `cd contracts && npm run compile`. Use `compile:hardhat` when you need Hardhat's full pipeline and internet access is available

---

## Known Incomplete Areas

| Area                          | Status                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/`                       | All frontend apps are directory stubs — no implementation                                  |
| `packages/ltn-token/index.js` | Empty stub — exports `{}`                                                                  |
| `contracts/test/`             | Directory does not exist — no Hardhat/contract tests written                               |
| GoldMint on Base Sepolia      | No Chainlink XAU/USD oracle on Base Sepolia — `price()` will revert until oracle goes live |
| Deploy to mainnet             | `EmployeeVault.verify()` uses commitment-hash check only — upgrade before mainnet          |

---

## Important Addresses

### Base Mainnet

| Contract          | Address                                      |
| ----------------- | -------------------------------------------- |
| USDC              | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Chainlink XAU/USD | `0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6` |

### Base Sepolia (testnet)

| Contract          | Address                                                      |
| ----------------- | ------------------------------------------------------------ |
| USDC              | `0x036CbD53842c5426634e7929541eC2318f3dCF7e`                 |
| Chainlink XAU/USD | Not yet available — placeholder `0x000...000` in `deploy.js` |

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
