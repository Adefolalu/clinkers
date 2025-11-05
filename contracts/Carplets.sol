// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Carplets
 * @notice ERC721 collection for Farcaster personality NFTs. Each token ID matches the user's FID.
 * @dev Designed for deployment on Celo network. Max supply of 10,000 tokens.
 */
contract Carplets is ERC721, ERC721URIStorage, Ownable, ReentrancyGuard {
    // Maximum supply of Carplets (10k)
    uint256 public constant MAX_SUPPLY = 10000;
    
    // Current supply counter
    uint256 public totalSupply = 0;
    
    // Mapping to track if a FID has been minted
    mapping(uint256 => bool) public fidMinted;
    
    // Mapping from FID to minter address for verification
    mapping(uint256 => address) public fidToMinter;

    // Mint fee in wei (you can adjust this)
    uint256 public mintFee = 5 ether; // 5 celo to mint initially


    bool public metadataFrozen;




    event CarpletMinted(
        uint256 indexed fid,
        address indexed minter,
        string metadataURI
    );

    event MintFeeUpdated(uint256 newFee);

    error MaxSupplyExceeded();
    error FidAlreadyMinted();
    error InvalidFid();
    error IncorrectFee();

    constructor(address initialOwner) ERC721("Carplets", "CRPLT") Ownable(initialOwner) {}

    /**
     * @notice Mint a Carplet NFT. Token ID will be the user's FID.
     * @param fid The Farcaster ID of the user
     * @param metadataURI Full token URI (ipfs://...)
     */
    function mint(
        uint256 fid,
        string calldata metadataURI
    ) external payable nonReentrant {
        if (msg.value != mintFee) revert IncorrectFee();
        if (totalSupply >= MAX_SUPPLY) revert MaxSupplyExceeded();
        if (fid == 0 ) revert InvalidFid();
        if (fidMinted[fid]) revert FidAlreadyMinted();
        if (metadataFrozen) revert("MetadataFrozen");


        // Mark this FID as minted
        fidMinted[fid] = true;
        fidToMinter[fid] = msg.sender;
        totalSupply++;

        // Mint with FID as token ID
        _safeMint(msg.sender, fid);
        _setTokenURI(fid, metadataURI);

        emit CarpletMinted(fid, msg.sender, metadataURI);
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

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        return super._update(to, tokenId, auth);
    }

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
