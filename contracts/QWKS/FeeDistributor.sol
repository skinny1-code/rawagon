// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeeDistributor
 * @notice Receives revenue from QWKS, BitPawn, Droppa, AutoIQ, AllCard.
 *         Routes 0.1% of all network transaction volume to LTN stakers.
 *         Burns 0.001 LTN per transaction.
 * @dev Patent pending: RAW-2026-PROV-001 (Performance-Linked Fee Distribution)
 */
contract FeeDistributor is Ownable, ReentrancyGuard {
    IERC20 public immutable ltn;

    uint256 public constant FEE_BPS         = 10;      // 0.1% of volume
    uint256 public constant STAKING_APY_BPS = 1200;    // 12% APY target

    struct StakePosition {
        uint256 amount;
        uint256 stakedAt;
        uint256 rewardDebt;
    }

    mapping(address => StakePosition) public stakes;
    mapping(address => uint256) public pendingRewards;

    uint256 public totalStaked;
    uint256 public totalFeesCollected;
    uint256 public rewardPerTokenStored;
    uint256 public lastUpdateTime;

    // Product registry — approved sources that can call inflow()
    mapping(address => bool) public approvedProducts;
    mapping(address => string) public productNames;

    event FeeReceived(address indexed product, uint256 amount, uint256 timestamp);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event ProductRegistered(address indexed product, string name);

    constructor(address _ltn, address _owner) Ownable(_owner) {
        ltn = IERC20(_ltn);
        lastUpdateTime = block.timestamp;
    }

    /**
     * @notice Called by any approved product when a transaction occurs.
     *         Routes fee to staking rewards pool.
     * @param volume Transaction volume in USDC (6 decimals)
     */
    function inflow(uint256 volume) external {
        require(approvedProducts[msg.sender], "FeeDistributor: caller not registered");
        uint256 fee = (volume * FEE_BPS) / 10000;
        totalFeesCollected += fee;
        _updateRewardPerToken(fee);
        emit FeeReceived(msg.sender, fee, block.timestamp);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "FeeDistributor: zero stake");
        _updateUserReward(msg.sender);
        ltn.transferFrom(msg.sender, address(this), amount);
        stakes[msg.sender].amount += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(stakes[msg.sender].amount >= amount, "FeeDistributor: insufficient stake");
        _updateUserReward(msg.sender);
        stakes[msg.sender].amount -= amount;
        totalStaked -= amount;
        ltn.transfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external nonReentrant {
        _updateUserReward(msg.sender);
        uint256 reward = pendingRewards[msg.sender];
        require(reward > 0, "FeeDistributor: no rewards");
        pendingRewards[msg.sender] = 0;
        ltn.transfer(msg.sender, reward);
        emit RewardClaimed(msg.sender, reward);
    }

    function registerProduct(address product, string calldata name) external onlyOwner {
        approvedProducts[product] = true;
        productNames[product] = name;
        emit ProductRegistered(product, name);
    }

    function _updateRewardPerToken(uint256 fee) internal {
        if (totalStaked > 0) {
            rewardPerTokenStored += (fee * 1e18) / totalStaked;
        }
        lastUpdateTime = block.timestamp;
    }

    function _updateUserReward(address user) internal {
        pendingRewards[user] +=
            (stakes[user].amount * (rewardPerTokenStored - stakes[user].rewardDebt)) / 1e18;
        stakes[user].rewardDebt = rewardPerTokenStored;
    }

    function earned(address user) external view returns (uint256) {
        return pendingRewards[user] +
            (stakes[user].amount * (rewardPerTokenStored - stakes[user].rewardDebt)) / 1e18;
    }
}
