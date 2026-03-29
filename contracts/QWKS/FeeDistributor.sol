// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FeeDistributor
 * @notice Routes 0.1% of all R3WAGON network transaction volume to LTN stakers.
 *         Burns 0.001 LTN per transaction for deflation.
 *         Calculates QWKS savings vs Visa baseline on-chain.
 *
 * Performance fee model (Patent Claims 11-13):
 *   savings = annualVolume × (baselineRate - qwksRate)
 *   fee     = savings × 10%
 *   Math enforced on-chain — business always net-positive
 *
 * @dev Patent pending: RAW-2026-PROV-001
 */
contract FeeDistributor {
    // ── Constants ─────────────────────────────────────────────
    uint256 public constant FEE_BPS       = 10;        // 0.1% of volume → stakers
    uint256 public constant BURN_PER_TX   = 1e15;      // 0.001 LTN per tx
    uint256 public constant QWKS_FEE_BPS  = 1000;      // 10% of savings → QWKS fee
    uint256 public constant BPS_DENOM     = 10_000;

    // ── State ──────────────────────────────────────────────────
    address public owner;
    address public ltnToken;
    address public usdcToken;

    // Staking
    mapping(address => uint256) public staked;
    mapping(address => uint256) public rewardDebt;
    uint256 public totalStaked;
    uint256 public accRewardPerShare; // × 1e18
    uint256 public totalInflow;
    uint256 public totalBurned;

    // Business registry — tracks baseline rates for savings oracle
    struct BusinessConfig {
        uint256 baselineRateBps;  // e.g. 250 for 2.5% Visa
        uint256 monthlyVolume;    // USD
        uint256 totalSaved;
        bool    active;
    }
    mapping(address => BusinessConfig) public businesses;

    // Products authorized to call inflow()
    mapping(address => bool) public approvedProducts;

    // ── Events ────────────────────────────────────────────────
    event Inflow(address indexed product, uint256 volume, uint256 feeToStakers, uint256 burned);
    event Staked(address indexed user, uint256 amount, uint256 totalStaked);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event BusinessRegistered(address indexed biz, uint256 baselineRateBps);
    event SavingsRecorded(address indexed biz, uint256 annualSaved, uint256 qwksFee);

    modifier onlyOwner()   { require(msg.sender == owner, "FD: not owner"); _; }
    modifier onlyProduct() { require(approvedProducts[msg.sender] || msg.sender == owner, "FD: not product"); _; }

    constructor(address _ltn, address _usdc, address _owner) {
        ltnToken  = _ltn;
        usdcToken = _usdc;
        owner     = _owner;
    }

    // ── Core: Inflow from network transactions ─────────────────

    /**
     * @notice Called by each product contract when processing a transaction.
     *         Routes 0.1% of volume to LTN stakers.
     *         Burns 0.001 LTN from initiator.
     * @param volume     Transaction amount in USDC (6 decimals)
     * @param initiator  Business or user who initiated the tx
     */
    function inflow(uint256 volume, address initiator) external onlyProduct {
        if (volume == 0) return;
        uint256 feeAmount = (volume * FEE_BPS) / BPS_DENOM; // 0.1%

        // Pull USDC fee from caller
        IERC20(usdcToken).transferFrom(msg.sender, address(this), feeAmount);
        totalInflow += feeAmount;

        // Distribute to stakers
        if (totalStaked > 0) {
            accRewardPerShare += (feeAmount * 1e18) / totalStaked;
        }

        // Burn LTN
        try ILTN(ltnToken).burnOnTransaction(initiator) {
            totalBurned += BURN_PER_TX;
        } catch {}

        emit Inflow(msg.sender, volume, feeAmount, BURN_PER_TX);
    }

    // ── Staking ───────────────────────────────────────────────

    function stake(uint256 amount) external {
        _settle(msg.sender);
        IERC20(ltnToken).transferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked        += amount;
        emit Staked(msg.sender, amount, totalStaked);
    }

    function unstake(uint256 amount) external {
        require(staked[msg.sender] >= amount, "FD: insufficient");
        _settle(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked        -= amount;
        IERC20(ltnToken).transfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() external returns (uint256 reward) {
        _settle(msg.sender);
        reward = rewardDebt[msg.sender];
        if (reward > 0) {
            rewardDebt[msg.sender] = 0;
            IERC20(usdcToken).transfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function pending(address user) external view returns (uint256) {
        return rewardDebt[user] + (staked[user] * accRewardPerShare) / 1e18;
    }

    // ── QWKS savings oracle ────────────────────────────────────

    /**
     * @notice Record verified savings for a QWKS business.
     *         Called by MigrationReceiver after oracle verification.
     * @param biz         Business address
     * @param annualVol   Annual transaction volume (USD)
     * @param baselineBps Verified processor rate in basis points
     */
    function recordSavings(address biz, uint256 annualVol, uint256 baselineBps) external onlyOwner {
        uint256 qwksRateBps   = 1; // ~0.01% effective on R3NET
        uint256 savings       = (annualVol * (baselineBps - qwksRateBps)) / BPS_DENOM;
        uint256 qwksFee       = (savings * QWKS_FEE_BPS) / BPS_DENOM;
        businesses[biz].totalSaved += savings;
        emit SavingsRecorded(biz, savings, qwksFee);
    }

    // ── Admin ──────────────────────────────────────────────────

    function registerBusiness(address biz, uint256 baselineRateBps, uint256 monthlyVol) external onlyOwner {
        businesses[biz] = BusinessConfig(baselineRateBps, monthlyVol, 0, true);
        emit BusinessRegistered(biz, baselineRateBps);
    }

    function approveProduct(address product) external onlyOwner { approvedProducts[product] = true; }
    function removeProduct(address product)  external onlyOwner { approvedProducts[product] = false; }

    function _settle(address user) internal {
        rewardDebt[user] = this.pending(user);
    }
}

interface IERC20 {
    function transferFrom(address,address,uint256) external returns(bool);
    function transfer(address,uint256) external returns(bool);
}
interface ILTN {
    function burnOnTransaction(address) external;
}
