# RAWagon — Network-Layer Fintech Infrastructure

> $0.000825 per transaction. 3,054x cheaper than Visa. Owned by its users.

[![Base L2](https://img.shields.io/badge/chain-Base%20L2-0052FF)](https://base.org)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

## Products

| App           | What                             | Path               |
| ------------- | -------------------------------- | ------------------ |
| 1.nce AllCard | ZK identity + shifting PAN       | apps/1nce-allcard  |
| QWKS Protocol | Business payment rails           | apps/qwks-protocol |
| BitPawn       | Pawn shop OS + live gold pricing | apps/bitpawn       |
| Droppa        | Live commerce breaks             | apps/droppa        |
| AutoIQ        | Vehicle title NFTs on Base L2    | apps/autoiq        |
| GoldSnap/GTX  | Gold-backed token                | apps/goldsnap      |
| RAWagon OS    | Unified dashboard                | apps/rawagon-os    |
| ProfitPilot   | Analytics                        | apps/profitpilot   |

## Quick test (Termux)

```
node packages/zk-identity/index.js
```

## Contracts (Base L2)

- LivingToken (LTN): contracts/LTN/LivingToken.sol
- FeeDistributor: contracts/QWKS/FeeDistributor.sol
- EmployeeVault: contracts/AllCard/EmployeeVault.sol
- GoldMint (GTX): contracts/GoldSnap/GoldMint.sol
- IQTitle (IQCAR): contracts/AutoIQ/IQTitle.sol

## Patents: RAW-2026-PROV-001 — rawagon.io — hello@rawagon.io
