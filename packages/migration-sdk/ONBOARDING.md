# QWKS Migration — From Any Processor to R3NET in 60 Minutes

## Why R3NET Over Base L2

| Network | Gas per tx | Cost on $100 | Settlement |
|---------|-----------|-------------|------------|
| Visa/Stripe | N/A | $2.50–$3.20 | T+2 days |
| Bitcoin | ~50k sat | $1.50 | 10 min |
| Ethereum L1 | 65k gas | $0.53 | 12 sec |
| Base L2 | 65k gas | $0.000825 | 2 sec |
| **R3NET** | 65k gas | **$0.0000082** | **500ms** |

R3NET is a ZK-rollup built on the OP Stack, settled on Base L2.
- **100x cheaper** than Base L2 (EigenDA vs Ethereum calldata)
- **304,878x cheaper** than Visa on same transaction volume
- **Same ZK proof system** — Groth16, EIP-197 pairing precompiles
- **Same EVM** — every contract that works on Base works on R3NET

---

## 3 Migration Paths

### Path A: Full Cut-Over (Recommended for new businesses)
1. Sign up → get testnet wallet + faucet ETH
2. Install `<script src="https://js.qwks.io/v1/widget.js">` in checkout
3. Test 3 transactions on R3NET Testnet (chainId 720701)
4. Go live → cancel old processor within 30 days

### Path B: Parallel Migration (Recommended for existing businesses)
1. Install QWKS widget alongside existing Stripe/Square
2. Route new/returning customers to QWKS
3. Track savings in ProfitPilot dashboard
4. Cut over fully when conversion rate hits target

### Path C: API Integration (Developers)
```bash
npm install @rawagon/rawnet-sdk @rawagon/zk-identity
```
```js
const { RAWNetSDK } = require('@rawagon/rawnet-sdk');
const sdk = new R3NETSDK('testnet'); // chainId 720701
const status = await sdk.status();   // { costPerTx: '$0.0000082', block: ... }
```

---

## What "ZK Simple Onboarding" Means

Traditional KYC: customer fills out form → you store their SSN, DOB, address
R3NET ZK: customer proves attributes on their device → you receive only `true/false`

```
Customer device:                Business receives:
  SSN: 123-45-6789      →       { verified: true }   (no SSN)
  Age: 34               →       { age_gte_21: true } (no age)
  Card: 4532 1234...    →       commitment: 0xf3a2…  (no card)
```

Zero PII stored. Zero PII transmitted. Cryptographic proof is the receipt.

---

## Smart Contract Interaction (Testnet)

```js
// After deploying MigrationReceiver.sol to R3NET testnet:
await migrationReceiver.registerMigration(
  "My Shop LLC",      // business name
  "retail",           // industry
  50000,              // monthly volume USD
  250                 // current processor rate (250 = 2.50% Visa)
);
// Emits: BusinessMigrated(address, monthlyVolume, baselineRateBps)
// FeeDistributor automatically uses this rate for savings calculation
```

---

## Processor Migration Checklist

- [ ] Create QWKS business account (3 min)
- [ ] Get R3NET testnet faucet funds: call MockUSDC.faucet() or use get-test-usdc button in any app
- [ ] Install payment widget in checkout (15 min)
- [ ] Run 3 test transactions on testnet (5 min)
- [ ] Set up AllCard employee access (optional, 30 min)
- [ ] Go live on R3NET mainnet (chainId 72070)
- [ ] Verify first real transaction in ProfitPilot
- [ ] Cancel old processor subscription (30-day notice typical)

Total: ~60 minutes for full migration. Zero downtime.
