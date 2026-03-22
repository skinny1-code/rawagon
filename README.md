# RAWagon — Network-Layer Fintech Infrastructure

> **One network. Every transaction. Owned by its users.**

RAWagon is a monorepo for the RAWagon ecosystem — a blockchain-native payment and identity network built on Base L2.

[![Base L2](https://img.shields.io/badge/chain-Base%20L2-0052FF)](https://base.org)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Status](https://img.shields.io/badge/status-pre--seed-orange)](./)

---

## What this is

Traditional payment rails charge 2–3.5% per transaction. RAWagon charges **$0.000825 flat** — 3,054x cheaper than Visa — using Base Layer 2 at near-zero marginal cost.

| Product | What it does | Status |
|---------|-------------|--------|
| 1.nce AllCard | Sovereign identity + shifting-PAN card | Live |
| QWKS Protocol | Business payment rails + onboarding | Live |
| BitPawn | Pawn shop OS with live gold/silver pricing | Live |
| Droppa | Live commerce break platform | Beta |
| AutoIQ / IQTitle | Vehicle title NFTs on Base L2 | Beta |
| GoldSnap / GTX | Gold-backed token (1 GTX = 1/100 troy oz) | Beta |
| RAWagon OS | Unified operator dashboard | Live |
| ProfitPilot | Cross-product analytics + AI pricing | Beta |

---

## Repo structure

```
rawagon/
├── apps/                 # Customer-facing applications
│   ├── 1nce-allcard/     # Identity card + AllCard dashboard
│   ├── bitpawn/          # BitPawn pawn shop OS
│   ├── droppa/           # Live commerce
│   ├── autoiq/           # Vehicle title system
│   ├── goldsnap/         # GoldSnap + GTX/STX
│   ├── qwks-protocol/    # Business onboarding
│   ├── rawagon-os/       # Unified OS
│   └── profitpilot/      # Analytics
├── packages/             # Shared libraries
│   ├── zk-identity/      # ZK proof + AuraMe engine
│   ├── allcard-sdk/      # AllCard JS SDK
│   ├── ltn-token/        # LTN utilities + staking
│   ├── fee-distributor/  # FeeDistributor client
│   └── gold-oracle/      # Live pricing + GTX mint
├── contracts/            # Smart contracts (Base L2 / EVM)
│   ├── LTN/              # Living Token ERC-20 + governance
│   ├── AllCard/          # EmployeeVault, CustomerInteraction
│   ├── QWKS/             # BusinessRegistry, FeeDistributor
│   ├── GoldSnap/         # GoldMint, SilverMint (Chainlink)
│   ├── AutoIQ/           # IQTitle ERC-721
│   └── shared/           # ZKVerifier, AccessControl
├── docs/                 # Documentation and legal
│   ├── architecture/     # System diagrams
│   ├── patents/          # RAW-2026-PROV-001
│   ├── investment/       # Investment memorandum
│   └── brochures/        # Onboarding materials
├── scripts/              # Deploy + utility scripts
└── .github/workflows/    # CI/CD
```

---

## Quick start

```bash
git clone https://github.com/rawagon/rawagon.git
cd rawagon
pnpm install
pnpm --filter rawagon-os dev       # Unified dashboard
pnpm --filter 1nce-allcard dev     # AllCard
pnpm --filter qwks-protocol dev    # QWKS onboarding
pnpm test
```

---

## Contract addresses (Base L2 — Chain ID: 8453)

| Contract | Address | Notes |
|----------|---------|-------|
| LivingToken (LTN) | deploy pending | ERC-20, 1B supply |
| FeeDistributor | deploy pending | Routes 0.1% volume to stakers |
| BusinessRegistry | deploy pending | Business NFT identity |
| EmployeeVault | deploy pending | ZK HR records |
| GoldMint (GTX) | deploy pending | Chainlink XAU/USD |
| IQTitle (IQCAR) | deploy pending | ERC-721, keccak256(VIN) |

---

## APIs (all free, no key required)

| API | Data |
|-----|------|
| Yahoo Finance | GLD/SLV/ETH/BTC prices |
| CoinGecko | Crypto prices + 24h change |
| NHTSA vPIC | VIN decode |
| NHTSA API | Recalls + complaints |
| NPI Registry | Doctor/provider lookup |
| openFDA | Drug labels + recalls |
| HIBP (k-anonymity) | Breach check |
| Open-Meteo | Weather |
| BLS.gov | CPI + unemployment |
| Base L2 RPC | Blockchain data |
| ExchangeRate-API | FX rates |

---

## LTN Token

- **Chain:** Base L2 (ERC-20)
- **Supply:** 1,000,000,000 fixed cap
- **Price:** ~$0.084
- **Burn:** 0.001 LTN per transaction
- **Staking:** 12% APY from FeeDistributor
- **Governance:** All protocol parameters

---

## Patents

Five provisional patent applications — **RAW-2026-PROV-001** — covering:

1. Deterministic Shifting Payment Account Number System
2. Behavioral Biometric Cryptographic Key Derivation (AuraMe)
3. Zero-Knowledge Proof Smart Contract Commerce
4. Performance-Linked Fee Distribution Protocol
5. Lifecycle Ownership Transition System

See `docs/patents/` for the full provisional filing.

---

## Investment

$3.5M SAFE at $18M pre-money. See `docs/investment/` for the full memorandum.

---

## License

MIT. Patent-pending technologies are the exclusive property of RAWagon Systems, LLC. The MIT license covers software only and does not convey any license to the patented methods.

- **Web:** rawagon.io
- **Email:** hello@rawagon.io
- **Investment:** invest@rawagon.io
