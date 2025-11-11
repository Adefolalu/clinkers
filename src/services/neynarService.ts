/**
 * CLINKERS — Neynar-integrated NFT logic
 * Determines user phase (Baby → Youngin → Rising Star → OG)
 * and generates a prompt that EVOLVES the Clinker art without redesigning it.
 */

const NEYNAR_API_KEY = import.meta.env.VITE_NEYNAR_API_KEY;
const NEYNAR_BASE_URL = "https://api.neynar.com/v2";

export interface NeynarUser {
  fid: number;
  username: string;
  display_name: string;
  pfp_url?: string;
  bio?: { text: string };
  verified_addresses?: { eth_addresses: string[] };
  follower_count: number;
  following_count: number;
  custody_address?: string;
  power_badge?: boolean;
  score?: number;
  created_at?: string; // Include for account age
  experimental?: {
    neynar_user_score?: number;
  };
}

export interface NeynarUsersResponse {
  users: NeynarUser[];
}

// -----------------------------
// Deterministic utilities
// -----------------------------
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
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
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// -----------------------------
// CLINKER PHASE LOGIC
// -----------------------------
export function determineClinkerPhase(user: NeynarUser): {
  phase: number;
  phaseName: string;
  description: string;
} {
  const score = user.score ?? user.experimental?.neynar_user_score ?? 0;
  const followers = user.follower_count;

  
  // Tiering logic based on Neynar score + age + followers (requires ALL conditions)
  if (score >= 0.9 && followers > 5000 ) {
    return {
      phase: 4,
      phaseName: "OG",
      description: "Long-time, high-score user with elite standing",
    };
  }
  if (score >= 0.7 && followers > 1000 ) {
    return {
      phase: 3,
      phaseName: "Rising Star",
      description: "Established, influential Clinker with growing recognition",
    };
  }
  if (score >= 0.4 && followers > 100 ) {
    return {
      phase: 2,
      phaseName: "Youngin",
      description: "Active, promising Clinker gaining traction",
    };
  }
  return {
    phase: 1,
    phaseName: "Baby",
    description: "New member, fresh in the Clinkers realm",
  };
}

// -----------------------------
// PROMPT GENERATION (CORE)
// -----------------------------
export async function generateClinkerPrompt(user: NeynarUser): Promise<string> {
  const { phase, phaseName, description } = determineClinkerPhase(user);
  
  console.log(`🎯 Clinker Phase Determined:`, {
    fid: user.fid,
    username: user.username,
    phase,
    phaseName,
    description,
    neynarScore: user.score ?? user.experimental?.neynar_user_score ?? 0,
    followers: user.follower_count,
    accountAge: user.created_at,
  });

  // Generate deterministic but unique traits based on user FID + follower count for extra entropy
  const seed = hashString(`${user.fid}-${phaseName}-${user.username}-${user.follower_count}`);
  const seed2 = hashString(`${user.username}-${user.fid}`);
  const seed3 = hashString(`${user.display_name}-${user.follower_count}`);
  
  // COLOR PALETTE - Each Clinker gets unique colors
  const baseHue = seed % 360;
  const hueVariation = (seed2 % 60) - 30; // ±30 degree variation
  const eyeHue = (baseHue + hueVariation + 360) % 360;
  const eyeSat = 65 + (seed % 25); // 65-90% saturation
  const eyeLight = 55 + (seed2 % 20); // 55-75% lightness
  const eyeColor = hslToHex(eyeHue, eyeSat, eyeLight);
  
  const stoneHue = (baseHue + phase * 45 + (seed3 % 40)) % 360;
  const stoneSat = 50 + ((seed >> 2) % 30); // 50-80%
  const stoneLight = 45 + ((seed2 >> 2) % 25); // 45-70%
  const stoneColor = hslToHex(stoneHue, stoneSat, stoneLight);

  const accentHue = (baseHue + 120 + (seed % 120)) % 360; // Triadic or split-complementary
  const accentSat = 60 + (seed3 % 30); // 60-90%
  const accentLight = 50 + ((seed >> 3) % 25); // 50-75%
  const accentColor = hslToHex(accentHue, accentSat, accentLight);
  
  // SURFACE PATTERNS - More variety
  const patterns = [
    "crystalline facets with geometric edges",
    "smooth glossy polished surface",
    "rough textured with micro-pores",
    "iridescent shimmer that shifts colors",
    "matte stone with soft gradient",
    "metallic sheen with reflective spots",
    "cracked weathered ancient look",
    "swirling marble-like veins",
    "bumpy pebbled texture",
    "frosted translucent appearance",
    "layered sedimentary bands",
    "speckled with tiny dots"
  ];
  const patternIndex = seed % patterns.length;
  const surfacePattern = patterns[patternIndex];
  
  // UNIQUE FEATURES - Expand variety
  const features = [
    "tiny glowing gem embedded in forehead",
    "subtle lightning-bolt crack pattern",
    "pulsing glowing vein lines",
    "small crystal cluster growth on side",
    "faint ancient rune marks",
    "floating energy wisps",
    "bioluminescent spots scattered",
    "frost or ice crystals forming",
    "miniature orbiting particles",
    "ethereal smoke trail",
    "prismatic light refraction",
    "subtle geometric tattoos",
    "small barnacle-like growths",
    "moss or lichen patches",
    "carved symbolic patterns"
  ];
  const featureIndex = (seed >> 4) % features.length;
  const uniqueFeature = features[featureIndex];
  
  // PERSONALITY EXPRESSIONS - More variety
  const expressions = [
    "curious wide-eyed wonder",
    "confident knowing gaze",
    "playful mischievous smile",
    "wise ancient stare",
    "determined focused look",
    "serene peaceful calm",
    "cheeky sideways glance",
    "sleepy half-closed eyes",
    "excited energetic sparkle",
    "grumpy furrowed brow",
    "shy bashful look away",
    "proud chin-up posture"
  ];
  const expressionIndex = (seed >> 8) % expressions.length;
  const personality = expressions[expressionIndex];
  
  // BODY PROPORTIONS - Subtle variations within phase
  const proportions = [
    "slightly rounder and squatter",
    "slightly taller and slimmer",
    "perfectly balanced proportions",
    "wide base tapering up",
    "narrow base widening up",
    "asymmetric charming tilt"
  ];
  const proportionIndex = (seed3 >> 2) % proportions.length;
  const bodyShape = proportions[proportionIndex];
  
  // EYE DETAILS - Make eyes distinctive
  const eyeShapes = [
    "large round pupils",
    "oval almond-shaped eyes",
    "small beady eyes",
    "one eye slightly larger",
    "eyes close together",
    "eyes wide apart",
    "droopy relaxed eyelids",
    "alert upturned eyes"
  ];
  const eyeShapeIndex = ((seed + seed2) >> 3) % eyeShapes.length;
  const eyeShape = eyeShapes[eyeShapeIndex];
  
  // SPECIAL EFFECTS - Aura/glow variations
  const auraEffects = [
    "soft diffused glow",
    "sharp defined aura",
    "pulsing rhythmic light",
    "flickering subtle shimmer",
    "steady constant radiance",
    "swirling spiral energy",
    "geometric light patterns",
    "wispy trailing glow"
  ];
  const auraIndex = (seed2 >> 4) % auraEffects.length;
  const auraStyle = auraEffects[auraIndex];

  const basePrompt = `A digital 2D collectible NFT of Clinker #${user.fid} — a unique stone-like creature with soft round form, expressive eyes, and a subtle Base-themed glow.`;

  // Define phase-based attributes
  let phaseDescription = "";
  if (phase === 1)
    phaseDescription = "BABY tier: Small, compact form with soft edges and gentle proportions.";
  else if (phase === 2)
    phaseDescription = "YOUNGIN tier: Growing form with developing features and youthful energy.";
  else if (phase === 3)
    phaseDescription = "RISING STAR tier: Mature presence with refined details and confident stance.";
  else
    phaseDescription = "OG tier: Commanding ancient form with majestic proportions and legendary aura.";

  return `${basePrompt}

PHASE: ${phaseName} (Stage ${phase}/4)
${phaseDescription}

═══════════════════════════════════════════════════════════════
UNIQUE DNA FOR CLINKER #${user.fid} (${user.username})
═══════════════════════════════════════════════════════════════

🎨 COLOR PALETTE (Must be prominently visible):
   • Eye Color: ${eyeColor} (${eyeShape})
   • Stone Body: ${stoneColor} (${surfacePattern})
   • Accent/Glow: ${accentColor} (${auraStyle})

✨ DISTINCTIVE FEATURES:
   • Special Trait: ${uniqueFeature}
   • Body Variation: ${bodyShape} (within phase proportions)
   • Facial Expression: ${personality}

🔬 RENDERING INSTRUCTIONS:
1. START with the phase-appropriate base structure from reference image
2. TRANSFORM the colors to match the unique palette above - this is CRITICAL
3. APPLY the specified surface texture (${surfacePattern}) to the body
4. ADD the unique feature (${uniqueFeature}) in a visible but tasteful way
5. ADJUST body proportions subtly (${bodyShape}) while keeping phase silhouette
6. RENDER eyes with (${eyeShape}) using color ${eyeColor}
7. ADD glow/aura with (${auraStyle}) using color ${accentColor}
8. EXPRESS personality through (${personality})
9. PRESERVE background exactly as shown in base image
10. Ensure NO TWO Clinkers look identical - emphasize color differences

⚠️ CRITICAL: The three colors (${eyeColor}, ${stoneColor}, ${accentColor}) MUST dominate the design.
This Clinker should be instantly recognizable by its unique color combination.

UNIQUENESS SEEDS: [${seed}, ${seed2}, ${seed3}]
USERNAME: ${user.username} | FOLLOWERS: ${user.follower_count}
`;
}

// -----------------------------
// NEYNAR USER FETCH
// -----------------------------
export async function fetchUserByFid(fid: number): Promise<NeynarUser | null> {
  try {
    const res = await fetch(`${NEYNAR_BASE_URL}/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        accept: "application/json",
        api_key: NEYNAR_API_KEY || "",
      },
    });
    if (!res.ok) return null;
    const data: NeynarUsersResponse = await res.json();
    return data.users?.[0] || null;
  } catch (err) {
    console.error("❌ Neynar fetch error:", err);
    return null;
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
