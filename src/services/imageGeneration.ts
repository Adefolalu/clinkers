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
}

export interface ImageGenerationResult {
  imageUrl: string;
  service: "gemini";
  metadata?: any;
}

type ClinkerPhase = "baby" | "youngin" | "risingStar" | "og";

export class ClinkerImageService {
  private geminiAI: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private readonly baseImageUrl: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || null;
    this.baseImageUrl = "/clinker-base.png"; // Your base Clinker image
    if (this.apiKey) {
      this.geminiAI = new GoogleGenAI({
        apiKey: this.apiKey,
      });
    }
  }

  // --- Determine Clinker phase based on metrics ---
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

  // --- Color generation helper (for glow/eye hue shifts) ---
  private phaseColors(phase: ClinkerPhase) {
    switch (phase) {
      case "baby":
        return { glow: "#C89BFF", eyes: "#E2B7FF" };
      case "youngin":
        return { glow: "#B269FF", eyes: "#D07FFF" };
      case "risingStar":
        return { glow: "#A03DFF", eyes: "#C858FF" };
      case "og":
        return { glow: "#7A00FF", eyes: "#B800FF" };
      default:
        return { glow: "#C89BFF", eyes: "#E2B7FF" };
    }
  }

  // --- Generate deterministic seed for uniqueness ---
  private computeSeed(fid?: number, salt?: number): string {
    const base = `${fid ?? "anon"}-${salt ?? 0}`;
    const hash = Array.from(base).reduce(
      (acc, ch, i) => (acc + ch.charCodeAt(0) * (i + 17)) % 1000003,
      0
    );
    return hash.toString();
  }

  // --- Core image generation ---
  async generateClinkerImage(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const { fid, username, customPrompt, neynarScore, accountAgeDays, followersCount, seedSalt } =
      options;

    if (!this.geminiAI) throw new Error("Gemini API not available");

    try {
      console.log("🪨 Generating Clinker NFT...");

      const phase = this.getClinkerPhase(neynarScore, accountAgeDays, followersCount);
      const { glow, eyes } = this.phaseColors(phase);
      const seedHash = this.computeSeed(fid, seedSalt);

      // Base Clinker image (design anchor)
      const baseImageBase64 = await this.imageToBase64(
        window.location.origin + this.baseImageUrl
      );

      // Prompt for phase evolution while keeping design identical
      const prompt = customPrompt
        ? customPrompt
        : `This is a Clinker — a rock golem NFT from the Forecaster community.

Maintain the exact same character design as the base Clinker:
- Same body shape, proportions, and overall look.
- Do not redesign or alter silhouette.
- Only evolve visual energy and aura based on phase.

Current phase: ${phase.toUpperCase()}.
Visual adjustments:
- Glow color: ${glow}
- Eyes color: ${eyes}
- Stone brightness and crack intensity increase slightly with each phase.
- Aura and floating debris increase by phase.
- Background lighting matches phase energy, soft purple-to-violet tones.
- Keep same environment, pose, and body shape.

Render high-quality collectible NFT artwork, centered composition, cinematic lighting.

UNIQUENESS SEED: ${seedHash}
`;

      const parts: any[] = [{ text: prompt }];
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: baseImageBase64,
        },
      });

      const response = await this.geminiAI.models.generateContentStream({
        model: "gemini-2.5-flash-image",
        responseModalities: ["IMAGE", "TEXT"],
        contents: [{ role: "user", parts }],
      });

      for await (const chunk of response) {
        const inlineData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data && inlineData?.mimeType) {
          const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;
          console.log("✅ Clinker generated!");
          return {
            imageUrl: dataUrl,
            service: "gemini",
            metadata: { phase, glow, eyes, seedHash },
          };
        }
      }

      throw new Error("No image data returned from Gemini");
    } catch (error) {
      console.error("❌ Clinker generation failed:", error);
      throw error;
    }
  }

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

  isGeminiAvailable(): boolean {
    return !!this.geminiAI;
  }
}
