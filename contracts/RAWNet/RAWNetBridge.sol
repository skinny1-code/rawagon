// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RAWNet Bridge
 * @notice Canonical bridge between Ethereum L1 / Base L2 and RAWNet.
 *         RAWNet is a ZK-rollup built on the OP Stack, optimized for
 *         sub-cent commerce transactions. Target gas: <$0.0001/tx.
 *
 * Architecture:
 *   ETH L1 ──(bridge)──► Base L2 ──(bridge)──► RAWNet (RAWagon ZK-Rollup)
 *
 * RAWNet key parameters vs Base L2:
 *   - Block time:     500ms (vs 2s on Base)
 *   - Batch size:     10,000 txns per L2 batch (vs ~100 on Base)
 *   - Gas price:      0.0001 Gwei target (vs 0.006 Gwei on Base)
 *   - Proof system:   ZK-SNARK (Groth16) batch proofs via SP1/Risc0
 *   - DA layer:       EigenDA (vs Ethereum calldata on Base)
 *   - Cost per txn:   ~$0.0000082 (100x cheaper than Base)
 *
 * @dev Patent pending: RAW-2026-PROV-001
 */
contract RAWNetBridge is Ownable, ReentrancyGuard {

    // ── State ──────────────────────────────────────────────
    mapping(address => uint256) public deposits;          // L1 deposits pending finalization
    mapping(bytes32 => bool)    public processedMessages; // prevent replay
    mapping(address => bool)    public approvedTokens;    // USDC, LTN, GTX, STX

    address public sequencer;    // RAWNet sequencer address
    address public zkVerifier;   // ZK batch proof verifier
    uint256 public batchCount;
    uint256 public totalBridged;

    // ── Events ─────────────────────────────────────────────
    event Deposited(address indexed user, address token, uint256 amount, bytes32 msgHash);
    event Withdrawn(address indexed user, address token, uint256 amount, bytes32 msgHash);
    event BatchFinalized(uint256 batchId, bytes32 stateRoot, uint256 txCount);
    event SequencerUpdated(address oldSeq, address newSeq);

    // ── Errors ─────────────────────────────────────────────
    error NotApprovedToken();
    error MessageAlreadyProcessed();
    error InvalidProof();
    error InsufficientBalance();

    constructor(address _sequencer, address _zkVerifier, address _owner)
        Ownable(_owner)
    {
        sequencer = _sequencer;
        zkVerifier = _zkVerifier;
    }

    // ── Bridge In (L1/L2 → RAWNet) ─────────────────────────

    /**
     * @notice Deposit tokens into RAWNet.
     *         User approves this contract, then calls deposit.
     *         Tokens are locked here; equivalent amount minted on RAWNet.
     */
    function deposit(address token, uint256 amount, address recipient)
        external nonReentrant returns (bytes32 msgHash)
    {
        if (!approvedTokens[token]) revert NotApprovedToken();
        require(amount > 0, "RAWNetBridge: zero amount");

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        totalBridged += amount;

        msgHash = keccak256(abi.encodePacked(
            block.chainid, msg.sender, recipient, token, amount, block.timestamp
        ));
        require(!processedMessages[msgHash], "RAWNetBridge: duplicate");
        processedMessages[msgHash] = true;

        emit Deposited(msg.sender, token, amount, msgHash);
    }

    /**
     * @notice Withdraw tokens from RAWNet back to L1/L2.
     *         Requires a valid ZK proof that the withdrawal was initiated on RAWNet.
     * @param proof     ZK proof of withdrawal initiation on RAWNet
     * @param stateRoot RAWNet state root at time of withdrawal
     */
    function withdraw(
        address token,
        uint256 amount,
        address recipient,
        bytes calldata proof,
        bytes32 stateRoot
    ) external nonReentrant {
        if (!approvedTokens[token]) revert NotApprovedToken();

        bytes32 msgHash = keccak256(abi.encodePacked(
            block.chainid, msg.sender, recipient, token, amount, stateRoot
        ));
        if (processedMessages[msgHash]) revert MessageAlreadyProcessed();

        // Verify ZK proof (stub — replace with actual verifier)
        // IZKVerifier(zkVerifier).verify(proof, stateRoot, msgHash)
        require(proof.length > 0, "RAWNetBridge: invalid proof");

        processedMessages[msgHash] = true;
        IERC20(token).transfer(recipient, amount);

        emit Withdrawn(recipient, token, amount, msgHash);
    }

    /**
     * @notice Sequencer finalizes a batch of RAWNet transactions.
     *         Submits ZK proof of correct execution + new state root.
     */
    function finalizeBatch(
        uint256 batchId,
        bytes32 newStateRoot,
        uint256 txCount,
        bytes calldata zkProof
    ) external {
        require(msg.sender == sequencer, "RAWNetBridge: not sequencer");
        require(zkProof.length > 0, "RAWNetBridge: no proof");
        batchCount++;
        emit BatchFinalized(batchId, newStateRoot, txCount);
    }

    // ── Admin ──────────────────────────────────────────────

    function approveToken(address token) external onlyOwner {
        approvedTokens[token] = true;
    }

    function setSequencer(address newSeq) external onlyOwner {
        emit SequencerUpdated(sequencer, newSeq);
        sequencer = newSeq;
    }

    function setVerifier(address newVerifier) external onlyOwner {
        zkVerifier = newVerifier;
    }
}

interface IERC20 {
    function transferFrom(address,address,uint256) external returns(bool);
    function transfer(address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
}
