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
  power_badge?: boolean;
}

export interface NeynarUserResponse {
  user: NeynarUser;
}

export interface NeynarUsersResponse {
  users: NeynarUser[];
}

export interface NeynarCast {
  hash: string;
  text: string;
  timestamp: string;
  reactions: {
    likes_count: number;
    recasts_count: number;
  };
  replies: {
    count: number;
  };
}

export interface NeynarCastsResponse {
  casts: NeynarCast[];
  next?: {
    cursor: string | null;
  };
}

/**
 * Fetch user data by FID from Neynar
 */
export async function fetchUserByFid(fid: number): Promise<NeynarUser | null> {
  try {
    const response = await fetch(
      `${NEYNAR_BASE_URL}/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY || "",
        },
      }
    );

    if (!response.ok) {
      console.error(
        `Neynar API error: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data: NeynarUsersResponse = await response.json();

    if (!data.users || data.users.length === 0) {
      console.error(`No user found for FID ${fid}`);
      return null;
    }

    return data.users[0];
  } catch (error) {
    console.error("Error fetching user from Neynar:", error);
    return null;
  }
}

/**
 * Fetch user's popular casts from Neynar
 */
export async function fetchUserPopularCasts(
  fid: number,
  limit: number = 10
): Promise<NeynarCast[]> {
  try {
    const response = await fetch(
      `${NEYNAR_BASE_URL}/farcaster/feed/user/popular/?fid=${fid}&limit=${limit}`,
      {
        headers: {
          accept: "application/json",
          "x-api-key": NEYNAR_API_KEY || "",
        },
      }
    );

    if (!response.ok) {
      console.error(
        `Neynar casts API error: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data: NeynarCastsResponse = await response.json();

    if (!data.casts || data.casts.length === 0) {
      console.error(`No casts found for FID ${fid}`);
      return [];
    }

    return data.casts;
  } catch (error) {
    console.error("Error fetching user casts from Neynar:", error);
    return [];
  }
}

/**
 * Verify if a wallet address owns a specific FID
 */
export async function verifyFidOwnership(
  fid: number,
  walletAddress: string
): Promise<boolean> {
  try {
    const user = await fetchUserByFid(fid);

    if (!user) {
      return false;
    }

    const normalizedWalletAddress = walletAddress.toLowerCase();

    // Check custody address (primary address)
    if (
      user.custody_address &&
      user.custody_address.toLowerCase() === normalizedWalletAddress
    ) {
      return true;
    }

    // Check verified addresses
    if (user.verified_addresses?.eth_addresses) {
      return user.verified_addresses.eth_addresses.some(
        (addr) => addr.toLowerCase() === normalizedWalletAddress
      );
    }

    return false;
  } catch (error) {
    console.error("Error verifying FID ownership:", error);
    return false;
  }
}

/**
 * Get user's personality traits from their Farcaster data and casts
 */
export function extractPersonalityTraits(
  user: NeynarUser,
  casts: NeynarCast[] = []
): {
  traits: string[];
  description: string;
  interests: string[];
  activity: string;
} {
  const traits: string[] = [];
  const interests: string[] = [];
  let description = "";
  let activity = "";

  // Analyze follower/following ratio for personality insights
  const ratio =
    user.following_count > 0
      ? user.follower_count / user.following_count
      : user.follower_count;

  if (ratio > 10) {
    traits.push("Influential");
    traits.push("Thought Leader");
  } else if (ratio > 3) {
    traits.push("Engaging");
    traits.push("Community Builder");
  } else if (user.following_count > user.follower_count * 2) {
    traits.push("Curious");
    traits.push("Network Expander");
  }

  // Analyze bio for personality
  const bio = user.bio?.text?.toLowerCase() || "";

  if (
    bio.includes("build") ||
    bio.includes("dev") ||
    bio.includes("code") ||
    bio.includes("engineer")
  ) {
    traits.push("Builder");
    traits.push("Technical");
    interests.push("Development");
  }

  if (
    bio.includes("art") ||
    bio.includes("design") ||
    bio.includes("creative")
  ) {
    traits.push("Creative");
    traits.push("Artistic");
    interests.push("Design");
  }

  if (
    bio.includes("crypto") ||
    bio.includes("web3") ||
    bio.includes("blockchain") ||
    bio.includes("defi")
  ) {
    traits.push("Crypto Native");
    traits.push("Innovative");
    interests.push("Blockchain");
  }

  // Analyze casts content for deeper personality insights
  const allCastText = casts.map((cast) => cast.text.toLowerCase()).join(" ");
  let totalEngagement = 0;
  let avgEngagement = 0;

  if (casts.length > 0) {
    totalEngagement = casts.reduce(
      (sum, cast) =>
        sum +
        cast.reactions.likes_count +
        cast.reactions.recasts_count +
        cast.replies.count,
      0
    );
    avgEngagement = totalEngagement / casts.length;

    // Analyze cast content for interests and traits
    if (
      allCastText.includes("build") ||
      allCastText.includes("launch") ||
      allCastText.includes("project")
    ) {
      traits.push("Project Creator");
      interests.push("Innovation");
    }

    if (
      allCastText.includes("trade") ||
      allCastText.includes("token") ||
      allCastText.includes("degen")
    ) {
      traits.push("DeFi Trader");
      interests.push("Trading");
    }

    if (
      allCastText.includes("airdrop") ||
      allCastText.includes("rain") ||
      allCastText.includes("reward")
    ) {
      traits.push("Community Rewader");
      interests.push("Token Distribution");
    }

    if (
      allCastText.includes("art") ||
      allCastText.includes("nft") ||
      allCastText.includes("mint")
    ) {
      traits.push("NFT Enthusiast");
      interests.push("Digital Art");
    }

    if (
      allCastText.includes("meme") ||
      allCastText.includes("😂") ||
      allCastText.includes("lol")
    ) {
      traits.push("Humorous");
      interests.push("Memes");
    }

    if (
      allCastText.includes("frame") ||
      allCastText.includes("miniapp") ||
      allCastText.includes("bot")
    ) {
      traits.push("Frame Developer");
      interests.push("Farcaster Apps");
    }

    // Engagement-based traits
    if (avgEngagement > 100) {
      traits.push("Viral Creator");
      activity = "Creates highly engaging content";
    } else if (avgEngagement > 25) {
      traits.push("Popular Creator");
      activity = "Consistent community engagement";
    } else {
      traits.push("Authentic Voice");
      activity = "Quality over quantity content";
    }
  }

  // Power badge consideration
  if (user.power_badge) {
    traits.push("Power User");
    traits.push("Farcaster OG");
  }

  // Activity level based on follower count
  if (user.follower_count > 5000) {
    traits.push("Major Influencer");
  } else if (user.follower_count > 1000) {
    traits.push("Active Community Member");
  } else if (user.follower_count > 100) {
    traits.push("Growing Presence");
  } else {
    traits.push("Early Adopter");
  }

  // Create comprehensive description
  description = `${user.display_name || user.username} is a Farcaster user with ${user.follower_count} followers and ${user.following_count} following. `;

  if (user.bio?.text) {
    description += `Bio: "${user.bio.text}". `;
  }

  if (casts.length > 0) {
    description += `Recent activity shows ${avgEngagement.toFixed(0)} average engagement per cast. `;
  }

  if (interests.length > 0) {
    description += `Primary interests: ${interests.slice(0, 4).join(", ")}. `;
  }

  if (traits.length > 0) {
    description += `Key personality traits: ${traits.slice(0, 4).join(", ")}.`;
  }

  return {
    traits: [...new Set(traits)].slice(0, 8), // Remove duplicates and limit to 8 traits
    description,
    interests: [...new Set(interests)].slice(0, 5), // Remove duplicates and limit to 5 interests
    activity: activity || "Authentic community participant",
  };
}

/**
 * Generate a comprehensive personality-based prompt for Carplet generation
 */
export async function generateCarpletPrompt(user: NeynarUser): Promise<string> {
  // Fetch user's popular casts for better personality analysis
  const casts = await fetchUserPopularCasts(user.fid, 10);
  const { traits, interests } = extractPersonalityTraits(user, casts);

  // Base Carplet prompt - consistent NFT art style
  const basePrompt = `A 2D digital illustration of Carplet #${user.fid}, a cute, round yellow-green creature inspired by the Celo blockchain. The character has smooth glossy skin, large expressive eyes, and a small green leaf sprouting from its head. Its body glows softly with eco-energy, featuring minimalist markings — including a stylized Celo-inspired circular logo and a small tech-chip pattern on its chest. `;

  let personalityCustomizations = "";
  let accessoryElements = [];

  // Personality-based accessories and modifications while keeping core Carplet design
  if (traits.includes("Influential") || traits.includes("Thought Leader")) {
    personalityCustomizations +=
      "The Carplet wears a small golden crown or halo effect around its head. Its eyes have a wise, confident sparkle. ";
    accessoryElements.push(
      "golden crown",
      "wise expression",
      "leadership aura"
    );
  }

  if (
    traits.includes("Builder") ||
    traits.includes("Technical") ||
    traits.includes("Project Creator")
  ) {
    personalityCustomizations +=
      "The Carplet has small holographic code symbols floating around it, tiny circuit patterns on its cheeks, and wears tiny tech goggles or has a small antenna. ";
    accessoryElements.push("code symbols", "circuit patterns", "tech goggles");
  }

  if (
    traits.includes("Frame Developer") ||
    interests.includes("Farcaster Apps")
  ) {
    personalityCustomizations +=
      "The Carplet has purple-tinted accents on its body, small frame-like geometric patterns on its surface, and miniature app icons floating nearby. ";
    accessoryElements.push("purple accents", "geometric frames", "app icons");
  }

  if (traits.includes("DeFi Trader") || interests.includes("Trading")) {
    personalityCustomizations +=
      "The Carplet wears tiny trading glasses, has small chart patterns on its body, and cryptocurrency symbols (₿, Ξ, etc.) floating around it. ";
    accessoryElements.push(
      "trading glasses",
      "chart patterns",
      "crypto symbols"
    );
  }

  if (traits.includes("Creative") || traits.includes("Artistic")) {
    personalityCustomizations +=
      "The Carplet has paint splatter patterns on its body in rainbow colors, holds a tiny paintbrush, and has creative sparkles around it. ";
    accessoryElements.push(
      "paint splatters",
      "tiny paintbrush",
      "creative sparkles"
    );
  }

  if (traits.includes("NFT Enthusiast") || interests.includes("Digital Art")) {
    personalityCustomizations +=
      "The Carplet has a subtle pixelated border effect, small NFT-style shine particles, and collectible gem patterns on its surface. ";
    accessoryElements.push(
      "pixelated effects",
      "shine particles",
      "gem patterns"
    );
  }

  if (
    traits.includes("Community Rewader") ||
    interests.includes("Token Distribution")
  ) {
    personalityCustomizations +=
      "The Carplet has small token symbols raining down around it, community heart symbols on its chest, and a generous, smiling expression. ";
    accessoryElements.push("token rain", "heart symbols", "generous smile");
  }

  if (traits.includes("Crypto Native")) {
    personalityCustomizations +=
      "The Carplet has blockchain node patterns on its surface, small Web3 symbols, and decentralized network lines connecting around it. ";
    accessoryElements.push(
      "blockchain patterns",
      "web3 symbols",
      "network lines"
    );
  }

  if (traits.includes("Humorous") || interests.includes("Memes")) {
    personalityCustomizations +=
      "The Carplet has a playful, mischievous expression with tongue sticking out slightly, meme-style sunglasses, and fun emoji symbols floating around. ";
    accessoryElements.push(
      "mischievous expression",
      "meme sunglasses",
      "emoji symbols"
    );
  }

  if (traits.includes("Power User") || traits.includes("Farcaster OG")) {
    personalityCustomizations +=
      "The Carplet wears a special OG badge or veteran patch, has exclusive purple power-user markings, and a confident, experienced expression. ";
    accessoryElements.push(
      "OG badge",
      "power-user markings",
      "veteran confidence"
    );
  }

  // Activity-based modifications
  if (traits.includes("Viral Creator")) {
    personalityCustomizations +=
      "The Carplet has trending arrow symbols around it, viral energy waves, and an excited, dynamic expression. ";
    accessoryElements.push("trending arrows", "energy waves", "dynamic pose");
  }

  // Follower count influence on background and aura
  if (user.follower_count > 5000) {
    personalityCustomizations +=
      "The background has subtle spotlight effects and the Carplet has a commanding, influential aura with golden particles. ";
    accessoryElements.push(
      "spotlight background",
      "golden particles",
      "influential aura"
    );
  } else if (user.follower_count > 1000) {
    personalityCustomizations +=
      "The background shows gentle community connection lines and the Carplet has collaborative energy symbols around it. ";
    accessoryElements.push(
      "connection lines",
      "collaborative symbols",
      "community energy"
    );
  }

  // Final style and composition
  const styleAndComposition = `The color palette blends warm yellow (#FBCC5C) and vibrant green (#35D07F) with smooth gradient shading. Additional accent colors may include subtle personality-based hues. The background is a deep green gradient with faint glowing particles to evoke sustainability and decentralized technology. ${personalityCustomizations}Rendered in a clean, cartoon-like NFT style, similar to Warplets and Arblets, with balanced lighting, soft shadows, and centered composition. The Carplet should remain recognizable as the core character while showcasing the unique personality traits of ${user.display_name || user.username}.`;

  return `${basePrompt}${styleAndComposition}`;
}
