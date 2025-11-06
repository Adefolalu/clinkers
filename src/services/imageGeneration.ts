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

        // Get base Carplet image as base64
        const baseImageBase64 = await this.imageToBase64(
          window.location.origin + this.baseImageUrl
        );

        // Compute a deterministic seed from fid (or fall back to time) to increase diversity
        const seedBase = `${typeof fid === "number" ? String(fid) : "anon"}-${seedSalt ?? 0}`;
        const seedHash = Array.from(seedBase)
          .reduce(
            (acc, ch, i) => (acc + ch.charCodeAt(0) * (i + 17)) % 1000003,
            0
          )
          .toString();

        // Map variation strength to textual guidance
        const strength = variationStrength || (pfpUrl ? "balanced" : "bold");
        const strengthGuidance =
          strength === "subtle"
            ? "Apply small, tasteful changes. Keep base silhouette and palette mostly intact."
            : strength === "balanced"
              ? "Apply clear, noticeable personalization. You may adjust proportions, pose, and palette moderately while keeping Carplet identity recognizable."
              : "Apply bold personalization. You may significantly adjust proportions, pose, and color palette while preserving key brand anchors (leaf sprout, circular Celo motif, glossy rounded aesthetic).";

        // Create variation prompt based on personality or use custom prompt (we always wrap custom with our remix brief)
        let promptText = customPrompt;

        if (!customPrompt) {
          if (pfpUrl) {
            // If we have a PFP, create a personalized variation
            promptText = `Remix the provided base Carplet image into a personalized, UNIQUE NFT for ${username ? username : "this user"}.

REMIX BRIEF (Do NOT ignore):
- Identity anchors to PRESERVE: leaf sprout on head, circular Celo-inspired motif, glossy rounded aesthetic, friendly/contemporary NFT presentation.
- Variation strength: ${strength.toUpperCase()} — ${strengthGuidance}
- The artwork MUST be a fresh rendition, not an identical copy.
- You MAY change pose, proportions, and color palette to reflect personality.
- Use the profile picture to transfer vibe/expression and 2–4 accessories that fit (glasses, hat, chain, tech gadget, etc.).
- Integrate subtle motifs from web3/crypto the user resonates with.
- Background: keep premium NFT look (clean gradient or tasteful abstract), cohesive with the character. Not busy.

CONSISTENCY RULES:
- Maintain the Carplet brand essence (cute creature, eco-energy feel, minimal techno-markings).
- Keep composition centered and collectible-ready with high-quality lighting and soft shadows.

UNIQUENESS SEED: ${seedHash}
`;
          } else {
            // If no PFP, create a personality-driven variation (bolder by default)
            promptText = `Remix the provided base Carplet image into a UNIQUE NFT variant.

REMIX BRIEF:
- Variation strength: ${strength.toUpperCase()} — ${strengthGuidance}
- You MAY change pose, proportions, and color palette. Preserve anchors: leaf sprout, circular Celo motif, glossy rounded aesthetic.
- Add 2–3 tasteful personality cues (expression, accessory, subtle patterning).
- Background: premium NFT look (clean gradient or tasteful abstract), cohesive with the character.

UNIQUENESS SEED: ${seedHash}`;
          }
        }

        // If a high-level personality prompt was provided by upstream (customPrompt), prepend our remix brief to it
        if (customPrompt) {
          promptText = `${promptText}\n\nPERSONALITY NOTES:\n${customPrompt}`;
        }

        // Prepare content parts - include base image and optional PFP
        const parts: any[] = [
          { text: promptText },
          {
            inlineData: {
              mimeType: "image/png",
              data: baseImageBase64,
            },
          },
        ];

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
