// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CardVault — Physical-to-Digital Card Vault
 * @notice Droppa vaulted card system. Mail physical graded cards,
 *         receive ERC-721 digital card NFT. Sell digitally or burn to redeem physical.
 *
 * Fees (USDC):
 *   depositFee:   $12 — intake + photo + label
 *   storageFee:   $1/month — secure storage + insurance
 *   redemptionFee: $18 — return shipping + insurance + handling
 */

interface IERC20Min {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract CardVault {

    uint256 public constant DEPOSIT_FEE     = 12_000_000;  // $12 USDC
    uint256 public constant STORAGE_FEE_MO  =  1_000_000;  // $1/month
    uint256 public constant REDEMPTION_FEE  = 18_000_000;  // $18 USDC
    uint256 public constant TRANSFER_FEE_BP = 100;          // 1% on sale
    uint256 public constant BURN_LTN        = 1e15;         // 0.001 LTN

    address public owner;
    address public vaultOperator;
    IERC20Min public immutable usdc;
    IERC20Min public immutable ltn;
    address public feeRecipient;

    uint256 public nextTokenId = 1;
    uint256 public nextRequestId = 1;
    uint256 public totalDeposits;
    uint256 public totalRedemptions;
    uint256 public totalFeesCollected;

    enum CardStatus { Pending, Received, Digitized, Sold, BurnQueued, Redeemed, Rejected }

    struct VaultCard {
        uint256   tokenId;
        address   owner;
        bytes32   metadataHash;
        string    description;
        string    grader;
        uint16    grade;
        uint256   certNumber;
        uint256   depositedAt;
        uint256   lastStorageCharge;
        uint256   estimatedValue;
        CardStatus status;
        bool      transferable;
    }

    struct DepositRequest {
        address requester;
        string  description;
        string  grader;
        uint16  grade;
        uint256 certNumber;
        uint256 estimatedValue;
        uint256 requestedAt;
        bool    feesPaid;
        bool    cardReceived;
        uint256 mintedTokenId;
    }

    mapping(uint256 => VaultCard)       public cards;
    mapping(address => uint256[])       public ownerCards;
    mapping(uint256 => DepositRequest)  public depositRequests;
    mapping(uint256 => uint256)         public redemptionQueue;

    event DepositRequested(uint256 indexed requestId, address indexed requester, string description, uint256 fee);
    event CardReceived(uint256 indexed requestId);
    event CardDigitized(uint256 indexed tokenId, uint256 indexed requestId, address indexed owner, bytes32 metadataHash);
    event CardTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event RedemptionRequested(uint256 indexed tokenId, address indexed owner, uint256 fee);
    event CardRedeemed(uint256 indexed tokenId);
    event StorageCharged(uint256 indexed tokenId, uint256 months, uint256 fee);

    modifier onlyOwner()    { require(msg.sender == owner,                              "not owner");    _; }
    modifier onlyOperator() { require(msg.sender == vaultOperator || msg.sender == owner,"not operator"); _; }

    constructor(address _usdc, address _ltn, address _operator, address _feeRecipient) {
        owner         = msg.sender;
        vaultOperator = _operator;
        usdc          = IERC20Min(_usdc);
        ltn           = IERC20Min(_ltn);
        feeRecipient  = _feeRecipient;
    }

    // ── 1. User requests deposit ───────────────────────────────────
    function requestDeposit(
        string  calldata description,
        string  calldata grader,
        uint16           grade,
        uint256          certNumber,
        uint256          estimatedValue
    ) external returns (uint256 requestId) {
        require(usdc.transferFrom(msg.sender, feeRecipient, DEPOSIT_FEE), "fee failed");
        requestId = nextRequestId++;
        depositRequests[requestId] = DepositRequest({
            requester:      msg.sender,
            description:    description,
            grader:         grader,
            grade:          grade,
            certNumber:     certNumber,
            estimatedValue: estimatedValue,
            requestedAt:    block.timestamp,
            feesPaid:       true,
            cardReceived:   false,
            mintedTokenId:  0
        });
        totalDeposits++;
        totalFeesCollected += DEPOSIT_FEE;
        _tryBurnLTN(msg.sender);
        emit DepositRequested(requestId, msg.sender, description, DEPOSIT_FEE);
    }

    // ── 2. Operator confirms physical receipt ──────────────────────
    function confirmCardReceived(uint256 requestId) external onlyOperator {
        DepositRequest storage req = depositRequests[requestId];
        require(req.requester != address(0), "invalid request");
        require(!req.cardReceived, "already received");
        req.cardReceived = true;
        emit CardReceived(requestId);
    }

    // ── 3. Operator mints digital NFT after digitization ──────────
    function mintDigitalCard(
        uint256 requestId,
        bytes32 metadataHash
    ) external onlyOperator returns (uint256 tokenId) {
        DepositRequest storage req = depositRequests[requestId];
        require(req.feesPaid,     "fee not paid");
        require(req.cardReceived, "card not received");
        require(req.mintedTokenId == 0, "already minted");

        tokenId = nextTokenId++;
        cards[tokenId] = VaultCard({
            tokenId:           tokenId,
            owner:             req.requester,
            metadataHash:      metadataHash,
            description:       req.description,
            grader:            req.grader,
            grade:             req.grade,
            certNumber:        req.certNumber,
            depositedAt:       block.timestamp,
            lastStorageCharge: block.timestamp,
            estimatedValue:    req.estimatedValue,
            status:            CardStatus.Digitized,
            transferable:      true
        });
        req.mintedTokenId = tokenId;
        ownerCards[req.requester].push(tokenId);
        emit CardDigitized(tokenId, requestId, req.requester, metadataHash);
    }

    // ── 4a. User sells digital card ────────────────────────────────
    function transferCard(uint256 tokenId, address to, uint256 salePrice) external {
        VaultCard storage card = cards[tokenId];
        require(card.owner == msg.sender, "not owner");
        require(card.transferable,        "not transferable");
        require(card.status == CardStatus.Digitized || card.status == CardStatus.Sold, "wrong status");
        if (salePrice > 0) {
            uint256 fee = (salePrice * TRANSFER_FEE_BP) / 10000;
            require(usdc.transferFrom(to, feeRecipient, fee),              "fee failed");
            require(usdc.transferFrom(to, msg.sender, salePrice - fee),    "payment failed");
            totalFeesCollected += fee;
        }
        _removeFromOwner(msg.sender, tokenId);
        card.owner  = to;
        card.status = CardStatus.Sold;
        ownerCards[to].push(tokenId);
        _tryBurnLTN(msg.sender);
        emit CardTransferred(tokenId, msg.sender, to, salePrice);
    }

    // ── 4b. User burns for physical redemption ─────────────────────
    function requestRedemption(uint256 tokenId) external {
        VaultCard storage card = cards[tokenId];
        require(card.owner == msg.sender, "not owner");
        require(card.status == CardStatus.Digitized || card.status == CardStatus.Sold, "wrong status");
        uint256 storageOwed = _calcStorageOwed(tokenId);
        uint256 totalFee    = REDEMPTION_FEE + storageOwed;
        if (totalFee > 0) {
            require(usdc.transferFrom(msg.sender, feeRecipient, totalFee), "fee failed");
            totalFeesCollected += totalFee;
        }
        card.status           = CardStatus.BurnQueued;
        card.transferable     = false;
        card.lastStorageCharge = block.timestamp;
        redemptionQueue[tokenId] = block.timestamp;
        totalRedemptions++;
        _tryBurnLTN(msg.sender);
        emit RedemptionRequested(tokenId, msg.sender, totalFee);
    }

    // ── 5. Operator completes physical shipment ────────────────────
    function completeRedemption(uint256 tokenId) external onlyOperator {
        VaultCard storage card = cards[tokenId];
        require(card.status == CardStatus.BurnQueued, "not queued");
        card.status       = CardStatus.Redeemed;
        card.transferable = false;
        emit CardRedeemed(tokenId);
    }

    // ── Storage billing ────────────────────────────────────────────
    function chargeStorage(uint256 tokenId) external onlyOperator {
        uint256 owed   = _calcStorageOwed(tokenId);
        require(owed > 0, "nothing owed");
        VaultCard storage card = cards[tokenId];
        uint256 months = (block.timestamp - card.lastStorageCharge) / 30 days;
        require(usdc.transferFrom(card.owner, feeRecipient, owed), "charge failed");
        card.lastStorageCharge += months * 30 days;
        totalFeesCollected     += owed;
        emit StorageCharged(tokenId, months, owed);
    }

    // ── Views ──────────────────────────────────────────────────────
    function getOwnerCards(address wallet)    external view returns (uint256[] memory) { return ownerCards[wallet]; }
    function getCard(uint256 tokenId)         external view returns (VaultCard memory)  { return cards[tokenId]; }
    function getRequest(uint256 requestId)    external view returns (DepositRequest memory) { return depositRequests[requestId]; }
    function getStorageOwed(uint256 tokenId)  external view returns (uint256) { return _calcStorageOwed(tokenId); }

    function _calcStorageOwed(uint256 tokenId) internal view returns (uint256) {
        VaultCard storage card = cards[tokenId];
        if (card.depositedAt == 0) return 0;
        if (card.status == CardStatus.Redeemed || card.status == CardStatus.BurnQueued) return 0;
        uint256 months = (block.timestamp - card.lastStorageCharge) / 30 days;
        return months * STORAGE_FEE_MO;
    }

    // ── Admin ──────────────────────────────────────────────────────
    function setOperator(address op)      external onlyOwner { vaultOperator = op; }
    function setFeeRecipient(address r)   external onlyOwner { feeRecipient  = r; }
    function transferOwnership(address o) external onlyOwner { owner         = o; }

    function _tryBurnLTN(address from) internal {
        try ltn.transferFrom(from, address(0xdead), BURN_LTN) {} catch {}
    }

    function _removeFromOwner(address wallet, uint256 tokenId) internal {
        uint256[] storage arr = ownerCards[wallet];
        for (uint256 i; i < arr.length; i++) {
            if (arr[i] == tokenId) { arr[i] = arr[arr.length - 1]; arr.pop(); return; }
        }
    }
}
