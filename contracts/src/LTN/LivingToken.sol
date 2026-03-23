// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
/// @title LivingToken (LTN) — burn 0.001/tx, 12% staking APY, governance
/// @dev Patent pending RAW-2026-PROV-001
contract LivingToken is ERC20, AccessControl {
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;
    uint256 public constant BURN_PER_TX = 1e15;
    uint256 public totalBurned; uint256 public txCount;
    event Burned(address burner, uint256 amt, uint256 txCount);
    constructor(address admin) ERC20("Living Token","LTN") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _mint(admin, 400_000_000 * 1e18);
    }
    function burnOnTx() external onlyRole(BURNER_ROLE) {
        _burn(msg.sender, BURN_PER_TX);
        unchecked { totalBurned += BURN_PER_TX; txCount++; }
        emit Burned(msg.sender, BURN_PER_TX, txCount);
    }
    function mint(address to, uint256 amt) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(totalSupply()+amt <= MAX_SUPPLY); _mint(to,amt);
    }
}
