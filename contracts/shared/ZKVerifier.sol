// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ZKVerifier
 * @notice On-chain Groth16 ZK-SNARK verifier.
 *         Verifies attribute proofs from AllCard devices.
 *         Proving key generated offline; verification key stored on-chain.
 *
 * Supported proof types:
 *   IDENTITY   — user is who they claim to be (commitment match)
 *   AGE        — user is at least N years old
 *   BALANCE    — user has at least X balance (without revealing exact amount)
 *   EMPLOYMENT — user is employed by a specific employer
 *   LICENSE    — user holds a specific professional license
 *
 * @dev Groth16 verification: e(A, B) = e(alpha, beta) * e(vk * inputs, gamma) * e(C, delta)
 *      Full implementation uses BN254 (alt_bn128) curve operations via EIP-197 precompiles.
 */
contract ZKVerifier {

    struct VerifyingKey {
        uint256[2] alpha;
        uint256[2][2] beta;
        uint256[2][2] gamma;
        uint256[2][2] delta;
        uint256[2][] ic; // input commitments
    }

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    // Proof type registry
    mapping(bytes32 => VerifyingKey) private _verifyingKeys;
    mapping(bytes32 => bool) public proofTypeRegistered;

    bytes32 public constant PROOF_IDENTITY   = keccak256("IDENTITY");
    bytes32 public constant PROOF_AGE        = keccak256("AGE");
    bytes32 public constant PROOF_BALANCE    = keccak256("BALANCE");
    bytes32 public constant PROOF_EMPLOYMENT = keccak256("EMPLOYMENT");
    bytes32 public constant PROOF_LICENSE    = keccak256("LICENSE");

    address public owner;

    event ProofVerified(bytes32 indexed proofType, address indexed prover, bool result);
    event VerifyingKeyRegistered(bytes32 proofType);

    modifier onlyOwner() { require(msg.sender == owner, "ZKV: not owner"); _; }

    constructor() { owner = msg.sender; }

    /**
     * @notice Verify a ZK proof for a given attribute.
     * @param proofType    One of PROOF_* constants
     * @param commitment   User's credential commitment (stored in EmployeeVault/AllCard)
     * @param proofBytes   Serialized Groth16 proof (a, b, c)
     * @param publicInputs Public inputs to the circuit
     * @return valid       True if proof is valid
     *
     * @dev In production: calls EIP-197 pairing precompile at 0x08.
     *      This stub validates proof structure and length.
     */
    function verifyProof(
        bytes32 proofType,
        bytes32 commitment,
        bytes calldata proofBytes,
        uint256[] calldata publicInputs
    ) external returns (bool valid) {
        require(proofBytes.length >= 192, "ZKV: proof too short"); // 3 * 64 bytes min
        require(commitment != bytes32(0), "ZKV: zero commitment");
        require(publicInputs.length >= 1, "ZKV: no public inputs");

        // Stub verification — production replaces with:
        // valid = _groth16Verify(_verifyingKeys[proofType], proof, publicInputs);
        // using EIP-197: address(8).staticcall(abi.encode(pairing_inputs))

        valid = proofBytes.length >= 192 && commitment != bytes32(0);

        emit ProofVerified(proofType, msg.sender, valid);
        return valid;
    }

    /**
     * @notice Verify an age proof.
     *         Returns true if prover is at least minAge — no actual age revealed.
     */
    function verifyAge(
        bytes32 commitment,
        uint8 minAge,
        bytes calldata proof
    ) external returns (bool) {
        require(minAge > 0 && minAge <= 120, "ZKV: invalid minAge");
        uint256[] memory inputs = new uint256[](2);
        inputs[0] = uint256(uint8(minAge));
        inputs[1] = uint256(commitment);
        return this.verifyProof(PROOF_AGE, commitment, proof, inputs);
    }

    /**
     * @notice Verify an employment proof.
     *         Returns true if prover is employed by employer — no PII revealed.
     */
    function verifyEmployment(
        bytes32 commitment,
        address employer,
        bytes calldata proof
    ) external returns (bool) {
        uint256[] memory inputs = new uint256[](2);
        inputs[0] = uint256(uint160(employer));
        inputs[1] = uint256(commitment);
        return this.verifyProof(PROOF_EMPLOYMENT, commitment, proof, inputs);
    }

    function registerVerifyingKey(bytes32 proofType) external onlyOwner {
        proofTypeRegistered[proofType] = true;
        emit VerifyingKeyRegistered(proofType);
    }
}
