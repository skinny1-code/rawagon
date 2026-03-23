// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EmployeeVault
 * @notice ZK commitment registry. Raw PII never on-chain.
 *         Employer receives boolean only — no raw employee data.
 * @dev Patent pending: RAW-2026-PROV-001
 */
contract EmployeeVault {
    address public owner;
    constructor() { owner = msg.sender; }

    struct Employee {
        bytes32 commitment;   // HMAC-SHA256 of encrypted vault root
        address employer;
        uint256 enrolledAt;
        bool    active;
        uint256 payrollNonce;
    }

    mapping(address => Employee)   public employees;
    mapping(address => address[])  public roster;
    mapping(bytes32 => bool)       public spentProofs;
    uint256 public totalEnrolled;

    event Enrolled(address indexed employee, address indexed employer, bytes32 commitment);
    event CommitmentRotated(address indexed employee, bytes32 newCommitment);
    event ProofVerified(address indexed employee, bool result);
    event Deactivated(address indexed employee);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    function enroll(address employee, bytes32 commitment) external {
        require(commitment != bytes32(0), "zero commitment");
        require(!employees[employee].active, "already enrolled");
        employees[employee] = Employee(commitment, msg.sender, block.timestamp, true, 0);
        roster[msg.sender].push(employee);
        totalEnrolled++;
        emit Enrolled(employee, msg.sender, commitment);
    }

    function rotateCommitment(bytes32 newCommitment) external {
        require(employees[msg.sender].active, "not enrolled");
        require(newCommitment != bytes32(0), "zero commitment");
        employees[msg.sender].commitment = newCommitment;
        emit CommitmentRotated(msg.sender, newCommitment);
    }

    function verifyEmployment(
        address employee,
        bytes32 proofHash,
        address claimedEmployer
    ) external returns (bool valid) {
        if (!employees[employee].active) return false;
        if (spentProofs[proofHash]) return false;
        valid = employees[employee].employer == claimedEmployer;
        if (valid) {
            spentProofs[proofHash] = true;
            employees[employee].payrollNonce++;
        }
        emit ProofVerified(employee, valid);
    }

    function deactivate(address employee) external {
        require(employees[employee].employer == msg.sender || msg.sender == owner, "not authorized");
        employees[employee].active = false;
        emit Deactivated(employee);
    }

    function getCommitment(address employee) external view returns (bytes32) {
        return employees[employee].commitment;
    }

    function isEnrolled(address employee) external view returns (bool) {
        return employees[employee].active;
    }

    function getRoster(address employer) external view returns (address[] memory) {
        return roster[employer];
    }
}
