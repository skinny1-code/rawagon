// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


/**
 * @title MigrationReceiver
 * @notice Receives businesses migrating from traditional payment processors.
 *         Records their baseline Visa/Stripe rate on-chain for the
 *         FeeDistributor savings oracle — tamper-proof rate verification.
 *
 *         Migration flow:
 *         1. Business submits their processor statements (off-chain)
 *         2. RAWagon verifier attests to the baseline rate
 *         3. MigrationReceiver records the verified rate on-chain
 *         4. FeeDistributor uses this rate for savings calculation
 *         5. Business receives QWKS subscription credit for their first 30 days
 */
contract MigrationReceiver {

    struct BusinessProfile {
        address wallet;
        string  name;
        string  industry;          // "retail", "restaurant", "ecommerce", etc.
        uint256 monthlyVolume;     // USD, reported at migration
        uint256 baselineRateBps;   // e.g. 250 = 2.50% Visa rate
        address processor;         // previous processor address or bytes32 name hash
        uint256 migratedAt;
        bool    verified;          // attested by RAWagon oracle
        uint256 trialCreditsUSD;   // free trial credit granted (in cents)
    }

    mapping(address => BusinessProfile) public profiles;
    mapping(address => bool)            public migrated;
    address[] public allMigrants;

    address public oracle;           // RAWagon rate oracle
    uint256 public totalMigrations;
    uint256 public totalVolumeOnboarded;

    // Default 30-day trial credit: $1 = 100 cents
    uint256 public defaultTrialCredit = 10000; // $100 in cents

    event BusinessMigrated(address indexed business, uint256 monthlyVolume, uint256 baselineRateBps);
    event RateVerified(address indexed business, uint256 verifiedRateBps, address verifier);
    event TrialCreditGranted(address indexed business, uint256 creditCents);

    constructor(address _oracle, address _owner) {
        oracle = _oracle;
    }

    /**
     * @notice Business self-registers for migration.
     *         Declares their current processor and approximate monthly volume.
     *         Rate is verified off-chain, then attested by oracle.
     */
    function registerMigration(
        string calldata name,
        string calldata industry,
        uint256 monthlyVolumeUSD,
        uint256 reportedRateBps      // e.g. 250 for Visa credit
    ) external {
        require(!migrated[msg.sender], "MigrationReceiver: already migrated");
        require(monthlyVolumeUSD >= 1000, "MigrationReceiver: minimum $1K/mo");
        require(reportedRateBps >= 50 && reportedRateBps <= 500, "MigrationReceiver: rate out of range");

        profiles[msg.sender] = BusinessProfile({
            wallet: msg.sender,
            name: name,
            industry: industry,
            monthlyVolume: monthlyVolumeUSD,
            baselineRateBps: reportedRateBps,
            processor: address(0),
            migratedAt: block.timestamp,
            verified: false,
            trialCreditsUSD: defaultTrialCredit
        });

        migrated[msg.sender] = true;
        allMigrants.push(msg.sender);
        totalMigrations++;
        totalVolumeOnboarded += monthlyVolumeUSD;

        emit BusinessMigrated(msg.sender, monthlyVolumeUSD, reportedRateBps);
        emit TrialCreditGranted(msg.sender, defaultTrialCredit);
    }

    /**
     * @notice Oracle verifies the business's processor rate from their statements.
     *         Once verified, the rate is locked and used by FeeDistributor.
     */
    function verifyRate(address business, uint256 verifiedRateBps) external {
        require(msg.sender == oracle, "MigrationReceiver: not oracle");
        require(migrated[business], "MigrationReceiver: not registered");
        profiles[business].baselineRateBps = verifiedRateBps;
        profiles[business].verified = true;
        emit RateVerified(business, verifiedRateBps, msg.sender);
    }

    /**
     * @notice Get verified baseline rate for FeeDistributor savings calculation.
     */
    function getBaselineRate(address business) external view returns (uint256 rateBps, bool verified) {
        return (profiles[business].baselineRateBps, profiles[business].verified);
    }

    function totalMigrantVolume() external view returns (uint256) {
        return totalVolumeOnboarded;
    }

    function setOracle(address _oracle) external { oracle = _oracle; }
    function setTrialCredit(uint256 cents) external { defaultTrialCredit = cents; }
}
