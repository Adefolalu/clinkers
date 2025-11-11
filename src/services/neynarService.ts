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
  score?: number; // Neynar user score (0-1)
  experimental?: {
    neynar_user_score?: number;
  };
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
 * Determine user's phase/tier based on Neynar score, follower count, and power badge
 */
export function determineUserPhase(user: NeynarUser): {
  phase: number;
  phaseName: string;
  description: string;
} {
  // Extract score (prefer stable field, fallback to experimental)
  const score = user.score ?? user.experimental?.neynar_user_score ?? 0;
  const followers = user.follower_count;
  const hasPowerBadge = user.power_badge ?? false;

  // Phase determination logic:
  // Phase 3 (Elite): Score >= 0.90 OR 5000+ followers OR power badge
  // Phase 2 (Advanced): Score >= 0.70 OR 1000+ followers
  // Phase 1 (Standard): Everyone else

  if (score >= 0.90 || followers >= 5000 || hasPowerBadge) {
    return {
      phase: 3,
      phaseName: "Elite",
      description: "High-influence user with premium access",
    };
  }

  if (score >= 0.70 || followers >= 1000) {
    return {
      phase: 2,
      phaseName: "Advanced",
      description: "Engaged community member with priority access",
    };
  }

  return {
    phase: 1,
    phaseName: "Standard",
    description: "Community member with standard access",
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
 * Generate a comprehensive prompt for Clinker generation based on user phase
 */
export async function generateCarpletPrompt(user: NeynarUser): Promise<string> {
  // Determine user's phase/tier
  const { phase, phaseName } = determineUserPhase(user);

  // Design spec derived from user data (using empty arrays for traits/interests)
  const spec = deriveCarpletDesignSpec(user, [], []);

  // Base identity description
  const basePrompt = `A 2D digital illustration of Clinker #${user.fid} — a friendly collectible character with a glossy rounded aesthetic, large expressive eyes, and a small green leaf sprouting from its head. Include a subtle Base-inspired portal motif as a brand anchor.`;

  // Phase-based customizations
  let phaseCustomizations = "";
  const accessoryElements: string[] = [];

  if (phase === 3) {
    // Elite tier - premium look
    phaseCustomizations =
      "The Clinker has a premium golden aura or subtle glow effect, elite badge markings, and a confident, distinguished expression. ";
    accessoryElements.push("golden aura", "elite badge", "premium glow");
  } else if (phase === 2) {
    // Advanced tier - enhanced features
    phaseCustomizations =
      "The Clinker has enhanced color vibrancy, special accent patterns, and an engaged, dynamic expression. ";
    accessoryElements.push("vibrant accents", "special patterns", "dynamic pose");
  } else {
    // Standard tier - classic look
    phaseCustomizations =
      "The Clinker has a friendly, approachable appearance with classic collectible styling. ";
    accessoryElements.push("classic style", "friendly expression");
  }

  // Add power badge indicator if user has it
  if (user.power_badge) {
    phaseCustomizations += "Features a special power user badge or Farcaster OG marking. ";
    accessoryElements.push("power badge");
  }

  // Final style directives
  const designSpecText = `
DESIGN_SPEC (STRICT):
- TIER: ${phaseName} (Phase ${phase})
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

  const styleAndComposition = `${phaseCustomizations} Render in a premium, collectible, cartoon-like NFT style with glossy finish and soft shadows. Emphasize uniqueness from the color palette and silhouette.`;

  return `${basePrompt}\n\n${designSpecText}\n${styleAndComposition}`;
}

// Backwards-compatible Clinker aliases
export type ClinkerDesignSpec = CarpletDesignSpec;
export const deriveClinkerDesignSpec = deriveCarpletDesignSpec;
export async function generateClinkerPrompt(user: NeynarUser): Promise<string> {
  return generateCarpletPrompt(user);
}
