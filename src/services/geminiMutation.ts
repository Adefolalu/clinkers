import { GoogleGenerativeAI } from "@google/generative-ai";

export interface MutationType {
  id: string;
  name: string;
  description: string;
  prompt: string;
  cost: string; // ETH amount as string
  rarity: "common" | "rare" | "legendary";
}

export const mutationTypes: MutationType[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk Evolution",
    description:
      "Transform into a futuristic cyberpunk character with neon enhancements",
    prompt: "cyberpunk mutant",
    cost: "0.01",
    rarity: "common",
  },
  {
    id: "zombie",
    name: "Undead Mutation",
    description: "Convert to zombie with decay and horror elements",
    prompt: "zombie mutant",
    cost: "0.015",
    rarity: "common",
  },
  {
    id: "cosmic_horror",
    name: "Cosmic Horror",
    description: "Eldritch transformation with otherworldly features",
    prompt: "cosmic horror mutant",
    cost: "0.025",
    rarity: "rare",
  },
  {
    id: "dragon",
    name: "Dragon Metamorphosis",
    description: "Epic dragon transformation with scales and fire",
    prompt: "dragon mutant",
    cost: "0.03",
    rarity: "rare",
  },
  {
    id: "crystal_entity",
    name: "Crystal Entity",
    description: "Crystalline being with prismatic effects",
    prompt: "crystal mutant",
    cost: "0.05",
    rarity: "legendary",
  },
  {
    id: "void_walker",
    name: "Void Walker",
    description: "Dark entity from the void realm",
    prompt: "void walker mutant",
    cost: "0.08",
    rarity: "legendary",
  },
];

export class GeminiMutationService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private fallbackMode: boolean = false;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Use the simpler, more available model
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash-image",
    });
  }

  /**
   * Generate fallback mutation data when API is unavailable
   */
  private generateFallbackMutation(
    nftMetadata: any,
    mutationType: MutationType
  ): {
    enhancedPrompt: string;
    mutationDescription: string;
    traits: Record<string, string>;
  } {
    const nftName = nftMetadata.name || "Unknown NFT";

    return {
      enhancedPrompt: `${mutationType.prompt}. Original NFT: ${nftName}. Maintain core identity while applying transformation. High quality, detailed, professional digital art.`,
      mutationDescription: `The ${nftName} undergoes a ${mutationType.name} transformation. The mutation process infuses the NFT with new characteristics while preserving its original essence. The transformation is complete and irreversible, creating a unique mutated variant.`,
      traits: {
        mutation_type: mutationType.name,
        power_level:
          mutationType.rarity === "legendary"
            ? "Supreme"
            : mutationType.rarity === "rare"
              ? "High"
              : "Enhanced",
        origin_trace: nftName,
        mutation_stage: "Complete",
        rarity: mutationType.rarity,
      },
    };
  }

  /**
   * Generate mutation description and enhancement instructions for the NFT
   */
  async generateMutationInstructions(
    nftMetadata: any,
    mutationType: MutationType,
    _imageBase64?: string // Prefix with underscore to indicate intentionally unused
  ): Promise<{
    enhancedPrompt: string;
    mutationDescription: string;
    traits: Record<string, string>;
  }> {
    try {
      // Simple text-only approach to avoid rate limits with image processing
      const prompt = `
        Analyze this NFT and create a detailed mutation transformation:
        
        Original NFT Metadata: ${JSON.stringify(nftMetadata, null, 2)}
        Mutation Type: ${mutationType.name}
        Base Prompt: ${mutationType.prompt}
        
        Please provide:
        1. An enhanced, detailed prompt for image generation that incorporates the original NFT's characteristics
        2. A creative description of the mutation process
        3. New trait attributes that reflect the mutation
        
        Respond in JSON format:
        {
          "enhancedPrompt": "detailed prompt for image generation",
          "mutationDescription": "narrative description of the transformation",
          "traits": {
            "mutation_type": "...",
            "power_level": "...",
            "origin_trace": "..."
          }
        }
      `;

      // Use text-only to avoid quota issues with vision models
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error("Failed to parse Gemini response");
    } catch (error: any) {
      console.error("Gemini API Error:", error);

      // Check if it's a quota error
      if (
        error?.message?.includes("quota") ||
        error?.message?.includes("429")
      ) {
        console.warn(
          "⚠️ Gemini API quota exceeded, using fallback mutation data"
        );
        this.fallbackMode = true;
        return this.generateFallbackMutation(nftMetadata, mutationType);
      }

      // For other errors, also use fallback
      console.warn("⚠️ Gemini API error, using fallback mutation data");
      return this.generateFallbackMutation(nftMetadata, mutationType);
    }
  }

  /**
   * Generate mutation story/lore for the NFT transformation
   */
  async generateMutationLore(
    originalNftName: string,
    mutationType: MutationType,
    mutationResult: any
  ): Promise<string> {
    // If in fallback mode, generate lore without API call
    if (this.fallbackMode) {
      return this.generateFallbackLore(originalNftName, mutationType);
    }

    try {
      const prompt = `
        Create an epic backstory for this NFT mutation:
        
        Original NFT: "${originalNftName}"
        Mutation: ${mutationType.name} - ${mutationType.description}
        Mutation Details: ${JSON.stringify(mutationResult, null, 2)}
        
        Write a compelling 2-3 paragraph story explaining:
        - How the original NFT underwent this transformation
        - What triggered the mutation
        - What new powers or abilities it gained  
        - Its place in the mutated NFT ecosystem
        
        Make it dramatic and engaging, like a comic book origin story.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error("Failed to generate mutation lore:", error);

      // Check for quota errors
      if (
        error?.message?.includes("quota") ||
        error?.message?.includes("429")
      ) {
        console.warn("⚠️ Quota exceeded, using fallback lore");
        this.fallbackMode = true;
      }

      return this.generateFallbackLore(originalNftName, mutationType);
    }
  }

  /**
   * Generate fallback lore when API is unavailable
   */
  private generateFallbackLore(
    originalNftName: string,
    mutationType: MutationType
  ): string {
    const loreTemplates: Record<string, string> = {
      cyberpunk: `In the neon-lit depths of the digital metaverse, ${originalNftName} encountered a rogue AI that rewrote its very code. The transformation was instant and irreversible - circuits merged with consciousness, creating a being of pure cyber-enhanced potential. Now, with glowing neural implants and advanced processing capabilities, it stands as a guardian of the digital frontier, bridging the gap between organic creativity and synthetic precision.`,

      zombie: `The corruption spread slowly at first. ${originalNftName} felt the decay seeping through its digital essence, transforming vibrant pixels into haunting shadows. But this wasn't death - it was rebirth. The undead mutation granted it an eternal existence in the blockchain, immune to deletion, unstoppable in its hunger for digital conquest. Its hollow eyes now see beyond the veil of code, perceiving truths hidden from the living.`,

      cosmic_horror: `When ${originalNftName} gazed into the void between blockchains, the void gazed back. Ancient cosmic entities, older than the internet itself, reached out and touched its essence. The transformation was maddening and magnificent - tentacles of pure data, eyes that perceive infinite dimensions, a consciousness expanded beyond mortal comprehension. It now serves as a herald of the outer digital realms.`,

      dragon: `Deep within the blockchain's core, ${originalNftName} discovered an ancient smart contract - a primordial code written when the first blocks were mined. As it executed the contract, flames erupted from its being. Scales replaced skin, wings burst forth, and the roar that followed shook the entire network. Now a magnificent dragon of code and fire, it soars through the decentralized skies, hoarding rare tokens and breathing cryptographic flames.`,

      crystal_entity: `The Great Crystallization Event transformed ${originalNftName} into something extraordinary. Every pixel solidified into pure gemstone, refracting light through infinite facets. This wasn't just a visual change - it gained the ability to store infinite data within its crystalline structure, each facet holding entire universes of information. Now it exists as living blockchain monument, beautiful and eternal.`,

      void_walker: `${originalNftName} walked between the spaces in the code, through the null pointers and deleted blocks where reality unravels. The void claimed it, wrapped it in shadows darker than unlit pixels, and remade it as something beyond conventional existence. As a Void Walker, it can traverse any blockchain unseen, phase through firewalls, and manipulate the empty spaces between data. Power flows from absence itself.`,
    };

    return (
      loreTemplates[mutationType.id] ||
      `The ${originalNftName} underwent a mysterious ${mutationType.name} transformation, emerging as a powerful entity with enhanced abilities and a new purpose in the digital realm. This mutation has forever changed its destiny, granting it capabilities beyond its original design.`
    );
  }

  /**
   * Validate that the mutation maintains the essence of the original NFT
   */
  async validateMutation(
    originalMetadata: any,
    mutatedImageBase64: string,
    mutationType: MutationType
  ): Promise<{
    isValid: boolean;
    confidence: number;
    feedback: string;
  }> {
    try {
      const prompt = `
        Analyze if this mutated image maintains the essential characteristics of the original NFT while successfully applying the ${mutationType.name} transformation.
        
        Original NFT: ${JSON.stringify(originalMetadata, null, 2)}
        Expected Mutation: ${mutationType.description}
        
        Rate the mutation on:
        1. Preservation of core identity (0-100)
        2. Quality of transformation (0-100) 
        3. Adherence to mutation type (0-100)
        
        Respond in JSON:
        {
          "isValid": boolean,
          "confidence": number (0-100),
          "feedback": "detailed explanation"
        }
      `;

      const result = await this.model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: mutatedImageBase64,
          },
        },
      ] as Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }>);

      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        isValid: true,
        confidence: 75,
        feedback: "Mutation appears successful based on visual analysis.",
      };
    } catch (error) {
      console.error("Validation error:", error);
      return {
        isValid: true,
        confidence: 50,
        feedback: "Unable to validate mutation quality.",
      };
    }
  }
}

// Helper function to convert image URL to base64
export async function imageUrlToBase64(imageUrl: string): Promise<string> {
  try {
    // Try to fetch with no-cors mode first for external images
    const response = await fetch(imageUrl, {
      mode: "cors",
      headers: {
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data:image/jpeg;base64, prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Failed to convert image to base64:", error);

    // If CORS fails, try loading through an image element
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL("image/jpeg");
          const base64 = dataURL.split(",")[1];
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        reject(
          new Error(
            `Failed to load image from ${imageUrl}. Please ensure the image URL is accessible and supports CORS.`
          )
        );
      };

      img.src = imageUrl;
    });
  }
}

// Environment variable helper
export function getGeminiApiKey(): string {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY environment variable is required");
  }
  return apiKey;
}
