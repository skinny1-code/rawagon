Perform a security audit of the RAWagon codebase. Focus on the areas most critical to a fintech/blockchain project.

## Audit Scope

### 1. ZK Identity & Cryptography (`packages/zk-identity/index.js`)
- Key derivation: is HMAC-SHA256 used correctly? Are keys ever logged or leaked?
- `bioDerive`: check that the biometric vector is never stored raw; only the derived key matters
- `commit`/`prove`: ensure no PII leaks into the commitment or proof output
- Entropy: verify `genKey()` uses `crypto.randomBytes` (not Math.random)

### 2. Smart Contracts (`contracts/src/**/*.sol`)
- **LivingToken**: mint cap enforcement, role separation (`DEFAULT_ADMIN_ROLE` vs `BURNER_ROLE`)
- **FeeDistributor**: reentrancy risk in `claim()`, integer overflow/underflow, RPT rounding errors
- **EmployeeVault**: `verify()` is a stub — flag as critical security gap (no real ZK verification)
- **GoldMint**: oracle freshness (stale price check), USDC slippage, fee math precision
- **IQTitle**: VIN validation completeness, mint-fee withdrawal access control, tokenId collision check
- General: unchecked external calls, missing access modifiers, events on state changes

### 3. API & Key Handling
- `scripts/deploy.js`: confirm `PRIVATE_KEY` comes only from `.env` (never hardcoded)
- `packages/fee-distributor/index.js`: RPC endpoint hardcoded to mainnet — note if that's intentional
- `packages/gold-oracle/index.js`: Yahoo Finance unofficial API — flag for production readiness

### 4. Dependency Risk
- Check `contracts/package.json` and root `package.json` for known vulnerable versions (flag anything outdated)
- Note any `^` version ranges on security-critical packages (OZ, Chainlink)

## Output Format
For each finding:
- **Severity**: Critical / High / Medium / Low / Info
- **Location**: file:line
- **Issue**: what's wrong
- **Recommendation**: how to fix

End with a prioritized list of the top 3 items to address first.
