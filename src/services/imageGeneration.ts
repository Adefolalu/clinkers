import { GoogleGenAI } from "@google/genai";

export interface ImageGenerationOptions {
  prompt: string;
  personalityTraits?: string[];
  negativePrompt?: string;
  customPrompt?: string; // Optional full custom prompt override
}

export interface ImageGenerationResult {
  imageUrl: string;
  service: "gemini";
  metadata?: any;
}

export class ImageGenerationService {
  private geminiAI: GoogleGenAI | null = null;
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || null;
    if (this.apiKey) {
      this.geminiAI = new GoogleGenAI({
        apiKey: this.apiKey,
      });
    }
  }

  /**
   * Generate personality-based Carplet image using Gemini's native image generation
   */
  async generateCarpletImage(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const { customPrompt } = options;

    // If we have Gemini API, use it for native image generation
    if (this.geminiAI) {
      try {
        console.log("🎨 Generating Carplet image...");

        const config = {
          responseModalities: ["IMAGE", "TEXT"],
        };

        const model = "gemini-2.5-flash-image";

        // Use custom prompt if provided, otherwise use default personality-based prompt
        const promptText =
          customPrompt ||
          `Create a unique digital avatar character representing a Farcaster user. This should be a personalized NFT called a "Carplet":

Character Design:
- Anime/cartoon style digital avatar
- Unique and memorable personality-driven design
- Vibrant, eye-catching colors
- Clean, modern illustration style
- Should feel like a digital identity representation

Background:
- Simple but elegant background
- Subtle patterns or gradients
- Colors that complement the character
- Not too busy to distract from the main subject

Style Requirements:
- High quality digital illustration
- Professional character design
- Suitable for NFT profile picture use
- 1:1 aspect ratio composition
- Sharp, clean lines and detailed shading
- Suitable for social media profile use

The character should feel unique, personal, and represent someone's digital identity in the Farcaster ecosystem.`;

        const contents = [
          {
            role: "user",
            parts: [
              {
                text: promptText,
              },
            ],
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
