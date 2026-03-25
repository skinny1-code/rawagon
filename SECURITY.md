# RAWagon Security Policy

## Supported Releases
| App | Version | Supported |
|-----|---------|-----------|
| RAWagon OS | current main | ✓ |
| All entity apps | current main | ✓ |
| Smart contracts | deployed v1 | ✓ |

## Scope
- Smart contracts: PawnRegistry, BreakFactory, GoldMint, IQTitle, EmployeeVault, FeeDistributor, LivingToken, CardVault
- App frontends: all apps in `/apps/`
- RAWNet node / Ganache config
- AllCard ZK identity system

## Reporting a Vulnerability
Email: **hello@rawagon.io** with subject `[SECURITY] <brief title>`

Include:
- Description and reproduction steps
- Affected contract(s) or app(s)
- Impact assessment
- Any suggested fix

Response SLA: 48 hours acknowledgement, 7 days for critical/high.

**Do not** open a public GitHub issue for security vulnerabilities.

## Out of Scope
- Testnet-only contracts with no real funds
- Social engineering
- Bugs in third-party dependencies (report to them directly)

## Responsible Disclosure
We follow coordinated disclosure. Do not publish details before:
- A fix is deployed, AND
- 30 days have passed (or we agree on a shorter window)

## Known Limitations (Testnet)
- MockUSDC faucet is intentionally open
- Ganache accounts use publicly known deterministic keys
- No real funds — testnet only until mainnet launch
