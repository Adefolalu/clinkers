const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const WARPLET_CONTRACT = "0x699727F9E01A822EFdcf7333073f0461e5914b4E";

export interface WarpletNFT {
  tokenId: string;
  name: string;
  description: string;
  image: string;
  owner: string | null;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
}

export interface NFTData {
  tokenId: string;
  name: string;
  image: string;
  metadata?: any;
}

/**
 * Fetch a specific Warplet by token ID
 */
export async function fetchWarpletByTokenId(
  tokenId: number
): Promise<NFTData | null> {
  try {
    const url = `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTMetadata`;

    const params = new URLSearchParams({
      contractAddress: WARPLET_CONTRACT,
      tokenId: tokenId.toString(),
      refreshCache: "false",
    });

    const response = await fetch(`${url}?${params}`, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch Warplet: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const metadata = await response.json();

    return {
      tokenId: tokenId.toString(),
      name: metadata?.name || `Warplet #${tokenId}`,
      image:
        metadata?.image?.cachedUrl ||
        metadata?.image?.originalUrl ||
        metadata?.rawMetadata?.image ||
        "",
      metadata: metadata?.rawMetadata || {},
    };
  } catch (error) {
    console.error("Error fetching Warplet:", error);
    return null;
  }
}

/**
 * Check if an address owns a specific Warplet token
 */
export async function checkWarpletOwnership(
  ownerAddress: string,
  tokenId: number
): Promise<boolean> {
  try {
    // Use v2 API endpoint for getOwnersForToken
    const url = `https://base-mainnet.g.alchemy.com/nft/v2/${ALCHEMY_API_KEY}/getOwnersForToken`;

    const params = new URLSearchParams({
      contractAddress: WARPLET_CONTRACT,
      tokenId: tokenId.toString(),
    });

    const response = await fetch(`${url}?${params}`, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Ownership check failed: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    const data = await response.json();
    console.log("Ownership check response:", data);

    // Alchemy v2 returns {"owners": ["0x..."]}
    const owners: string[] =
      (Array.isArray(data?.owners) && data.owners) ||
      (Array.isArray(data?.ownerAddresses) && data.ownerAddresses) ||
      [];

    console.log("Extracted owners:", owners);
    console.log("Checking against address:", ownerAddress);

    const target = ownerAddress.toLowerCase();
    const isOwner = owners.some(
      (addr) => typeof addr === "string" && addr.toLowerCase() === target
    );

    console.log("Ownership result:", isOwner);
    return isOwner;
  } catch (error) {
    console.error("Error checking ownership:", error);
    return false;
  }
}

/**
 * Get all Warplets owned by an address
 */
export async function fetchUserWarplets(
  ownerAddress: string
): Promise<WarpletNFT[]> {
  try {
    const url = `https://base-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner?owner=${ownerAddress}&contractAddresses[]=${WARPLET_CONTRACT}&withMetadata=true`;

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch NFTs: ${response.statusText}`);
    }

    const data = await response.json();

    return (data.ownedNfts || []).map((nft: any) => ({
      tokenId: nft.tokenId,
      name: nft.name || `Warplet #${nft.tokenId}`,
      description: nft.description || "",
      image: nft.image?.cachedUrl || nft.image?.originalUrl,
      owner: ownerAddress,
      attributes: nft.raw?.metadata?.attributes || [],
    }));
  } catch (error) {
    console.error("Error fetching user Warplets:", error);
    return [];
  }
}
