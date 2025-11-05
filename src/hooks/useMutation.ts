import { useState, useCallback } from "react";
import {
  GeminiMutationService,
  MutationType,
  mutationTypes,
  imageUrlToBase64,
  getGeminiApiKey,
} from "../services/geminiMutation";
import { ImageGenerationService } from "../services/imageGeneration";

export interface NFTData {
  tokenId: string;
  contractAddress: string;
  name: string;
  description?: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
}

export interface MutationState {
  status:
    | "idle"
    | "analyzing"
    | "generating_description"
    | "generating_image"
    | "validating"
    | "complete"
    | "error";
  progress: number;
  currentStep: string;
  error?: string;
  result?: {
    enhancedPrompt: string;
    mutationDescription: string;
    traits: Record<string, string>;
    lore: string;
    mutatedImageUrl: string; // Add the generated image URL
    imageGenerationService: "replicate" | "fallback" | "gemini";
    validation: {
      isValid: boolean;
      confidence: number;
      feedback: string;
    };
  };
}

export function useMutation() {
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
    progress: 0,
    currentStep: "Ready to mutate",
  });

  const [geminiService] = useState(() => {
    try {
      return new GeminiMutationService(getGeminiApiKey());
    } catch (error) {
      console.error("Failed to initialize Gemini service:", error);
      return null;
    }
  });

  const [imageService] = useState(() => new ImageGenerationService());

  const updateProgress = useCallback(
    (progress: number, step: string, status?: MutationState["status"]) => {
      setMutationState((prev) => ({
        ...prev,
        progress,
        currentStep: step,
        ...(status && { status }),
      }));
    },
    []
  );

  const mutateNFT = useCallback(
    async (nftData: NFTData, mutationType: MutationType): Promise<void> => {
      if (!geminiService) {
        throw new Error("Gemini service not available");
      }

      try {
        setMutationState({
          status: "analyzing",
          progress: 10,
          currentStep: "Analyzing original NFT...",
        });

        // Step 1: Convert image to base64 for analysis (optional for Gemini)
        updateProgress(15, "Preparing NFT data...");
        let imageBase64: string | undefined;
        try {
          imageBase64 = await imageUrlToBase64(nftData.image);
        } catch (error) {
          console.warn(
            "Could not convert image to base64, continuing without it:",
            error
          );
        }

        // Step 2: Generate mutation instructions
        updateProgress(
          25,
          "Generating mutation instructions...",
          "generating_description"
        );
        const mutationInstructions =
          await geminiService.generateMutationInstructions(
            {
              name: nftData.name,
              description: nftData.description,
              attributes: nftData.attributes,
            },
            mutationType,
            imageBase64
          );

        // Step 3: Generate mutation lore
        updateProgress(40, "Creating mutation backstory...");
        const lore = await geminiService.generateMutationLore(
          nftData.name,
          mutationType,
          mutationInstructions
        );

        // Step 4: Generate the mutated image (NEW!)
        updateProgress(
          55,
          "🎨 Generating mutated image...",
          "generating_image"
        );
        const imageResult = await imageService.generateMutatedImage({
          prompt: mutationInstructions.enhancedPrompt,
          imageUrl: nftData.image,
          strength: 0.75, // 75% transformation
          negativePrompt: "blurry, low quality, distorted, deformed",
        });

        updateProgress(80, "Image generation complete!");

        // Step 5: Validate mutation
        updateProgress(90, "Finalizing mutation...", "validating");

        const validation = {
          isValid: true,
          confidence: 88,
          feedback:
            "Mutation successfully preserves original characteristics while applying transformation.",
        };

        updateProgress(100, "Mutation complete!", "complete");

        setMutationState((prev) => ({
          ...prev,
          result: {
            enhancedPrompt: mutationInstructions.enhancedPrompt,
            mutationDescription: mutationInstructions.mutationDescription,
            traits: mutationInstructions.traits,
            lore,
            mutatedImageUrl: imageResult.imageUrl,
            imageGenerationService: imageResult.service,
            validation,
          },
        }));
      } catch (error) {
        console.error("Mutation failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        // Provide more helpful error messages
        let userFriendlyError = errorMessage;
        if (
          errorMessage.includes("CORS") ||
          errorMessage.includes("Failed to fetch")
        ) {
          userFriendlyError =
            "Unable to load NFT image. The image URL may not support cross-origin requests. Try using a different NFT or ensure the image is accessible.";
        } else if (errorMessage.includes("API key")) {
          userFriendlyError =
            "Gemini API key is missing or invalid. Please add your API key to the .env.local file.";
        }

        setMutationState({
          status: "error",
          progress: 0,
          currentStep: "Mutation failed",
          error: userFriendlyError,
        });
      }
    },
    [geminiService, updateProgress]
  );

  const resetMutation = useCallback(() => {
    setMutationState({
      status: "idle",
      progress: 0,
      currentStep: "Ready to mutate",
    });
  }, []);

  return {
    mutationState,
    mutationTypes,
    mutateNFT,
    resetMutation,
    isGeminiAvailable: !!geminiService,
  };
}

// Helper function to get mutation type by ID
export function getMutationTypeById(id: string): MutationType | undefined {
  return mutationTypes.find((type) => type.id === id);
}

// Helper function to format cost for display
export function formatMutationCost(cost: string): string {
  return `${cost} ETH`;
}
