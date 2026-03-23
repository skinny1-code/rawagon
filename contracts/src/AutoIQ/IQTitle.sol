// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
/// @title IQTitle (IQCAR) — Vehicle title NFT. tokenId=keccak256(VIN).
contract IQTitle is ERC721, Ownable {
    struct V{string vin;string make;string model;uint16 year;uint8 recalls;bool salvage;uint256 ts;}
    mapping(uint256=>V) public v; mapping(string=>bool) public reg; mapping(uint256=>string) private u;
    uint256 public fee=0.001 ether;
    event Minted(uint256 id, string vin, address owner);
    constructor(address o) ERC721("IQTitle","IQCAR") Ownable(o) {}
    function mint(string calldata vin,string calldata make,string calldata model,uint16 yr,uint8 rec,bool sal,string calldata uri) external payable returns(uint256 id) {
        require(msg.value>=fee && bytes(vin).length==17 && !reg[vin]);
        id=uint256(keccak256(abi.encodePacked(vin))); reg[vin]=true;
        v[id]=V(vin,make,model,yr,rec,sal,block.timestamp); u[id]=uri;
        _safeMint(msg.sender,id); emit Minted(id,vin,msg.sender);
    }
    function tokenURI(uint256 id) public view override returns(string memory){return u[id];}
    function vinToId(string calldata vin) external pure returns(uint256){return uint256(keccak256(abi.encodePacked(vin)));}
    function setFee(uint256 f) external onlyOwner{fee=f;}
    function withdraw() external onlyOwner{payable(owner()).transfer(address(this).balance);}
}
