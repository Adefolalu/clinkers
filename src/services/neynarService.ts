const NEYNAR_API_KEY = import.meta.env.VITE_NEYNAR_API_KEY;
const NEYNAR_BASE_URL = "https://api.neynar.com/v2";

export interface NeynarUser {
  fid: number;
  username: string;
  display_name: string;
  pfp_url?: string;
  bio?: {
    text: string;
  };
  verified_addresses?: {
    eth_addresses: string[];
  };
  follower_count: number;
  following_count: number;
  custody_address?: string;
}

export interface NeynarUserResponse {
  user: NeynarUser;
}

export interface NeynarUsersResponse {
  users: NeynarUser[];
}

/**
 * Fetch user data by FID from Neynar
 */
export async function fetchUserByFid(fid: number): Promise<NeynarUser | null> {
  try {
    const response = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'accept': 'application/json',
        'api_key': NEYNAR_API_KEY || '',
      },
    });

    if (!response.ok) {
      console.error(`Neynar API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: NeynarUsersResponse = await response.json();
    
    if (!data.users || data.users.length === 0) {
      console.error(`No user found for FID ${fid}`);
      return null;
    }

    return data.users[0];
  } catch (error) {
    console.error('Error fetching user from Neynar:', error);
    return null;
  }
}

/**
 * Verify if a wallet address owns a specific FID
 */
export async function verifyFidOwnership(fid: number, walletAddress: string): Promise<boolean> {
  try {
    const user = await fetchUserByFid(fid);
    
    if (!user) {
      return false;
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();
    
    // Check custody address (primary address)
    if (user.custody_address && user.custody_address.toLowerCase() === normalizedWalletAddress) {
      return true;
    }
    
    // Check verified addresses
    if (user.verified_addresses?.eth_addresses) {
      return user.verified_addresses.eth_addresses.some(
        addr => addr.toLowerCase() === normalizedWalletAddress
      );
    }
    
    return false;
  } catch (error) {
    console.error('Error verifying FID ownership:', error);
    return false;
  }
}

/**
 * Get user's personality traits from their Farcaster data
 */
export function extractPersonalityTraits(user: NeynarUser): {
  traits: string[];
  description: string;
} {
  const traits: string[] = [];
  let description = "";

  // Analyze follower/following ratio for personality insights
  const ratio = user.following_count > 0 ? user.follower_count / user.following_count : user.follower_count;
  
  if (ratio > 10) {
    traits.push("Influential");
    traits.push("Popular");
  } else if (ratio > 2) {
    traits.push("Engaging");
    traits.push("Social");
  } else if (user.following_count > user.follower_count * 2) {
    traits.push("Curious");
    traits.push("Explorer");
  }

  // Analyze bio for personality
  const bio = user.bio?.text?.toLowerCase() || "";
  
  if (bio.includes("build") || bio.includes("dev") || bio.includes("code")) {
    traits.push("Builder");
    traits.push("Technical");
  }
  
  if (bio.includes("art") || bio.includes("design") || bio.includes("creative")) {
    traits.push("Creative");
    traits.push("Artistic");
  }
  
  if (bio.includes("crypto") || bio.includes("web3") || bio.includes("blockchain")) {
    traits.push("Crypto Native");
    traits.push("Innovative");
  }
  
  if (bio.includes("meme") || bio.includes("fun") || bio.includes("lol")) {
    traits.push("Humorous");
    traits.push("Entertaining");
  }

  // Activity level based on follower count
  if (user.follower_count > 1000) {
    traits.push("Active Community Member");
  } else if (user.follower_count > 100) {
    traits.push("Growing Presence");
  } else {
    traits.push("Early Adopter");
  }

  // Create description
  description = `${user.display_name || user.username} is a Farcaster user with ${user.follower_count} followers and ${user.following_count} following. `;
  
  if (user.bio?.text) {
    description += `Their bio states: "${user.bio.text}". `;
  }
  
  if (traits.length > 0) {
    description += `Key traits: ${traits.slice(0, 3).join(", ")}.`;
  }

  return {
    traits: traits.slice(0, 6), // Limit to 6 traits
    description,
  };
}

/**
 * Generate a personality-based prompt for Carplet generation
 */
export function generateCarpletPrompt(user: NeynarUser): string {
  const { traits } = extractPersonalityTraits(user);
  
  const basePrompt = `Create a unique digital avatar representing ${user.display_name || user.username} (FID: ${user.fid}), a Farcaster user. `;
  
  let personalityPrompt = "";
  
  if (traits.includes("Influential")) {
    personalityPrompt += "This avatar should radiate leadership and confidence, with golden aura effects and regal elements. ";
  }
  
  if (traits.includes("Builder") || traits.includes("Technical")) {
    personalityPrompt += "Incorporate cybernetic elements, code patterns, and futuristic tech aesthetics. ";
  }
  
  if (traits.includes("Creative") || traits.includes("Artistic")) {
    personalityPrompt += "Add artistic flair with paint splatters, creative tools, and vibrant colors. ";
  }
  
  if (traits.includes("Crypto Native")) {
    personalityPrompt += "Include blockchain symbols, digital currency elements, and holographic effects. ";
  }
  
  if (traits.includes("Humorous")) {
    personalityPrompt += "Make it playful and fun with whimsical elements and bright, cheerful colors. ";
  }

  const stylePrompt = `Style: High-quality digital art, anime-inspired character design, vibrant colors, detailed shading, professional illustration. The character should be unique and memorable, capturing the essence of a Farcaster community member.`;

  return `${basePrompt}${personalityPrompt}${stylePrompt}`;
}