# RAWagon Architecture

## Flow
User/Business -> 1.nce AllCard (AuraMe biometric key -> shifting PAN -> ZK proof)
  -> EmployeeVault.sol (ZK HR) + CustomerInteraction (ZK commerce)
  -> FeeDistributor.sol (0.1% volume -> LTN stakers)
  -> LivingToken LTN (burn 0.001/tx | stake 12% APY | govern)

## Cost (Base L2, live)
AllCard shift: $0.000825 | IQCAR mint: $0.001552 | vs Visa 2.5% = 3,054x cheaper

## Patents: RAW-2026-PROV-001 (March 22, 2026)
1. Deterministic Shifting PAN
2. Behavioral Biometric Key Derivation (AuraMe)
3. ZK Proof Smart Contract Commerce
4. Performance-Linked Fee Distribution
5. Lifecycle Ownership Transition
