import { GoogleGenAI } from "@google/genai";

export interface ImageGenerationOptions {
  prompt: string;
  personalityTraits?: string[];
  negativePrompt?: string;
  customPrompt?: string; // Optional full custom prompt override
  pfpUrl?: string; // User's profile picture URL to use as reference
  username?: string; // User's username for context
  fid?: number; // User's FID for deterministic uniqueness
  variationStrength?: "subtle" | "balanced" | "bold"; // How far to drift from base
  seedSalt?: number; // Optional salt to produce alternative variants for same fid
}

export interface ImageGenerationResult {
  imageUrl: string;
  service: "gemini";
  metadata?: any;
}

export class ImageGenerationService {
  private geminiAI: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private readonly baseImageUrl: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || null;
    this.baseImageUrl = "/carplet-base.png"; // Base Carplet image in public folder
    if (this.apiKey) {
      this.geminiAI = new GoogleGenAI({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Deterministically derive a style signature (palette, background, silhouette, accessories)
   * from a user's fid (and optionally username). This yields strong uniqueness across users.
   */
  private deriveStyleSignature(fid?: number, username?: string) {
    const basis = `${fid ?? "anon"}-${username ?? "user"}`;
    const h = (str: string) =>
      Array.from(str).reduce((acc, ch, i) => (acc * 33 + ch.charCodeAt(0) + i) >>> 0, 5381);

    const hash = h(basis);

    const silhouettes = [
      "chonk (short and wide, ultra-cute)",
      "tall slim (elegant)",
      "mini chibi (super-deformed)",
      "dynamic action pose",
      "techno-cyber variant",
      "elemental variant (glow/energy)",
      "mech-armor variant",
    ];

    const palettes = [
      { name: "Celo Glow", colors: ["#35D07F", "#0B3D2E", "#C1FFD7"] },
      { name: "Sunset Pop", colors: ["#FF6B6B", "#FFD93D", "#6BCB77"] },
      { name: "Neon Night", colors: ["#00F5D4", "#9B5DE5", "#F15BB5"] },
      { name: "Ocean Calm", colors: ["#1A5F7A", "#56CFE1", "#CAF0F8"] },
      { name: "Citrus Splash", colors: ["#F7B801", "#F35B04", "#06D6A0"] },
      { name: "Royal Candy", colors: ["#6A4C93", "#F72585", "#4CC9F0"] },
      { name: "Forest Dream", colors: ["#0B3D2E", "#35D07F", "#9EF01A"] },
    ];

    const backgrounds = [
      "premium gradient with soft volumetric lighting",
      "abstract geometric shapes with depth-of-field",
      "neon grid with vaporwave haze",
      "celestial starscape with subtle bokeh",
      "nature mist with soft godrays",
      "liquid glass waves with reflections",
      "studio softbox lighting on color field",
    ];

    const patterns = [
      "subtle circuit traces",
      "tiny stars and sparkles",
      "wave ripples",
      "micro chevrons",
      "diamond gloss facets",
      "grain gradient film",
      "hex micro-tiling",
    ];

    const accessoryPool = [
      "sleek visor",
      "round glasses",
      "headphones",
      "chain pendant with Celo ring",
      "tiny leaf cape",
      "holo wristband",
      "mini game controller",
      "beret and brush",
      "coffee mug",
      "sci-fi shoulder pad",
      "floating drone buddy",
      "soft scarf",
      "crown pin",
      "backpack",
    ];

    const pick = (arr: any[], idx: number) => arr[idx % arr.length];
    const pickN = (arr: string[], count: number, seed: number) => {
      const res: string[] = [];
      let s = seed;
      for (let i = 0; i < count; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const choice = arr[s % arr.length];
        if (!res.includes(choice)) res.push(choice);
      }
      return res;
    };

    const silhouette = pick(silhouettes, hash >>> 3);
    const palette = pick(palettes, hash >>> 5);
    const background = pick(backgrounds, hash >>> 7);
    const pattern = pick(patterns, hash >>> 9);
    const accessories = pickN(accessoryPool, 3 + (hash % 2), hash >>> 11);

    return {
      silhouette,
      palette,
      background,
      pattern,
      accessories,
    };
  }

  /**
   * Convert image URL to base64 for API usage
   */
  private async imageToBase64(imageUrl: string): Promise<string> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error converting image to base64:", error);
      throw error;
    }
  }

  /**
   * Generate personality-based Carplet image using Gemini's native image generation
   */
  async generateCarpletImage(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const { customPrompt, pfpUrl, username, fid, variationStrength, seedSalt } =
      options;

    // If we have Gemini API, use it for native image generation
    if (this.geminiAI) {
      try {
        console.log("🎨 Generating personalized Carplet image...");

        const config = {
          responseModalities: ["IMAGE", "TEXT"],
        };

        const model = "gemini-2.5-flash-image";

        // Preload base Carplet image as base64 (used for subtle/balanced only)
        let baseImageBase64: string | null = null;
        const strength = variationStrength || (pfpUrl ? "balanced" : "bold");
        if (strength !== "bold") {
          baseImageBase64 = await this.imageToBase64(
            window.location.origin + this.baseImageUrl
          );
        }

        // Compute a deterministic seed from fid (or fall back to time) to increase diversity
        const seedBase = `${typeof fid === "number" ? String(fid) : "anon"}-${seedSalt ?? 0}`;
        const seedHash = Array.from(seedBase)
          .reduce(
            (acc, ch, i) => (acc + ch.charCodeAt(0) * (i + 17)) % 1000003,
            0
          )
          .toString();

        // Map variation strength to textual guidance
        const strengthGuidance =
          strength === "subtle"
            ? "Apply small, tasteful changes. Keep base silhouette and palette mostly intact."
            : strength === "balanced"
              ? "Apply clear, noticeable personalization. You may adjust proportions, pose, and palette moderately while keeping Carplet identity recognizable."
              : "Apply BOLD personalization. You may significantly reshape body structure (silhouette), change pose and radically alter color palette and background while preserving minimal brand essence (friendly character energy, collectible polish).";

        // Derive a deterministic style signature for uniqueness
        const style = this.deriveStyleSignature(fid, username);
        const paletteText = `${style.palette.colors.join(", ")}`;
        const accessoriesText = style.accessories.join(", ");

        // Create variation prompt based on personality or use custom prompt (we always wrap custom with our remix brief)
        let promptText = customPrompt;

        if (!customPrompt) {
          // Strong uniqueness brief with deterministic style signature
          const baseLine = pfpUrl
            ? `Generate a UNIQUE Carplet NFT portrait for ${username ?? "the user"}, inspired by their profile picture (use only for vibe/expression transfer).`
            : `Generate a UNIQUE Carplet NFT portrait.`;

          promptText = `${baseLine}

STYLE SIGNATURE (deterministic – do not ignore):
- Silhouette/structure: ${style.silhouette}
- Color palette (primary → accent): ${paletteText}
- Background: ${style.background}
- Surface pattern: ${style.pattern}
- Accessories (2–4 max from): ${accessoriesText}

VARIATION: ${strength.toUpperCase()} — ${strengthGuidance}

REQUIREMENTS:
- The artwork MUST be a fresh, original rendition (not a copy of any base). You MAY radically alter proportions, pose, and composition.
- Preserve only minimal brand essence: cute collectible creature energy, premium glossy finish, soft global illumination.
- Composition centered, NFT card-ready, high-quality lighting and soft shadows. No text or UI.

UNIQUENESS SEED: ${seedHash}`;
        }

        // If a high-level personality prompt was provided by upstream (customPrompt), prepend our remix brief to it
        if (customPrompt) {
          promptText = `${promptText}\n\nPERSONALITY NOTES (use to tune expression, attitude and motifs):\n${customPrompt}`;
        }

        // Prepare content parts - include base image and optional PFP
        const parts: any[] = [{ text: promptText }];

        // In subtle/balanced modes, include the base to keep brand cohesion; in bold, omit base for stronger uniqueness
        if (baseImageBase64) {
          parts.push({
            inlineData: {
              mimeType: "image/png",
              data: baseImageBase64,
            },
          });
        }

        if (pfpUrl) {
          try {
            // Fetch the profile picture
            const pfpResponse = await fetch(pfpUrl);
            if (pfpResponse.ok) {
              const imageArrayBuffer = await pfpResponse.arrayBuffer();
              const imageData = new Uint8Array(imageArrayBuffer);
              const base64Image = btoa(String.fromCharCode(...imageData));

              // Add the image to the request
              parts.push({
                inlineData: {
                  mimeType:
                    pfpResponse.headers.get("content-type") || "image/jpeg",
                  data: base64Image,
                },
              });
            }
          } catch (error) {
            console.warn("Failed to fetch profile picture:", error);
            // Continue without the image if fetch fails
          }
        }

        const contents = [
          {
            role: "user",
            parts,
          },
        ];

        const response = await this.geminiAI.models.generateContentStream({
          model,
          config,
          contents,
        });

        // Collect the generated image from the stream
        for await (const chunk of response) {
          if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
            continue;
          }

          const inlineData = chunk.candidates[0].content.parts[0].inlineData;
          if (inlineData?.data && inlineData?.mimeType) {
            // Convert base64 to data URL
            const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;

            console.log("✅ Carplet generation successful!");
            return {
              imageUrl: dataUrl,
              service: "gemini",
              metadata: {
                model: "gemini-2.5-flash-image",
                mimeType: inlineData.mimeType,
                styleSignature: {
                  silhouette: style.silhouette,
                  palette: style.palette,
                  background: style.background,
                  pattern: style.pattern,
                  accessories: style.accessories,
                },
              },
            };
          }
        }

        throw new Error("No image data in Gemini response");
      } catch (error) {
        console.error("❌ Carplet generation failed:", error);
        throw error;
      }
    }

    throw new Error("Gemini API not available");
  }

  /**
   * Check if Gemini image generation is available
   */
  isGeminiAvailable(): boolean {
    return !!this.geminiAI;
  }
}
