// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUSDC
 * @notice ERC-20 mock of Circle USDC for testnet.
 *         Anyone can call faucet() to get 10,000 USDC for testing.
 *         Replace with real USDC address on mainnet.
 *
 * Mainnet Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */
contract MockUSDC {
    string  public constant name     = "USD Coin (Mock)";
    string  public constant symbol   = "USDC";
    uint8   public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e6; // 10,000 USDC

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Faucet(address indexed recipient, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "USDC: not owner"); _; }

    constructor() {
        owner = msg.sender;
        _mint(msg.sender, 100_000_000 * 1e6); // 100M USDC initial
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "USDC: allowance");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /** @notice Get 10,000 test USDC — anyone can call this on testnet */
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Faucet(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "USDC: insufficient");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
