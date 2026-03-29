Run the RAWagon test suite and report results.

Execute:

```bash
npm test
```

This runs vitest across all 5 packages:

- `packages/allcard-sdk` — AllCard PAN shifting and ZK proof tests
- `packages/fee-distributor` — Fee math, savings calculations, RPC helpers
- `packages/gold-oracle` — Gold/silver spot price fetching (Yahoo Finance)
- `packages/ltn-token` — LTN token stub tests
- `packages/zk-identity` — Core ZK proof, PAN derivation, biometric key derivation

Expected: **42 tests, all passing**.

If any tests fail:

1. Show the full failure output
2. Read the relevant source file and test file
3. Diagnose the root cause
4. Ask the user before making any fixes

If the user passes a package name (e.g. `zk-identity`), run only that package's tests:

```bash
npx vitest run packages/zk-identity/test
```
