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

// -----------------------------
// Deterministic design utilities
// -----------------------------

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  // Ensure positive 32-bit
  return hash >>> 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hslToHex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const toHex = (v: number) => {
    const n = Math.round((v + m) * 255);
    return n.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export interface CarpletDesignSpec {
  backgroundHex: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  silhouette: string; // compact round | chibi | tall slim | athletic | techy angular
  accessories: string[]; // 2-4 items
  expression: string; // calm / cheerful / confident / mischievous / focused
}

function deriveCarpletDesignSpec(
  user: NeynarUser,
  traits: string[],
  interests: string[]
): CarpletDesignSpec {
  const seedStr = `${user.fid}-${user.username}-${user.follower_count}-${user.following_count}-${user.power_badge ? 1 : 0}`;
  const seed = hashString(seedStr);

  // Base hue influenced by username/fid; biases: builders/tech -> cooler hues; creatives -> warmer;
  let baseHue = seed % 360;
  if (
    traits.includes("Builder") ||
    traits.includes("Technical") ||
    traits.includes("Frame Developer")
  ) {
    baseHue = (baseHue * 0.5 + 200) % 360; // push toward cyan/blue
  } else if (traits.includes("Creative") || traits.includes("Artistic")) {
    baseHue = (baseHue * 0.5 + 25) % 360; // push toward orange
  } else if (
    traits.includes("Crypto Native") ||
    interests.includes("Blockchain")
  ) {
    baseHue = (baseHue * 0.5 + 135) % 360; // green bias
  }

  // Saturation/lightness based on influence/activity
  const influence = clamp(user.follower_count, 0, 20000) / 20000; // 0..1
  const saturation =
    55 + Math.round((seed % 30) * 0.7) + Math.round(influence * 10); // 55-86
  const lightness =
    58 + Math.round(((seed >> 4) % 20) * 0.7) - Math.round(influence * 8); // ~50-72

  const primaryHex = hslToHex(baseHue, saturation, lightness);
  const secondaryHex = hslToHex(
    (baseHue + 30) % 360,
    clamp(saturation - 10, 35, 95),
    clamp(lightness - 10, 30, 85)
  );
  const accentHex = hslToHex(
    (baseHue + 300) % 360,
    clamp(saturation + 10, 35, 95),
    clamp(lightness + 5, 30, 85)
  );

  // Background color: plain, HIGHLY visible (not white). Use a complementary/triadic hue
  // with medium saturation and mid-high lightness for clean contrast.
  const hueOffset = 180 + ((seed >> 7) % 60) - 30; // 150..210 range around complement
  const bgHue = (baseHue + hueOffset + 360) % 360;
  const bgSat = clamp(30 + (seed % 25), 30, 55); // 30–55 medium saturation
  const bgLight = clamp(60 + ((seed >> 4) % 20), 60, 78); // 60–78 mid/high lightness (clearly not white)
  const backgroundHex = hslToHex(bgHue, bgSat, bgLight);

  // Silhouette based on traits
  let silhouette = "compact round";
  if (traits.includes("Influential") || traits.includes("Thought Leader"))
    silhouette = "tall slim";
  if (traits.includes("Athletic")) silhouette = "athletic";
  if (traits.includes("Builder") || traits.includes("Technical"))
    silhouette = "techy angular";
  if (traits.includes("Creative") || traits.includes("Artistic"))
    silhouette = "chibi";

  // Expression
  let expression = "confident";
  if (traits.includes("Humorous")) expression = "mischievous";
  else if (traits.includes("Creative")) expression = "cheerful";
  else if (traits.includes("Technical")) expression = "focused";

  // Accessories pool
  const pool = new Set<string>();
  if (
    traits.includes("Builder") ||
    traits.includes("Technical") ||
    traits.includes("Project Creator")
  ) {
    pool.add("tech goggles");
    pool.add("tiny antenna");
    pool.add("holographic code symbols");
  }
  if (traits.includes("Influential") || traits.includes("Thought Leader")) {
    pool.add("mini crown");
    pool.add("leadership aura");
  }
  if (traits.includes("DeFi Trader") || interests.includes("Trading")) {
    pool.add("trading glasses");
    pool.add("mini chart charm");
  }
  if (traits.includes("Creative") || traits.includes("Artistic")) {
    pool.add("paintbrush");
    pool.add("color splatter accents");
  }
  if (traits.includes("NFT Enthusiast")) {
    pool.add("collectible gem pin");
  }
  if (traits.includes("Power User") || traits.includes("Farcaster OG")) {
    pool.add("OG badge");
  }
  // Ensure some generic options
  pool.add("Base pendant");
  pool.add("leaf sprout");

  // Deterministically pick 2-4 accessories
  const accessories = Array.from(pool);
  const selected: string[] = [];
  for (let i = 0; i < accessories.length && selected.length < 4; i++) {
    const bit = (seed >> i % 16) & 1;
    if (bit) selected.push(accessories[i]);
  }
  if (selected.length < 2 && accessories.length > 0) {
    selected.push(accessories[(seed >> 5) % accessories.length]);
  }

  return {
    backgroundHex,
    primaryHex,
    secondaryHex,
    accentHex,
    silhouette,
    accessories: selected.slice(0, 4),
    expression,
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

  // Design spec derived from user data
  const spec = deriveCarpletDesignSpec(user, traits, interests);

  // Base identity description (anchors remain but allow wide variation)
  const basePrompt = `A 2D digital illustration of Clinker #${user.fid} — a friendly collectible character with a glossy rounded aesthetic, large expressive eyes, and a small green leaf sprouting from its head. Include a subtle Base-inspired portal motif as a brand anchor.`;

  let personalityCustomizations = "";
  const accessoryElements: string[] = [];

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

  // Remove busy background cues entirely; enforce plain background in DESIGN_SPEC below

  // Final style, explicit background and palette directives
  const designSpecText = `
DESIGN_SPEC (STRICT):
- BACKGROUND_COLOR: ${spec.backgroundHex} (plain, solid fill). NO gradients, NO textures, NO patterns, NO particles.
- CLINKER_COLORS: primary ${spec.primaryHex}, secondary ${spec.secondaryHex}, accent ${spec.accentHex}. Prefer these over default brand colors.
- SILHOUETTE: ${spec.silhouette} (you may adjust proportions/pose accordingly).
- EXPRESSION: ${spec.expression}.
- ACCESSORIES (use 2–4 total, tasteful): ${[...new Set([...accessoryElements, ...spec.accessories])].slice(0, 4).join(", ")}.

RENDERING RULES:
- Maintain identity anchors: leaf sprout and a subtle circular Base motif.
- Background must remain a single flat color (${spec.backgroundHex}). Do NOT add shapes or gradients.
- Keep the character centered with soft shadows and high-quality lighting. No border unless necessary.
`;

  const styleAndComposition = `${personalityCustomizations} Render in a premium, collectible, cartoon-like NFT style with glossy finish and soft shadows. Emphasize uniqueness from the color palette and silhouette.`;

  return `${basePrompt}\n\n${designSpecText}\n${styleAndComposition}`;
}

// Backwards-compatible Clinker aliases
export type ClinkerDesignSpec = CarpletDesignSpec;
export const deriveClinkerDesignSpec = deriveCarpletDesignSpec;
export async function generateClinkerPrompt(user: NeynarUser): Promise<string> {
  return generateCarpletPrompt(user);
}
