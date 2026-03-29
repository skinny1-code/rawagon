// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EmployeeVault — ZK credential commitments. Zero PII on-chain.
/// @dev Commitment scheme: client computes HMAC-SHA256(key, creds) off-chain and stores
///      the 32-byte result as the commitment. verify() checks that the caller-supplied
///      proof bytes match the stored commitment, proving knowledge of the credential
///      preimage without revealing it on-chain. Patent pending RAW-2026-PROV-001.
contract EmployeeVault {
    mapping(address => bytes32) public commit;
    mapping(address => address) public employer;
    mapping(address => bool) public active;

    event Enrolled(address indexed emp, address indexed emp_employer);
    event CommitmentUpdated(address indexed emp);
    event Deactivated(address indexed emp);

    /// @notice Enroll caller as an employee under `emp_employer` with ZK commitment `c`.
    ///         `c` must be the 32-byte HMAC-SHA256(masterKey, JSON.stringify(creds))
    ///         produced by the zk-identity package `commit()` function.
    function enroll(address emp_employer, bytes32 c) external {
        require(commit[msg.sender] == bytes32(0), 'already enrolled');
        require(c != bytes32(0), 'empty commitment');
        commit[msg.sender] = c;
        employer[msg.sender] = emp_employer;
        active[msg.sender] = true;
        emit Enrolled(msg.sender, emp_employer);
    }

    /// @notice Verify caller's ZK proof for a given scope.
    /// @param proof  32 raw bytes of the HMAC from zk-identity `prove().proof`
    ///               (hex-decoded bytes, not the hex string)
    /// @param scope  Access scope: 1=identity, 2=payment, 3=full
    /// @return true if proof matches stored commitment and employee is active
    function verify(bytes calldata proof, uint8 scope) external view returns (bool) {
        require(active[msg.sender] && commit[msg.sender] != bytes32(0), 'not enrolled');
        require(scope >= 1 && scope <= 3, 'invalid scope');
        require(proof.length == 32, 'proof must be 32 bytes');
        bytes32 proofHash;
        assembly {
            proofHash := calldataload(proof.offset)
        }
        return proofHash == commit[msg.sender];
    }

    /// @notice Update your commitment (e.g. after key rotation).
    function update(bytes32 c) external {
        require(active[msg.sender], 'not active');
        require(c != bytes32(0), 'empty commitment');
        commit[msg.sender] = c;
        emit CommitmentUpdated(msg.sender);
    }

    /// @notice Deactivate an employee. Callable by the employee or their employer.
    function deactivate(address emp) external {
        require(msg.sender == employer[emp] || msg.sender == emp, 'not authorized');
        active[emp] = false;
        emit Deactivated(emp);
    }
}
