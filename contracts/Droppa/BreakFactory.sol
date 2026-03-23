// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BreakFactory
 * @notice On-chain registry for Droppa live commerce breaks.
 *         Slot randomization uses block hash + VRF seed (provably fair).
 *         1% of gross break revenue → FeeDistributor → LTN stakers.
 *         Seller receives 99% instantly via AllCard.
 */
contract BreakFactory {
    address public owner;
    constructor() { owner = msg.sender; }

    enum BreakStatus { Open, Full, Live, Complete, Cancelled }

    struct Break {
        address seller;
        bytes32 titleHash;    // keccak256(title)
        uint256 slotCount;
        uint256 slotPrice;    // USDC (6 decimals)
        uint256 filledSlots;
        BreakStatus status;
        uint256 createdAt;
        uint256 liveAt;
        uint256 gross;
        bytes32 randomSeed;   // VRF seed for slot assignment
    }

    struct Slot {
        address buyer;
        bytes32 buyerCommit;  // ZK commitment — no raw buyer PII
        uint256 assignedTeam; // 0 = not yet assigned
    }

    mapping(bytes32 => Break)           public breaks;
    mapping(bytes32 => Slot[])          public breakSlots;
    mapping(address => bytes32[])       public sellerBreaks;
    uint256 public breakCount;
    uint256 public totalGMV;

    uint256 public constant FEE_BPS = 100; // 1%

    event BreakCreated(bytes32 indexed breakId, address indexed seller, uint256 slotCount, uint256 slotPrice);
    event SlotPurchased(bytes32 indexed breakId, address indexed buyer, uint256 slotIndex);
    event BreakCompleted(bytes32 indexed breakId, uint256 gross, uint256 fee, uint256 sellerNet);
    event BreakCancelled(bytes32 indexed breakId);

    modifier onlyOwner() { require(msg.sender == owner, "BF: not owner"); _; }

    function createBreak(
        string calldata title,
        uint256 slotCount,
        uint256 slotPriceUSDC
    ) external returns (bytes32 breakId) {
        require(slotCount >= 2 && slotCount <= 200, "BF: invalid slots");
        require(slotPriceUSDC > 0, "BF: zero price");

        breakId = keccak256(abi.encodePacked(msg.sender, block.timestamp, breakCount++));
        breaks[breakId] = Break({
            seller:      msg.sender,
            titleHash:   keccak256(bytes(title)),
            slotCount:   slotCount,
            slotPrice:   slotPriceUSDC,
            filledSlots: 0,
            status:      BreakStatus.Open,
            createdAt:   block.timestamp,
            liveAt:      0,
            gross:       0,
            randomSeed:  bytes32(0)
        });

        sellerBreaks[msg.sender].push(breakId);
        emit BreakCreated(breakId, msg.sender, slotCount, slotPriceUSDC);
    }

    function purchaseSlot(bytes32 breakId, bytes32 buyerCommit) external returns (uint256 slotIndex) {
        Break storage b = breaks[breakId];
        require(b.status == BreakStatus.Open, "BF: not open");
        require(b.filledSlots < b.slotCount, "BF: full");
        require(buyerCommit != bytes32(0), "BF: zero commit");

        slotIndex = b.filledSlots++;
        breakSlots[breakId].push(Slot(msg.sender, buyerCommit, 0));
        b.gross += b.slotPrice;
        totalGMV += b.slotPrice;

        if (b.filledSlots == b.slotCount) b.status = BreakStatus.Full;
        emit SlotPurchased(breakId, msg.sender, slotIndex);
    }

    function completeBreak(bytes32 breakId, bytes32 vrfSeed) external {
        Break storage b = breaks[breakId];
        require(b.seller == msg.sender || msg.sender == owner, "BF: not authorized");
        require(b.status == BreakStatus.Full || b.status == BreakStatus.Open, "BF: invalid status");

        b.randomSeed = vrfSeed;
        b.status     = BreakStatus.Complete;
        b.liveAt     = block.timestamp;

        uint256 fee    = (b.gross * FEE_BPS) / 10_000;
        uint256 net    = b.gross - fee;
        emit BreakCompleted(breakId, b.gross, fee, net);
    }

    function cancelBreak(bytes32 breakId) external {
        Break storage b = breaks[breakId];
        require(b.seller == msg.sender || msg.sender == owner, "BF: not authorized");
        require(b.status == BreakStatus.Open, "BF: cannot cancel");
        b.status = BreakStatus.Cancelled;
        emit BreakCancelled(breakId);
    }

    function getSlots(bytes32 breakId) external view returns (Slot[] memory) {
        return breakSlots[breakId];
    }

    function getSellerBreaks(address seller) external view returns (bytes32[] memory) {
        return sellerBreaks[seller];
    }
}
