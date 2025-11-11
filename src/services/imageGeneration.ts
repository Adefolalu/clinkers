import { GoogleGenAI } from "@google/genai";

export interface ImageGenerationOptions {
  prompt?: string;
  neynarScore?: number;
  accountAgeDays?: number;
  followersCount?: number;
  customPrompt?: string;
  fid?: number;
  username?: string;
  seedSalt?: number;
  pfpUrl?: string; // User's profile picture URL to use as reference
  variationStrength?: "subtle" | "balanced" | "bold"; // How far to drift from base
}

export interface ImageGenerationResult {
  imageUrl: string;
  service: "gemini";
  metadata?: any;
}

type ClinkerPhase = "baby" | "youngin" | "risingStar" | "og";

export class ImageGenerationService {
  private geminiAI: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private readonly baseImageUrl: string;
  private readonly secondaryBaseImageUrl: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || null;
    this.baseImageUrl = "/original.webp";
    this.secondaryBaseImageUrl = "/Base2.webp";
    if (this.apiKey) {
      this.geminiAI = new GoogleGenAI({
        apiKey: this.apiKey,
      });
    }
  }

  // ---------- Determine Clinker Phase ----------
  private getClinkerPhase(
    neynarScore?: number,
    accountAgeDays?: number,
    followersCount?: number
  ): ClinkerPhase {
    const score = (neynarScore ?? 0) + (accountAgeDays ?? 0) * 0.5 + (followersCount ?? 0) * 0.1;
    if (score < 50) return "baby";
    if (score < 200) return "youngin";
    if (score < 600) return "risingStar";
    return "og";
  }

  // ---------- Phase Color Mapping ----------
  private phaseColors(phase: ClinkerPhase) {
    switch (phase) {
      case "baby":
        return { glow: "#C8A2FF", eyes: "#E2C2FF", stone: "#EDE6FF" };
      case "youngin":
        return { glow: "#A875FF", eyes: "#D19BFF", stone: "#D6C2FF" };
      case "risingStar":
        return { glow: "#8A47FF", eyes: "#C174FF", stone: "#BFA6FF" };
      case "og":
        return { glow: "#6B00FF", eyes: "#AA2EFF", stone: "#A689FF" };
      default:
        return { glow: "#C8A2FF", eyes: "#E2C2FF", stone: "#EDE6FF" };
    }
  }

  // ---------- Seed Computation ----------
  private computeSeed(fid?: number, salt?: number): string {
    const base = `${fid ?? "anon"}-${salt ?? 0}`;
    const hash = Array.from(base).reduce(
      (acc, ch, i) => (acc + ch.charCodeAt(0) * (i + 17)) % 1000003,
      0
    );
    return hash.toString();
  }

  // ---------- Convert Image to Base64 ----------
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

  // ---------- Core Clinker Generator ----------
  async generateClinkerImage(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const { customPrompt, fid, neynarScore, accountAgeDays, followersCount, seedSalt, pfpUrl } =
      options;

    if (!this.geminiAI) throw new Error("Gemini API not available");

    try {
      console.log("🪨 Generating Clinker evolution...");

      // Determine phase and traits
      const phase = this.getClinkerPhase(neynarScore, accountAgeDays, followersCount);
      const { glow, eyes, stone } = this.phaseColors(phase);
      const seedHash = this.computeSeed(fid, seedSalt);

      // Base image fallback logic
      let baseImageBase64: string | null = null;
      try {
        baseImageBase64 = await this.imageToBase64(
          window.location.origin + this.baseImageUrl
        );
      } catch {
        baseImageBase64 = await this.imageToBase64(
          window.location.origin + this.secondaryBaseImageUrl
        );
      }

      // ---------- Prompt (preserves design, evolves phase) ----------
      const prompt = customPrompt
        ? customPrompt
        : `This is a Clinker — a rock-like being and collectible from the Forecaster community.
Keep the exact same design, proportions, and shape from the base image. 
Do not alter silhouette, facial structure, or core materials.

Phase: ${phase.toUpperCase()}  
Visual evolution guidelines:
- Glow color: ${glow}
- Eyes color: ${eyes}
- Stone tint: ${stone}
- Aura brightness and particle count gradually increase with phase.
- Slight size growth: baby (smallest) → OG (largest, majestic aura).
- Background lighting reflects energy level, from soft pastel to radiant violet.

STRICT RULES:
- DO NOT redesign or replace the Clinker.
- Maintain all features and pose identical to the base.
- Only evolve aura, color intensity, brightness, and size.
- Maintain collectible NFT polish, centered framing, high detail and cinematic lighting.

UNIQUENESS SEED: ${seedHash}
`;

      const parts: any[] = [{ text: prompt }];
      parts.push({
        inlineData: {
          mimeType: "image/webp",
          data: baseImageBase64,
        },
      });

      // Add user's PFP if provided (for visual reference)
      if (pfpUrl) {
        try {
          const pfpResponse = await fetch(pfpUrl);
          if (pfpResponse.ok) {
            const imageArrayBuffer = await pfpResponse.arrayBuffer();
            const imageData = new Uint8Array(imageArrayBuffer);
            const base64Image = btoa(String.fromCharCode(...imageData));
            parts.push({
              inlineData: {
                mimeType: pfpResponse.headers.get("content-type") || "image/jpeg",
                data: base64Image,
              },
            });
          }
        } catch (error) {
          console.warn("Failed to fetch profile picture:", error);
        }
      }

      const response = await this.geminiAI.models.generateContentStream({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts }],
      });

      for await (const chunk of response) {
        const inlineData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data && inlineData?.mimeType) {
          const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;
          console.log("✅ Clinker generation successful!");
          return {
            imageUrl: dataUrl,
            service: "gemini",
            metadata: {
              phase,
              colors: { glow, eyes, stone },
              seedHash,
              model: "gemini-2.5-flash-image",
            },
          };
        }
      }

      throw new Error("No image data in Gemini response");
    } catch (error) {
      console.error("❌ Clinker generation failed:", error);
      throw error;
    }
  }

  // ---------- Availability Check ----------
  isGeminiAvailable(): boolean {
    return !!this.geminiAI;
  }
}
