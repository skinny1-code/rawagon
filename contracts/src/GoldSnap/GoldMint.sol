// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
interface IOracle{function latestRoundData()external view returns(uint80,int256,uint256,uint256,uint80);}
/// @title GoldMint (GTX) — 1 GTX = 1/100 troy oz gold, Chainlink pegged
contract GoldMint is ERC20, Ownable {
    IOracle public oracle; address public usdc; uint256 public reserve;
    constructor(address o,address u,address owner) ERC20("GoldSnap Gold","GTX") Ownable(owner){oracle=IOracle(o);usdc=u;}
    function price() public view returns(uint256){(,int256 p,,,)=oracle.latestRoundData();return uint256(p)/100/100;}
    function mint(uint256 uAmt) external {
        uint256 p=price(); uint256 fee=(uAmt*25)/10000; uint256 net=uAmt-fee; uint256 gtx=(net*1e18)/p;
        IERC20(usdc).transferFrom(msg.sender,address(this),uAmt); reserve+=net; _mint(msg.sender,gtx);
    }
    function redeem(uint256 gAmt) external {
        uint256 uOut=(gAmt*price())/1e18; _burn(msg.sender,gAmt); reserve-=uOut; IERC20(usdc).transfer(msg.sender,uOut);
    }
}
