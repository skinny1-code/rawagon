// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


/**
 * @title IQTitle — IQCAR NFT
 * @notice Vehicle title on-chain as ERC-721. Token ID = keccak256(VIN).
 *         Transfer of NFT = transfer of vehicle title.
 *         Metadata: make, model, year, recall status from NHTSA API.
 * @dev Deployed on Base L2.
 */
contract IQTitle is ERC721, Ownable {
    struct VehicleRecord {
        string vin;
        string make;
        string model;
        uint16 year;
        uint8  recallCount;
        bool   salvage;
        address mintedBy;     // AutoIQ dealer or user
        uint256 mintedAt;
    }

    mapping(uint256 => VehicleRecord) public vehicles;
    mapping(string => bool)           public vinRegistered;
    mapping(uint256 => string)        private _tokenURIs;

    address public feeDistributor;
    uint256 public mintFee = 0.001 ether; // ~$2 at ETH $2,000

    event TitleMinted(uint256 indexed tokenId, string vin, address indexed owner);
    event TitleTransferred(uint256 indexed tokenId, address indexed from, address indexed to);

    constructor(address _owner, address _feeDist)
        ERC721("IQTitle Vehicle", "IQCAR")
   {
        feeDistributor = _feeDist;
    }

    /**
     * @notice Mint an IQCAR NFT for a vehicle.
     *         Token ID is derived deterministically from the VIN.
     * @param vin       17-character VIN (uppercase)
     * @param make      Vehicle make from NHTSA decode
     * @param model     Vehicle model
     * @param year      Model year
     * @param recalls   Number of open NHTSA recalls
     * @param salvage   True if title is salvage/rebuilt
     * @param tokenURI_ IPFS URI for vehicle metadata JSON
     */
    function mintTitle(
        string calldata vin,
        string calldata make,
        string calldata model,
        uint16 year,
        uint8 recalls,
        bool salvage,
        string calldata tokenURI_
    ) external payable returns (uint256 tokenId) {
        require(msg.value >= mintFee, "IQCAR: insufficient fee");
        require(bytes(vin).length == 17, "IQCAR: VIN must be 17 chars");
        require(!vinRegistered[vin], "IQCAR: VIN already registered");

        tokenId = uint256(keccak256(abi.encodePacked(vin)));
        vinRegistered[vin] = true;

        vehicles[tokenId] = VehicleRecord({
            vin: vin, make: make, model: model, year: year,
            recallCount: recalls, salvage: salvage,
            mintedBy: msg.sender, mintedAt: block.timestamp
        });
        _tokenURIs[tokenId] = tokenURI_;
        _safeMint(msg.sender, tokenId);

        emit TitleMinted(tokenId, vin, msg.sender);
    }

    function tokenURI(uint256 tokenId)
        public view override returns (string memory)
   {
        require(_ownerOf(tokenId) != address(0), "IQCAR: token does not exist");
        return _tokenURIs[tokenId];
    }

    function getVehicle(uint256 tokenId)
        external view returns (VehicleRecord memory)
   {
        return vehicles[tokenId];
    }

    function tokenIdForVIN(string calldata vin)
        external pure returns (uint256)
   {
        return uint256(keccak256(abi.encodePacked(vin)));
    }

    function setMintFee(uint256 fee) external {
        mintFee = fee;
    }

    function withdraw() external {
        payable(owner()).transfer(address(this).balance);
    }
}
