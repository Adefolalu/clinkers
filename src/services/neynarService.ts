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

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

// Extract dominant colors from profile picture
async function extractPfpColors(pfpUrl: string): Promise<{ primary: string; secondary: string; accent: string } | null> {
  try {
    // Create a canvas to analyze the image
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = pfpUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Scale down for performance
    const size = 50;
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    // Collect color samples (skip nearly white/black/gray)
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // Skip transparent, too dark, too light, or too gray
      if (a < 128) continue;
      const brightness = (r + g + b) / 3;
      if (brightness < 30 || brightness > 240) continue;
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (maxDiff < 15) continue; // Skip grays

      colors.push([r, g, b]);
    }

    if (colors.length === 0) {
      console.warn('No vibrant colors found in PFP, using fallback');
      return null;
    }

    // K-means clustering to find 3 dominant colors
    const clusters = 3;
    let centroids: Array<[number, number, number]> = [];
    
    // Initialize centroids randomly
    for (let i = 0; i < clusters; i++) {
      centroids.push(colors[Math.floor(Math.random() * colors.length)]);
    }

    // Run k-means iterations
    for (let iter = 0; iter < 10; iter++) {
      const groups: Array<Array<[number, number, number]>> = [[], [], []];
      
      // Assign each color to nearest centroid
      for (const color of colors) {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let c = 0; c < clusters; c++) {
          const dist = Math.sqrt(
            Math.pow(color[0] - centroids[c][0], 2) +
            Math.pow(color[1] - centroids[c][1], 2) +
            Math.pow(color[2] - centroids[c][2], 2)
          );
          if (dist < minDist) {
            minDist = dist;
            bestCluster = c;
          }
        }
        groups[bestCluster].push(color);
      }

      // Recalculate centroids
      for (let c = 0; c < clusters; c++) {
        if (groups[c].length > 0) {
          const avgR = groups[c].reduce((sum, col) => sum + col[0], 0) / groups[c].length;
          const avgG = groups[c].reduce((sum, col) => sum + col[1], 0) / groups[c].length;
          const avgB = groups[c].reduce((sum, col) => sum + col[2], 0) / groups[c].length;
          centroids[c] = [avgR, avgG, avgB];
        }
      }
    }

    // Convert to hex and sort by vibrancy/saturation
    const colorResults = centroids.map(([r, g, b]) => {
      const [h, s, l] = rgbToHsl(r, g, b);
      const hex = `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`.toUpperCase();
      return { hex, h, s, l };
    });

    // Sort by saturation (most vibrant first)
    colorResults.sort((a, b) => b.s - a.s);

    console.log('🎨 Extracted PFP colors:', colorResults.map(c => c.hex));

    return {
      primary: colorResults[0].hex,
      secondary: colorResults[1].hex,
      accent: colorResults[2].hex,
    };
  } catch (error) {
    console.error('Failed to extract PFP colors:', error);
    return null;
  }
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
  
  // COLOR PALETTE - Extract from user's PFP
  let eyeColor: string;
  let stoneColor: string;
  let accentColor: string;

  if (user.pfp_url) {
    const pfpColors = await extractPfpColors(user.pfp_url);
    
    if (pfpColors) {
      // Use extracted colors from PFP
      eyeColor = pfpColors.primary;
      stoneColor = pfpColors.secondary;
      accentColor = pfpColors.accent;
      
      console.log('🎨 Using PFP colors:', { eyeColor, stoneColor, accentColor });
    } else {
      // Fallback to deterministic generation if extraction fails
      const baseHue = seed % 360;
      const hueVariation = (seed2 % 60) - 30;
      const eyeHue = (baseHue + hueVariation + 360) % 360;
      const eyeSat = 65 + (seed % 25);
      const eyeLight = 55 + (seed2 % 20);
      eyeColor = hslToHex(eyeHue, eyeSat, eyeLight);
      
      const stoneHue = (baseHue + phase * 45 + (seed3 % 40)) % 360;
      const stoneSat = 50 + ((seed >> 2) % 30);
      const stoneLight = 45 + ((seed2 >> 2) % 25);
      stoneColor = hslToHex(stoneHue, stoneSat, stoneLight);

      const accentHue = (baseHue + 120 + (seed % 120)) % 360;
      const accentSat = 60 + (seed3 % 30);
      const accentLight = 50 + ((seed >> 3) % 25);
      accentColor = hslToHex(accentHue, accentSat, accentLight);
      
      console.log('⚠️ PFP color extraction failed, using fallback colors');
    }
  } else {
    // No PFP, use deterministic generation
    const baseHue = seed % 360;
    const hueVariation = (seed2 % 60) - 30;
    const eyeHue = (baseHue + hueVariation + 360) % 360;
    const eyeSat = 65 + (seed % 25);
    const eyeLight = 55 + (seed2 % 20);
    eyeColor = hslToHex(eyeHue, eyeSat, eyeLight);
    
    const stoneHue = (baseHue + phase * 45 + (seed3 % 40)) % 360;
    const stoneSat = 50 + ((seed >> 2) % 30);
    const stoneLight = 45 + ((seed2 >> 2) % 25);
    stoneColor = hslToHex(stoneHue, stoneSat, stoneLight);

    const accentHue = (baseHue + 120 + (seed % 120)) % 360;
    const accentSat = 60 + (seed3 % 30);
    const accentLight = 50 + ((seed >> 3) % 25);
    accentColor = hslToHex(accentHue, accentSat, accentLight);
    
    console.log('ℹ️ No PFP URL, using deterministic colors');
  }
  
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

  const basePrompt = `A digital 2D collectible NFT of a unique stone-like creature with soft round form, expressive eyes, and a subtle Base-themed glow.`;

  // Define phase-based attributes
  let phaseDescription = "";
  if (phase === 1)
    phaseDescription = "Small, compact form with soft edges and gentle proportions.";
  else if (phase === 2)
    phaseDescription = "Growing form with developing features and youthful energy.";
  else if (phase === 3)
    phaseDescription = "Mature presence with refined details and confident stance.";
  else
    phaseDescription = "Commanding ancient form with majestic proportions and legendary aura.";

  return `${basePrompt}

TIER: ${phaseName}
${phaseDescription}

COLOR PALETTE (Must be prominently visible):
   • Eye Color: ${eyeColor} with ${eyeShape}
   • Stone Body: ${stoneColor} with ${surfacePattern}
   • Accent/Glow: ${accentColor} with ${auraStyle}

DISTINCTIVE FEATURES:
   • Special Trait: ${uniqueFeature}
   • Body Variation: ${bodyShape}
   • Facial Expression: ${personality}

RENDERING INSTRUCTIONS:
1. START with the phase-appropriate base structure from reference image
2. TRANSFORM the colors to match the unique palette above - this is CRITICAL
3. APPLY the specified surface texture (${surfacePattern}) to the body
4. ADD the unique feature (${uniqueFeature}) in a visible but tasteful way
5. ADJUST body proportions subtly (${bodyShape}) while keeping phase silhouette
6. RENDER eyes with (${eyeShape}) using color ${eyeColor}
7. ADD glow/aura with (${auraStyle}) using color ${accentColor}
8. EXPRESS personality through (${personality})
9. PRESERVE background exactly as shown in base image
10. Ensure colors are vibrant and distinct - emphasize the three-color palette
11. DO NOT include any text, labels, numbers, or written information on the image
12. The character should be clean with no text overlays or annotations

CRITICAL: The three colors (${eyeColor}, ${stoneColor}, ${accentColor}) MUST dominate the design.
This character should be instantly recognizable by its unique color combination.
NO TEXT OR LABELS should appear on the final image.
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
