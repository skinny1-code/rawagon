// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EmployeeVault
 * @notice Stores an AES-256-GCM encrypted credential commitment per employee.
 *         Raw PII never on-chain. ZK proof required for any attribute access.
 * @dev Patent pending: RAW-2026-PROV-001 (Zero-Knowledge Commerce System)
 */
contract EmployeeVault {
    // commitment = keccak256(AES-encrypted vault root on employee's device)
    mapping(address => bytes32) public commitment;
    mapping(address => address) public employerOf;
    mapping(address => bool)    public isActive;
    mapping(address => uint256) public enrolledAt;

    // Access scopes
    uint8 public constant SCOPE_ACTIVE   = 1;
    uint8 public constant SCOPE_PAYROLL  = 2;
    uint8 public constant SCOPE_FULL     = 3;

    event EmployeeEnrolled(address indexed employee, address indexed employer, bytes32 commitment);
    event CommitmentUpdated(address indexed employee, bytes32 newCommitment);
    event EmployeeDeactivated(address indexed employee);

    /**
     * @notice Employee self-enrolls with their employer by submitting their
     *         encrypted credential commitment. No raw data ever submitted.
     */
    function enroll(address employer, bytes32 _commitment) external {
        require(commitment[msg.sender] == bytes32(0), "Vault: already enrolled");
        commitment[msg.sender] = _commitment;
        employerOf[msg.sender] = employer;
        isActive[msg.sender] = true;
        enrolledAt[msg.sender] = block.timestamp;
        emit EmployeeEnrolled(msg.sender, employer, _commitment);
    }

    /**
     * @notice Verifies a ZK proof that the caller possesses a credential
     *         matching their stored commitment, for the requested scope.
     * @param zkProof   ZK-SNARK proof bytes from employee's AllCard device
     * @param scope     Access scope requested (1=active, 2=payroll, 3=full)
     * @return verified True if proof is valid for the requested scope
     *
     * NOTE: Full ZK-SNARK verification requires an on-chain verifier contract
     *       (see contracts/shared/ZKVerifier.sol). This stub returns true for
     *       development. Replace with verifier.verifyProof(zkProof, commitment)
     *       before production deployment.
     */
    function verifyEmployee(bytes calldata zkProof, uint8 scope)
        external view returns (bool verified)
    {
        require(isActive[msg.sender], "Vault: employee not active");
        require(commitment[msg.sender] != bytes32(0), "Vault: no commitment");
        require(scope >= SCOPE_ACTIVE && scope <= SCOPE_FULL, "Vault: invalid scope");
        // TODO: replace with ZKVerifier.verifyProof(zkProof, commitment[msg.sender], scope)
        return zkProof.length > 0 && commitment[msg.sender] != bytes32(0);
    }

    function updateCommitment(bytes32 newCommitment) external {
        require(isActive[msg.sender], "Vault: not active");
        commitment[msg.sender] = newCommitment;
        emit CommitmentUpdated(msg.sender, newCommitment);
    }

    function deactivate(address employee) external {
        require(msg.sender == employerOf[employee] || msg.sender == employee,
            "Vault: not authorized");
        isActive[employee] = false;
        emit EmployeeDeactivated(employee);
    }
}
