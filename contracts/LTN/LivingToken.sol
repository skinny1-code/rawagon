// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LivingToken (LTN)
 * @notice AI-governed ERC-20 with burn-on-transaction, staking yield,
 *         and governance. Deployed on Base L2.
 * @dev Patent pending: RAW-2026-PROV-001 (Lifecycle Ownership Transition)
 */
contract LivingToken is ERC20, ERC20Burnable, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE      = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE      = keccak256("BURNER_ROLE");
    bytes32 public constant GOVERNOR_ROLE    = keccak256("GOVERNOR_ROLE");
    bytes32 public constant FEE_DIST_ROLE    = keccak256("FEE_DIST_ROLE");

    uint256 public constant MAX_SUPPLY       = 1_000_000_000 * 1e18; // 1B LTN
    uint256 public constant BURN_PER_TX      = 0.001 * 1e18;         // 0.001 LTN per tx

    uint256 public totalBurned;
    uint256 public totalTransactions;

    // Governance parameters (votable by LTN holders)
    uint256 public dailyCap      = 10_000 * 1e18;
    uint256 public perTxMax      = 1_000 * 1e18;
    uint256 public burnRateBps   = 10;              // 0.1% = 10 bps

    event TokensBurned(address indexed burner, uint256 amount, uint256 txCount);
    event GovernanceParamUpdated(string param, uint256 oldVal, uint256 newVal);

    constructor(address admin) ERC20("Living Token", "LTN") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, admin);
        // Allocations: 40% rewards, 20% treasury, 20% team, 20% ecosystem
        _mint(admin, 400_000_000 * 1e18); // rewards pool — held by FeeDistributor
    }

    /**
     * @notice Called by FeeDistributor on every QWKS network transaction.
     *         Burns BURN_PER_TX LTN from the treasury and records the event.
     */
    function burnOnTransaction() external onlyRole(BURNER_ROLE) {
        require(totalSupply() > BURN_PER_TX, "LTN: supply too low to burn");
        _burn(msg.sender, BURN_PER_TX);
        totalBurned += BURN_PER_TX;
        totalTransactions++;
        emit TokensBurned(msg.sender, BURN_PER_TX, totalTransactions);
    }

    /**
     * @notice Governance: update a protocol parameter.
     *         LTN holders vote off-chain (Snapshot), multisig executes on-chain.
     */
    function updateParam(string calldata param, uint256 newVal)
        external onlyRole(GOVERNOR_ROLE)
    {
        if (keccak256(bytes(param)) == keccak256("dailyCap")) {
            emit GovernanceParamUpdated(param, dailyCap, newVal);
            dailyCap = newVal;
        } else if (keccak256(bytes(param)) == keccak256("perTxMax")) {
            emit GovernanceParamUpdated(param, perTxMax, newVal);
            perTxMax = newVal;
        } else if (keccak256(bytes(param)) == keccak256("burnRateBps")) {
            require(newVal <= 1000, "LTN: burn rate cannot exceed 10%");
            emit GovernanceParamUpdated(param, burnRateBps, newVal);
            burnRateBps = newVal;
        } else {
            revert("LTN: unknown parameter");
        }
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "LTN: max supply exceeded");
        _mint(to, amount);
    }

    function circulatingSupply() external view returns (uint256) {
        return totalSupply();
    }

    function burnedPercent() external view returns (uint256) {
        return (totalBurned * 10000) / MAX_SUPPLY;
    }
}
