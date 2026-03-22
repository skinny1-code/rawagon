// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
/// @title FeeDistributor — 0.1% network volume to LTN stakers
/// @dev Patent pending RAW-2026-PROV-001
contract FeeDistributor is Ownable {
    IERC20 public immutable ltn;
    mapping(address=>uint256) public staked; mapping(address=>uint256) public rewardDebt;
    mapping(address=>uint256) public pending; mapping(address=>bool) public approved;
    uint256 public totalStaked; uint256 public rpt; // reward per token
    event Staked(address u, uint256 a); event Claimed(address u, uint256 a);
    constructor(address _ltn, address _o) Ownable(_o) { ltn=IERC20(_ltn); }
    function inflow(uint256 vol) external { require(approved[msg.sender]); uint256 fee=(vol*10)/10000; if(totalStaked>0) rpt+=(fee*1e18)/totalStaked; }
    function stake(uint256 a) external { _up(msg.sender); ltn.transferFrom(msg.sender,address(this),a); staked[msg.sender]+=a; totalStaked+=a; emit Staked(msg.sender,a); }
    function unstake(uint256 a) external { _up(msg.sender); staked[msg.sender]-=a; totalStaked-=a; ltn.transfer(msg.sender,a); }
    function claim() external { _up(msg.sender); uint256 r=pending[msg.sender]; pending[msg.sender]=0; ltn.transfer(msg.sender,r); emit Claimed(msg.sender,r); }
    function approve(address p) external onlyOwner { approved[p]=true; }
    function _up(address u) internal { pending[u]+=(staked[u]*(rpt-rewardDebt[u]))/1e18; rewardDebt[u]=rpt; }
}
