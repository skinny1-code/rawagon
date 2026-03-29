# R3WAGON System Architecture

## Network Overview

```
                    ┌─────────────────────────────────┐
                    │        User / Business           │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────▼──────────────────────┐
              │              1.nce AllCard                  │
              │  Biometric → ZK proof → Shifting PAN        │
              │  Patent: RAW-2026-PROV-001 (1, 2, 3)       │
              └──────┬──────────────────────┬──────────────┘
                     │                      │
        ┌────────────▼──────┐  ┌────────────▼──────────────┐
        │  EmployeeVault    │  │  CustomerInteraction      │
        │  (HR/Payroll)     │  │  (Identity/Payment auth)  │
        │  ZK only          │  │  ZK only                  │
        └────────────┬──────┘  └────────────┬──────────────┘
                     │                      │
        ┌────────────▼──────────────────────▼──────────────┐
        │              FeeDistributor.sol                   │
        │  0.1% of all network volume → LTN stakers        │
        │  Patent: RAW-2026-PROV-001 (4)                   │
        └────────────────────────┬─────────────────────────┘
                                 │
        ┌────────────────────────▼─────────────────────────┐
        │              Living Token (LTN)                   │
        │  Burn 0.001/tx | Stake 12% APY | Governance      │
        │  Lifecycle ownership: RAW-2026-PROV-001 (5)      │
        └──────────────────────────────────────────────────┘
```

## Data Flow — ZK Identity

1. User enrolls: AuraMe derives master key from biometrics (on-device only)
2. Commitment = keccak256(AES-256(vault_root)) stored on-chain
3. Merchant requests: "Is this customer 21+?"
4. AllCard generates zk-SNARK proof on-device using Groth16
5. Proof submitted to CustomerInteraction.sol
6. Contract returns: `true` or `false` — no raw data ever transmitted
7. Merchant receives authorization. Customer PII never leaves their device.

## Transaction Cost Model

| Operation | Gas units | Base gas (Gwei) | USD cost |
|-----------|-----------|----------------|---------|
| AllCard shift | 65,000 | 0.006 | $0.000825 |
| IQCAR mint | 120,000 | 0.006 | $0.001552 |
| LTN stake | 85,000 | 0.006 | $0.001100 |
| GTX mint | 80,000 | 0.006 | $0.001033 |
| ERC-20 transfer | 45,000 | 0.006 | $0.000582 |

At $2,116 ETH, 0.006 Gwei gas. All costs < $0.002.

## Products and Dependencies

| Product | Depends on | Standalone? |
|---------|-----------|-------------|
| QWKS Protocol | None | YES |
| BitPawn | None (QWKS optional) | YES |
| 1.nce AllCard | None | YES |
| Droppa | None (AllCard optional) | YES |
| AutoIQ | NHTSA API | YES |
| GoldSnap | Yahoo Finance, Chainlink | YES |
| ProfitPilot | Reads from other products | Partial |
| R3WAGON OS | All products optional | YES |
