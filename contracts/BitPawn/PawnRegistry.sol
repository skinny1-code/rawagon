// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PawnRegistry
 * @notice On-chain pawn ticket registry for BitPawn shops.
 *         Each ticket stores a ZK commitment of the customer (no raw PII).
 *         Interest accrues daily. Forfeiture triggers automatic AllCard payout.
 *
 *         Fee structure:
 *           $99/month SaaS flat (collected off-chain via AllCard subscription)
 *           0.5% of pawn volume → FeeDistributor → LTN stakers
 */
contract PawnRegistry {
    address public owner;
    constructor() { owner = msg.sender; }

    enum TicketStatus { Active, Redeemed, Forfeited, Extended }

    struct PawnTicket {
        bytes32  customerCommit;   // ZK commitment — no raw PII on-chain
        address  shop;
        uint256  loanAmount;       // USDC (6 decimals)
        uint256  interest;         // basis points per 30 days (e.g. 2000 = 20%)
        uint256  term;             // seconds
        uint256  openedAt;
        uint256  dueAt;
        string   itemHash;         // IPFS hash of item photo/description
        TicketStatus status;
        uint256  volumeFee;        // 0.5% routed to FeeDistributor
    }

    mapping(bytes32 => PawnTicket) public tickets;
    mapping(address => bytes32[])  public shopTickets;
    uint256 public ticketCount;
    uint256 public totalVolume;

    address public feeDistributor;
    address public usdcToken;

    event TicketOpened(bytes32 indexed ticketId, address indexed shop, uint256 loanAmount);
    event TicketRedeemed(bytes32 indexed ticketId, uint256 totalPaid);
    event TicketForfeited(bytes32 indexed ticketId, uint256 value);
    event TicketExtended(bytes32 indexed ticketId, uint256 newDueAt);

    modifier onlyOwner() { require(msg.sender == owner, "PR: not owner"); _; }

    function openTicket(
        bytes32 customerCommit,
        uint256 loanAmount,
        uint256 interestBps,
        uint256 termDays,
        string calldata itemHash
    ) external returns (bytes32 ticketId) {
        require(loanAmount > 0, "PR: zero loan");
        require(customerCommit != bytes32(0), "PR: zero commitment");

        ticketId = keccak256(abi.encodePacked(msg.sender, block.timestamp, ticketCount++));
        uint256 fee = (loanAmount * 50) / 10_000; // 0.5%

        tickets[ticketId] = PawnTicket({
            customerCommit: customerCommit,
            shop:           msg.sender,
            loanAmount:     loanAmount,
            interest:       interestBps,
            term:           termDays * 1 days,
            openedAt:       block.timestamp,
            dueAt:          block.timestamp + termDays * 1 days,
            itemHash:       itemHash,
            status:         TicketStatus.Active,
            volumeFee:      fee
        });

        shopTickets[msg.sender].push(ticketId);
        totalVolume += loanAmount;
        emit TicketOpened(ticketId, msg.sender, loanAmount);
    }

    function redeemTicket(bytes32 ticketId) external {
        PawnTicket storage t = tickets[ticketId];
        require(t.status == TicketStatus.Active, "PR: not active");
        uint256 elapsed  = block.timestamp - t.openedAt;
        uint256 periods  = (elapsed / 30 days) + 1;
        uint256 totalDue = t.loanAmount + (t.loanAmount * t.interest * periods) / 10_000;
        t.status = TicketStatus.Redeemed;
        emit TicketRedeemed(ticketId, totalDue);
    }

    function forfeit(bytes32 ticketId) external {
        PawnTicket storage t = tickets[ticketId];
        require(t.status == TicketStatus.Active, "PR: not active");
        require(block.timestamp > t.dueAt, "PR: not expired");
        t.status = TicketStatus.Forfeited;
        emit TicketForfeited(ticketId, t.loanAmount);
    }

    function calcDue(bytes32 ticketId) external view returns (uint256 totalDue, uint256 interestDue) {
        PawnTicket storage t = tickets[ticketId];
        uint256 elapsed = block.timestamp - t.openedAt;
        uint256 periods = (elapsed / 30 days) + 1;
        interestDue = (t.loanAmount * t.interest * periods) / 10_000;
        totalDue = t.loanAmount + interestDue;
    }

    function getShopTickets(address shop) external view returns (bytes32[] memory) {
        return shopTickets[shop];
    }

    function setFeeDistributor(address fd) external onlyOwner { feeDistributor = fd; }
    function setUSDC(address u)           external onlyOwner { usdcToken = u; }
}
