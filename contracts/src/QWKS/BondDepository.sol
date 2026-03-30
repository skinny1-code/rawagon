// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @dev Minimal price oracle interface — returns LTN price in payToken units (6 dec for USDC).
interface IPriceOracle {
    /// @return price LTN price per 1e18 LTN, denominated in payToken base units.
    ///         E.g. if LTN = $1.00 and payToken = USDC (6 dec): returns 1_000_000.
    function getPrice() external view returns (uint256 price);
}

/// @title BondDepository — protocol-owned liquidity via discounted LTN bonds
/// @dev Olympus-style bonding. Owner creates terms; users deposit payToken (e.g. USDC)
///      and receive LTN at a discount after a vesting cliff. Protocol accumulates payToken
///      as treasury, building liquidity and yield without selling pressure.
///      Patent pending RAW-2026-PROV-001.
contract BondDepository is Ownable, ReentrancyGuard {
    IERC20 public immutable ltn;

    // ── Bond terms ────────────────────────────────────────────────────────────
    struct Term {
        address payToken; // token accepted (e.g. USDC)
        IPriceOracle oracle; // LTN price oracle for this pay token
        uint256 discountBps; // discount on LTN price, e.g. 500 = 5%
        uint256 vestingDays; // cliff vesting period in days
        uint256 capacityLTN; // max LTN this term can distribute (18-dec)
        uint256 soldLTN; // LTN already committed to bonds
        bool active;
    }

    // ── User bonds ────────────────────────────────────────────────────────────
    struct Bond {
        uint256 termId;
        uint256 ltnOwed; // LTN to receive after vesting (18-dec)
        uint256 vestEnd; // timestamp when vesting completes
        bool redeemed;
    }

    Term[] public terms;
    mapping(address => Bond[]) public bonds;

    address public treasury; // receives deposited payToken

    // ── Events ────────────────────────────────────────────────────────────────
    event TermCreated(uint256 indexed termId, address payToken, uint256 discountBps, uint256 capacityLTN);
    event TermDeactivated(uint256 indexed termId);
    event BondPurchased(
        address indexed user,
        uint256 indexed termId,
        uint256 payAmount,
        uint256 ltnOwed,
        uint256 vestEnd
    );
    event BondRedeemed(address indexed user, uint256 indexed bondIndex, uint256 ltnAmount);
    event TreasurySet(address treasury);

    constructor(address _ltn, address _owner) Ownable(_owner) {
        ltn = IERC20(_ltn);
    }

    // ── Owner management ──────────────────────────────────────────────────────

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /// @notice Create a new bond term.
    function createTerm(
        address payToken,
        address oracle,
        uint256 discountBps,
        uint256 vestingDays,
        uint256 capacityLTN
    ) external onlyOwner returns (uint256 termId) {
        require(discountBps < 5000, 'discount too high'); // max 50%
        require(vestingDays > 0 && vestingDays <= 365, 'vesting out of range');
        require(capacityLTN > 0, 'zero capacity');
        termId = terms.length;
        terms.push(
            Term({
                payToken: payToken,
                oracle: IPriceOracle(oracle),
                discountBps: discountBps,
                vestingDays: vestingDays,
                capacityLTN: capacityLTN,
                soldLTN: 0,
                active: true
            })
        );
        emit TermCreated(termId, payToken, discountBps, capacityLTN);
    }

    function deactivateTerm(uint256 termId) external onlyOwner {
        terms[termId].active = false;
        emit TermDeactivated(termId);
    }

    /// @notice Fund the depository with LTN for bond payouts.
    function fund(uint256 amount) external onlyOwner {
        ltn.transferFrom(msg.sender, address(this), amount);
    }

    // ── Bonding ───────────────────────────────────────────────────────────────

    /// @notice Deposit `payAmount` of the term's payToken and receive a discounted LTN bond.
    function bond(uint256 termId, uint256 payAmount) external nonReentrant returns (uint256 ltnOwed) {
        require(termId < terms.length, 'bad term');
        Term storage t = terms[termId];
        require(t.active, 'term inactive');
        require(payAmount > 0, 'amount zero');

        // Quote: price with discount applied
        uint256 price = t.oracle.getPrice(); // payToken units per 1e18 LTN
        require(price > 0, 'oracle price zero');
        uint256 discountedPrice = (price * (10000 - t.discountBps)) / 10000;

        // payAmount (payToken base units) → LTN (18-dec)
        // ltnOwed = payAmount * 1e18 / discountedPrice
        ltnOwed = (payAmount * 1e18) / discountedPrice;
        require(ltnOwed > 0, 'zero output');
        require(t.soldLTN + ltnOwed <= t.capacityLTN, 'capacity exceeded');
        require(ltn.balanceOf(address(this)) >= ltnOwed, 'insufficient LTN reserve');

        t.soldLTN += ltnOwed;

        // Pull payToken from user
        IERC20(t.payToken).transferFrom(msg.sender, address(this), payAmount);

        // Forward payToken to treasury if set
        if (treasury != address(0)) {
            IERC20(t.payToken).transfer(treasury, payAmount);
        }

        uint256 vestEnd = block.timestamp + (t.vestingDays * 1 days);
        bonds[msg.sender].push(
            Bond({ termId: termId, ltnOwed: ltnOwed, vestEnd: vestEnd, redeemed: false })
        );

        emit BondPurchased(msg.sender, termId, payAmount, ltnOwed, vestEnd);
    }

    // ── Redemption ────────────────────────────────────────────────────────────

    /// @notice Redeem a vested bond at `bondIndex` to receive LTN.
    function redeem(uint256 bondIndex) external nonReentrant {
        Bond storage b = bonds[msg.sender][bondIndex];
        require(!b.redeemed, 'already redeemed');
        require(block.timestamp >= b.vestEnd, 'not vested');

        b.redeemed = true;
        ltn.transfer(msg.sender, b.ltnOwed);

        emit BondRedeemed(msg.sender, bondIndex, b.ltnOwed);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function termCount() external view returns (uint256) {
        return terms.length;
    }

    function bondCount(address user) external view returns (uint256) {
        return bonds[user].length;
    }

    /// @notice Preview how much LTN `payAmount` would buy for a given term right now.
    function previewBond(uint256 termId, uint256 payAmount) external view returns (uint256 ltnOut) {
        require(termId < terms.length, 'bad term');
        Term storage t = terms[termId];
        uint256 price = t.oracle.getPrice();
        if (price == 0) return 0;
        uint256 discountedPrice = (price * (10000 - t.discountBps)) / 10000;
        ltnOut = (payAmount * 1e18) / discountedPrice;
    }
}
