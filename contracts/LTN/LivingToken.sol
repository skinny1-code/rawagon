// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LivingToken (LTN)
 * @notice ERC-20 governance + utility token for the RAWagon network.
 *         Fixed supply: 1,000,000,000 LTN
 *         Deflationary: burns 0.001 LTN per network transaction
 *         Staking: FeeDistributor routes 0.1% of network volume to stakers
 *
 * Token lifecycle:
 *   Phase 1 (0-3yr):  Subscriber pays fee, earns LTN per txn
 *   Phase 2 (3-7yr):  Staking yield approaches subscription cost
 *   Phase 3 (5-10yr): Yield exceeds fee — network pays the business
 *   Phase 4 (7yr+):   Revenue share — customers become partners
 */
contract LivingToken {
    // ── ERC-20 core ────────────────────────────────────────────
    string  public constant name     = "LivingToken";
    string  public constant symbol   = "LTN";
    uint8   public constant decimals = 18;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Burn mechanics ──────────────────────────────────────────
    uint256 public constant BURN_PER_TX  = 1e15;       // 0.001 LTN per txn
    uint256 public totalBurned;
    uint256 public totalTransactions;

    // ── Staking ─────────────────────────────────────────────────
    mapping(address => uint256) public staked;
    mapping(address => uint256) public stakedAt;
    mapping(address => uint256) public rewardDebt;
    uint256 public totalStaked;
    uint256 public rewardPerTokenStored;
    uint256 public lastRewardTime;
    uint256 public annualRewardPool;   // set by FeeDistributor

    // ── Access ───────────────────────────────────────────────────
    address public owner;
    mapping(address => bool) public isMinter;
    mapping(address => bool) public isBurner;

    // ── Events ───────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event TxBurn(address indexed initiator, uint256 burned, uint256 totalBurned);
    event RewardPoolUpdated(uint256 annualPool);

    modifier onlyOwner()  { require(msg.sender == owner,  "LTN: not owner");  _; }
    modifier onlyMinter() { require(isMinter[msg.sender], "LTN: not minter"); _; }
    modifier onlyBurner() { require(isBurner[msg.sender], "LTN: not burner"); _; }

    constructor(address _treasury) {
        owner = msg.sender;
        isMinter[msg.sender] = true;
        isBurner[msg.sender] = true;
        lastRewardTime = block.timestamp;
        // Mint initial supply to treasury
        _mint(_treasury, MAX_SUPPLY);
    }

    // ── ERC-20 ───────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "LTN: allowance");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // ── Staking ──────────────────────────────────────────────────

    function stake(uint256 amount) external {
        require(amount > 0, "LTN: zero amount");
        _updateReward(msg.sender);
        _transfer(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        stakedAt[msg.sender] = block.timestamp;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        require(staked[msg.sender] >= amount, "LTN: insufficient staked");
        _updateReward(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        _transfer(address(this), msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimReward() external returns (uint256 reward) {
        _updateReward(msg.sender);
        reward = rewardDebt[msg.sender];
        if (reward > 0) {
            rewardDebt[msg.sender] = 0;
            _mint(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function pendingReward(address user) external view returns (uint256) {
        if (totalStaked == 0) return rewardDebt[user];
        uint256 elapsed = block.timestamp - lastRewardTime;
        uint256 newRPT = rewardPerTokenStored + (annualRewardPool * elapsed * 1e18) / (totalStaked * 365 days);
        return rewardDebt[user] + (staked[user] * (newRPT - rewardPerTokenStored)) / 1e18;
    }

    // ── Burn per transaction ──────────────────────────────────────

    function burnOnTransaction(address initiator) external onlyBurner {
        if (balanceOf[initiator] >= BURN_PER_TX) {
            _burn(initiator, BURN_PER_TX);
        } else if (totalSupply >= BURN_PER_TX) {
            _burn(address(this), BURN_PER_TX);
        }
        totalTransactions++;
        emit TxBurn(initiator, BURN_PER_TX, totalBurned);
    }

    // ── Admin ─────────────────────────────────────────────────────

    function setRewardPool(uint256 annualPool) external onlyOwner {
        _updateReward(address(0));
        annualRewardPool = annualPool;
        emit RewardPoolUpdated(annualPool);
    }

    function setMinter(address m, bool v) external onlyOwner { isMinter[m] = v; }
    function setBurner(address b, bool v) external onlyOwner { isBurner[b] = v; }

    // ── Internal ──────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "LTN: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(totalSupply + amount <= MAX_SUPPLY, "LTN: max supply");
        totalSupply    += amount;
        balanceOf[to]  += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        require(balanceOf[from] >= amount, "LTN: burn exceeds balance");
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        totalBurned     += amount;
        emit Transfer(from, address(0), amount);
    }

    function _updateReward(address user) internal {
        if (totalStaked > 0 && annualRewardPool > 0) {
            uint256 elapsed = block.timestamp - lastRewardTime;
            rewardPerTokenStored += (annualRewardPool * elapsed * 1e18) / (totalStaked * 365 days);
        }
        lastRewardTime = block.timestamp;
        if (user != address(0)) {
            rewardDebt[user] += (staked[user] * rewardPerTokenStored) / 1e18;
        }
    }
}
