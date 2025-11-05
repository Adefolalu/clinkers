import { useEffect, useMemo, useState } from "react";
import type { NFTData } from "../hooks/useMutation";
import { blobFromUrl, uploadImageBlob, uploadMetadata } from "../services/ipfs";
import { mintMutant } from "../services/mintService";
import { ImageGenerationService } from "../services/imageGeneration";
import { useReadContract } from "wagmi";
import { mutantWarplet } from "../constants/Abi";
import { formatEther } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";

interface MutationComponentProps {
  nftData?: NFTData;
}

export function MutationComponent({ nftData }: MutationComponentProps) {
  // Single mutation state
  type MutationStatus = "pending" | "generating" | "ready" | "error";
  type MutationResult = {
    mutatedImageUrl: string;
    imageGenerationService: "gemini";
  };

  type MintSuccessData = {
    hash: string;
    tokenId?: bigint;
    imageUri: string;
    name: string;
  };

  const [status, setStatus] = useState<MutationStatus>("pending");
  const [result, setResult] = useState<MutationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [mintSuccessData, setMintSuccessData] =
    useState<MintSuccessData | null>(null);
  const [isMinting, setIsMinting] = useState(false);

  const imageService = useMemo(() => new ImageGenerationService(), []);

  // Read the mutation fee from the contract
  const { data: mutationFee } = useReadContract({
    address: mutantWarplet.address as `0x${string}`,
    abi: mutantWarplet.abi,
    functionName: "mutationFee",
  }) as { data: bigint | undefined };

  useEffect(() => {
    if (!nftData?.image) return;

    let cancelled = false;

    async function generateMutation() {
      setStatus("generating");
      setError(null);

      try {
        const img = await imageService.generateMutatedImage({
          prompt: "cyberpunk mutant",
          imageUrl: nftData!.image,
          strength: 0.75,
          negativePrompt: "",
        });

        if (cancelled) return;

        setResult({
          mutatedImageUrl: img.imageUrl,
          imageGenerationService: img.service,
        });
        setStatus("ready");
      } catch (e: any) {
        if (cancelled) return;
        console.error("Mutation generation failed:", e);
        setError("Unable to generate mutation. Please try again later.");
        setStatus("error");
      }
    }

    generateMutation();
    return () => {
      cancelled = true;
    };
  }, [nftData?.tokenId, imageService]);

  if (!nftData) return null;

  const handleRetry = async () => {
    setStatus("generating");
    setError(null);

    try {
      const img = await imageService.generateMutatedImage({
        prompt: "cyberpunk mutant",
        imageUrl: nftData.image,
        strength: 0.75,
        negativePrompt: "",
      });

      setResult({
        mutatedImageUrl: img.imageUrl,
        imageGenerationService: img.service,
      });
      setStatus("ready");
    } catch (e: any) {
      console.error("Retry mutation failed:", e);
      setError("Unable to generate mutation. Please try again later.");
      setStatus("error");
    }
  };

  const handleRemutate = async () => {
    setStatus("generating");
    setError(null);

    // Store the current result before clearing it
    const previousResult = result;
    setResult(null);

    try {
      // Use the current mutated image if available, otherwise fall back to original
      const sourceImage = previousResult?.mutatedImageUrl || nftData.image;

      const img = await imageService.generateMutatedImage({
        prompt: "cyberpunk mutant remix",
        imageUrl: sourceImage,
        strength: 0.75,
        negativePrompt: "",
        customPrompt: `Create an ALTERNATIVE CYBERPUNK MUTATION of this character with a completely different aesthetic.
Keep the base form recognizable, but this time go in a DIFFERENT DIRECTION:
- Use a completely different color palette (e.g., if previous was neon blue/purple, try toxic green/orange, crimson red/gold, or arctic white/cyan).
- Change the mutation style: if previous had sleek tech, try organic biotech; if it had armor, try energy fields or neural networks.
- Add different cybernetic enhancements: maybe eye augmentations, spine modifications, wing-like extensions, or holographic projections.
- Experiment with different lighting: dark noir shadows, bright neon glow, or ethereal energy aura.
- Dramatically alter the background atmosphere: toxic wasteland fog, digital matrix rain, bioluminescent spores, or cyberpunk city haze.
- Make this version feel like a REMIX or ALTERNATE TIMELINE mutation - distinctly different but equally intense.
Style: highly detailed digital illustration, cinematic lighting, 8K resolution, bold creative choices, vivid unique colors.
`,
      });

      setResult({
        mutatedImageUrl: img.imageUrl,
        imageGenerationService: img.service,
      });
      setStatus("ready");
    } catch (e: any) {
      console.error("Re-mutation failed:", e);
      setError("Unable to generate new mutation. Please try again later.");
      setStatus("error");

      // Restore previous result if re-mutation failed
      if (previousResult) {
        setResult(previousResult);
        setStatus("ready");
        setError(null); // Clear error since we restored the previous result
      }
    }
  };

  const handleProceedToMint = async () => {
    try {
      if (!result || status !== "ready" || isMinting) return;

      setIsMinting(true);

      // Trigger haptic feedback on mint button press
      try {
        await sdk.haptics.impactOccurred("medium");
      } catch (e) {
        // Haptics may not be available on all devices
        console.debug("Haptic feedback not available:", e);
      }

      // 1) Prepare image blob (handles data URLs and http URLs)
      const imageBlob = await blobFromUrl(result.mutatedImageUrl);
      // 2) Upload image to IPFS
      const imageUri = await uploadImageBlob(imageBlob);
      // 3) Build metadata
      const name = `Mutated ${nftData.name}`;
      const description = `Cyberpunk mutant version of ${nftData.name}`;
      const attributes = [
        ...(nftData.attributes || []),
        {
          trait_type: "Mutation Type",
          value: "Cyberpunk",
        },
      ];
      const metadataUri = await uploadMetadata({
        name,
        description,
        image: imageUri,
        attributes,
        properties: {
          origin: {
            contract: nftData.contractAddress,
            tokenId: nftData.tokenId,
          },
        },
      });

      // 4) Mint on Base
      const originTokenId = BigInt(nftData.tokenId);
      const { hash, tokenId } = await mintMutant({
        originContract: nftData.contractAddress as `0x${string}`,
        originTokenId,
        metadataURI: metadataUri,
      });

      // Success haptic feedback
      try {
        await sdk.haptics.notificationOccurred("success");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      // Show success modal
      setMintSuccessData({
        hash,
        tokenId,
        imageUri,
        name,
      });
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error("Mint flow failed:", err);

      // Error haptic feedback
      try {
        await sdk.haptics.notificationOccurred("error");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      // Better error messages
      let errorMessage = "Mint failed";
      if (
        err?.message?.includes("User rejected") ||
        err?.message?.includes("rejected")
      ) {
        errorMessage = "Transaction cancelled";
      } else if (err?.message) {
        errorMessage = err.message;
      }

      alert(errorMessage);
    } finally {
      setIsMinting(false);
    }
  };

  const handleShare = async () => {
    if (!mintSuccessData) return;

    try {
      const miniAppUrl = "https://mwpt.vercel.app";
      const text = `I just minted my ${mintSuccessData.name}! 🔥\n\nMutate your Warplet now on Mutant Warplet`;

      await sdk.actions.composeCast({
        text,
        embeds: [mintSuccessData.imageUri, miniAppUrl] as [string, string],
      });
    } catch (error) {
      console.error("Failed to compose cast:", error);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    setMintSuccessData(null);
  };

  return (
    <div className="relative">
      {/* Elite precision card with #2596be theme and dark background */}
      <div className="relative bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] overflow-hidden border border-[#2596be]/30">
        {/* Subtle top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#2596be] to-transparent"></div>

        {/* Image container with fixed aspect ratio */}
        <div className="relative w-full" style={{ paddingBottom: "100%" }}>
          <div className="absolute inset-0 flex items-center justify-center p-8">
            {status !== "ready" || !result ? (
              <div className="w-full h-full bg-gradient-to-br from-slate-700/50 via-slate-800/50 to-[#1a5f7a]/50 rounded-2xl flex items-center justify-center border border-[#2596be]/20 backdrop-blur-sm">
                <div className="text-center px-4">
                  {status === "error" ? (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-red-500/10 rounded-full flex items-center justify-center border-2 border-red-500/30">
                        <svg
                          className="w-8 h-8 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-slate-300 mb-2">
                        Mutation Failed
                      </p>
                      <p className="text-xs text-slate-400 mb-4">{error}</p>
                      <button
                        onClick={handleRetry}
                        className="px-4 py-2 bg-[#2596be] hover:bg-[#1d7a9f] text-white text-xs font-semibold rounded-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Try Again
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="relative inline-block mb-4">
                        <div className="w-16 h-16 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
                        <div className="w-16 h-16 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <p className="text-sm font-semibold text-[#2596be] tracking-wide">
                        MUTATING...
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full group">
                <img
                  src={result.mutatedImageUrl}
                  alt="Mutated NFT"
                  className="w-full h-full object-cover rounded-2xl shadow-[0_8px_24px_rgba(37,150,190,0.2)] ring-1 ring-[#2596be]/20"
                />
                {/* Elegant hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#2596be]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 space-y-2">
          {/* Re-mutate button - only show when ready and not minting */}
          {status === "ready" && !isMinting && (
            <button
              onClick={handleRemutate}
              className="w-full py-2.5 rounded-xl font-medium text-xs tracking-wide text-[#2596be] bg-slate-700/50 hover:bg-slate-700 border border-[#2596be]/30 hover:border-[#2596be]/50 shadow-[0_2px_12px_rgba(37,150,190,0.15)] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            >
              🔄 RE-MUTATE
            </button>
          )}

          {/* Mint button with elite styling */}
          <button
            disabled={status !== "ready" || isMinting}
            onClick={handleProceedToMint}
            className={`w-full py-3 rounded-xl font-semibold text-sm tracking-wide text-white shadow-[0_4px_16px_rgba(37,150,190,0.25)] transition-all duration-300 relative overflow-hidden group ${
              status === "ready" && !isMinting
                ? "bg-[#2596be] hover:bg-[#1d7a9f] hover:shadow-[0_6px_24px_rgba(37,150,190,0.4)] hover:scale-[1.01] active:scale-[0.99]"
                : "bg-gray-300 cursor-not-allowed opacity-60"
            }`}
          >
            {/* Shimmer effect on hover */}
            {status === "ready" && !isMinting && (
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            )}

            {isMinting ? (
              <span className="flex items-center justify-center gap-2 relative z-10">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                MINTING...
              </span>
            ) : status === "ready" ? (
              <span className="flex flex-col items-center justify-center gap-1 relative z-10">
                <span className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  MINT MUTANT
                </span>
                <span className="text-[10px] font-medium opacity-90 tracking-wide">
                  {mutationFee ? formatEther(mutationFee) : "0.00037"} ETH
                </span>
              </span>
            ) : (
              <span className="uppercase tracking-wider text-xs">
                Mutating...
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && mintSuccessData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.4)] max-w-md w-full border border-[#2596be]/30 overflow-hidden">
            {/* Top accent */}
            <div className="h-[2px] bg-gradient-to-r from-transparent via-[#2596be] to-transparent"></div>

            {/* Content */}
            <div className="p-6 text-center">
              {/* Success Icon */}
              <div className="w-16 h-16 mx-auto mb-4 bg-[#2596be]/20 rounded-full flex items-center justify-center border-2 border-[#2596be]">
                <svg
                  className="w-8 h-8 text-[#2596be]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-[#2596be] mb-2">
                Mint Successful!
              </h2>

              <p className="text-sm text-slate-300 mb-4">
                {mintSuccessData.name}
              </p>

              {/* Minted Image */}
              <div className="mb-6 rounded-2xl overflow-hidden border border-[#2596be]/30 shadow-lg">
                <img
                  src={mintSuccessData.imageUri}
                  alt={mintSuccessData.name}
                  className="w-full h-auto"
                  onError={(e) => {
                    // Fallback to mutated image if IPFS image fails to load
                    if (result?.mutatedImageUrl) {
                      (e.target as HTMLImageElement).src =
                        result.mutatedImageUrl;
                    }
                  }}
                />
              </div>

              {/* Transaction info */}
              <div className="bg-slate-800/50 rounded-xl p-3 mb-4 text-xs">
                <p className="text-slate-400 mb-1">Transaction Hash:</p>
                <p className="text-[#2596be] font-mono break-all">
                  {mintSuccessData.hash.slice(0, 10)}...
                  {mintSuccessData.hash.slice(-8)}
                </p>
                {mintSuccessData.tokenId !== undefined && (
                  <>
                    <p className="text-slate-400 mt-2 mb-1">Token ID:</p>
                    <p className="text-[#2596be] font-mono">
                      #{mintSuccessData.tokenId.toString()}
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleShare}
                  className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-[#2596be] hover:bg-[#1d7a9f] shadow-[0_4px_16px_rgba(37,150,190,0.3)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                  </svg>
                  Share on Farcaster
                </button>

                <button
                  onClick={handleCloseModal}
                  className="w-full py-2.5 rounded-xl font-medium text-sm text-[#2596be] bg-slate-700/50 hover:bg-slate-700 border border-[#2596be]/30 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
