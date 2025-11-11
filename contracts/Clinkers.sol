// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Clinkers
 * @notice ERC721 collection for Farcaster Clinkers. Each token ID can match a user's FID.
 */
contract Clinkers is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    // Maximum supply (adjustable here)
    uint256 public constant MAX_SUPPLY = 10000;

    // Current supply counter
    uint256 public totalSupply = 0;

    // Mapping to track if a FID has been minted
    mapping(uint256 => bool) public fidMinted;

    // Mapping from FID to minter address for verification
    mapping(uint256 => address) public fidToMinter;

    // On-chain level for each token: 0=baby,1=youngins,2=rising,3=OGs
    mapping(uint256 => uint8) public levelOf;

    // Price (wei) to upgrade to a specific target level (index = target level)
    mapping(uint8 => uint256) public upgradePrice;

    // Mint fee in wei (default 0.0004 ETH)
    uint256 public mintFee = 0.0004 ether; // 0.0004 ETH

    bool public metadataFrozen;

    event ClinkerMinted(
        uint256 indexed fid,
        address indexed minter,
        uint8 level,
        string metadataURI
    );

    event ClinkerUpgraded(
        uint256 indexed fid,
        address indexed owner,
        uint8 oldLevel,
        uint8 newLevel,
        string metadataURI
    );

    event MintFeeUpdated(uint256 newFee);

    error MaxSupplyExceeded();
    error FidAlreadyMinted();
    error InvalidFid();
    error IncorrectFee();
    error NotTokenOwner();
    error LevelNotAllowed();

    constructor(address initialOwner) ERC721("Clinkers", "CLINK") Ownable(initialOwner) {}

    /**
     * @notice Mint a Clinker NFT. Token ID will be the user's FID.
     * @param fid The Farcaster ID of the user
     * @param metadataURI Full token URI (ipfs://...)
     */
    function mint(
        uint256 fid,
        string calldata metadataURI,
        uint8 initialLevel
    ) external payable nonReentrant {
        if (initialLevel > 3) revert LevelNotAllowed();
        // Mint only requires the base mintFee. Initial level is set from frontend input.
        if (msg.value != mintFee) revert IncorrectFee();
        if (totalSupply >= MAX_SUPPLY) revert MaxSupplyExceeded();
        if (fid == 0 ) revert InvalidFid();
        if (fidMinted[fid]) revert FidAlreadyMinted();
        if (metadataFrozen) revert("MetadataFrozen");

        // Mark this FID as minted
        fidMinted[fid] = true;
        fidToMinter[fid] = msg.sender;
    // set starting level (frontend-provided). Owner should ensure frontend validates eligibility.
    levelOf[fid] = initialLevel;
        totalSupply++;

        // Mint with FID as token ID
        _safeMint(msg.sender, fid);
        _setTokenURI(fid, metadataURI);

        emit ClinkerMinted(fid, msg.sender, levelOf[fid], metadataURI);
    }

    /**
     * @notice Upgrade an existing token to a higher level by paying the configured fee and providing new metadata.
     * @param fid Token id (FID) to upgrade
     * @param newLevel Target level index (0..3)
     * @param metadataURI New metadata URI to set for the upgraded token
     */
    function upgradeNft(
        uint256 fid,
        uint8 newLevel,
        string calldata metadataURI
    ) external payable nonReentrant {
        if (metadataFrozen) revert("MetadataFrozen");
    if (!fidMinted[fid]) revert InvalidFid();
        address ownerAddr = ownerOf(fid);
        if (ownerAddr != msg.sender) revert NotTokenOwner();
        uint8 current = levelOf[fid];
        if (newLevel <= current) revert LevelNotAllowed();
        if (newLevel > 3) revert LevelNotAllowed();

        uint256 required = upgradePrice[newLevel];
        if (msg.value != required) revert IncorrectFee();

        // Apply upgrade
        levelOf[fid] = newLevel;
        _setTokenURI(fid, metadataURI);

        emit ClinkerUpgraded(fid, msg.sender, current, newLevel, metadataURI);
    }

    /**
     * @notice Set the on-chain upgrade price for a target level (owner only)
     * @param level target level index 0..3
     * @param price price in wei required to upgrade to this level
     */
    function setUpgradePrice(uint8 level, uint256 price) external onlyOwner {
        require(level <= 3, "LEVEL_OUT_OF_RANGE");
        upgradePrice[level] = price;
    }

    /**
     * @notice Set the mint fee.
     * @param newFee New fee in wei
     */
    function setMintFee(uint256 newFee) external onlyOwner {
        mintFee = newFee;
        emit MintFeeUpdated(newFee);
    }

    function freezeMetadata() external onlyOwner {
        metadataFrozen = true;
    }

    /**
     * @notice Check if a FID has already been minted.
     * @param fid The Farcaster ID to check
     * @return bool True if the FID has been minted
     */
    function isFidMinted(uint256 fid) external view returns (bool) {
        return fidMinted[fid];
    }

    /**
     * @notice Withdraw contract balance to owner.
     */
    function withdraw() external onlyOwner nonReentrant {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok, "WITHDRAW_FAILED");
    }

    // The following functions are overrides required by Solidity.

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
