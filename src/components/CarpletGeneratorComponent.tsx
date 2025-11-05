import { useEffect, useMemo, useState } from "react";
import {
  fetchUserByFid,
  verifyFidOwnership,
  generateCarpletPrompt,
  type NeynarUser,
} from "../services/neynarService";
import { blobFromUrl, uploadImageBlob, uploadMetadata } from "../services/ipfs";
import { mintCarplet } from "../services/mintService";
import { ImageGenerationService } from "../services/imageGeneration";
import { useReadContract, useAccount } from "wagmi";
import { carplets } from "../constants/Abi";
import { formatEther } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";
import { useFarcasterContext } from "../hooks/useFarcasterContext";

export function CarpletGeneratorComponent() {
  const { address, isConnected } = useAccount();
  const farcasterContext = useFarcasterContext();
  // Generation states
  type GenerationStatus =
    | "idle"
    | "verifying"
    | "generating"
    | "ready"
    | "minting"
    | "success"
    | "error";

  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [userFid, setUserFid] = useState<number | null>(null);
  const [neynarUser, setNeynarUser] = useState<NeynarUser | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null
  );
  const [mintSuccessData, setMintSuccessData] = useState<{
    hash: string;
    fid: bigint;
    imageUri: string;
  } | null>(null);

  const imageService = useMemo(() => new ImageGenerationService(), []);

  // Read contract data
  const { data: mintFee } = useReadContract({
    address: carplets.address as `0x${string}`,
    abi: carplets.abi,
    functionName: "mintFee",
  }) as { data: bigint | undefined };

  const { data: isFidMinted } = useReadContract({
    address: carplets.address as `0x${string}`,
    abi: carplets.abi,
    functionName: "isFidMinted",
    args: userFid ? [BigInt(userFid)] : undefined,
  }) as { data: boolean | undefined };

  const { data: totalSupply } = useReadContract({
    address: carplets.address as `0x${string}`,
    abi: carplets.abi,
    functionName: "totalSupply",
  }) as { data: bigint | undefined };

  // Initialize with Farcaster context FID
  useEffect(() => {
    if (farcasterContext.fid && !userFid) {
      setUserFid(farcasterContext.fid);
    }
  }, [farcasterContext.fid, userFid]);

  const handleGenerateCarplet = async () => {
    if (!isConnected || !address || !userFid) {
      setError("Please connect your wallet and ensure FID is available");
      return;
    }

    try {
      setStatus("verifying");
      setError(null);

      // Check if FID is already minted
      if (isFidMinted) {
        setError(`Carplet for FID ${userFid} has already been minted!`);
        setStatus("error");
        return;
      }

      // Fetch user data from Neynar
      const user = await fetchUserByFid(userFid);
      if (!user) {
        setError(`Could not fetch data for FID ${userFid}. Please try again.`);
        setStatus("error");
        return;
      }

      // Verify ownership
      const isOwner = await verifyFidOwnership(userFid, address);
      if (!isOwner) {
        setError(
          `You don't own FID ${userFid}. Please connect the correct wallet.`
        );
        setStatus("error");
        return;
      }

      setNeynarUser(user);
      setStatus("generating");

      // Generate Carplet prompt based on user personality
      const personalityPrompt = generateCarpletPrompt(user);

      // Generate image
      const result = await imageService.generateCarpletImage({
        prompt: personalityPrompt,
        customPrompt: personalityPrompt,
      });

      setGeneratedImageUrl(result.imageUrl);
      setStatus("ready");
    } catch (err: any) {
      console.error("Carplet generation failed:", err);
      setError(err.message || "Failed to generate Carplet. Please try again.");
      setStatus("error");
    }
  };

  const handleMintCarplet = async () => {
    if (!neynarUser || !generatedImageUrl || !userFid || !address) return;

    try {
      setStatus("minting");

      // Trigger haptic feedback
      try {
        await sdk.haptics.impactOccurred("medium");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      // Upload image to IPFS
      const imageBlob = await blobFromUrl(generatedImageUrl);
      const imageUri = await uploadImageBlob(
        imageBlob,
        `carplet-${userFid}.png`
      );

      // Create metadata
      const metadata = {
        name: `Carplet #${userFid}`,
        description: `Personalized Farcaster NFT for ${neynarUser.display_name || neynarUser.username} (FID: ${userFid})`,
        image: imageUri,
        attributes: [
          { trait_type: "FID", value: userFid.toString() },
          { trait_type: "Username", value: neynarUser.username },
          {
            trait_type: "Display Name",
            value: neynarUser.display_name || neynarUser.username,
          },
          {
            trait_type: "Followers",
            value: neynarUser.follower_count.toString(),
          },
          {
            trait_type: "Following",
            value: neynarUser.following_count.toString(),
          },
        ],
        properties: {
          fid: userFid,
          username: neynarUser.username,
          generated_at: new Date().toISOString(),
        },
      };

      const metadataUri = await uploadMetadata(metadata);

      // Mint Carplet
      const result = await mintCarplet({
        fid: BigInt(userFid),
        metadataURI: metadataUri,
        feeEth: "0", // Free mint for now
      });

      // Success haptic
      try {
        await sdk.haptics.notificationOccurred("success");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      setMintSuccessData({
        hash: result.hash,
        fid: result.fid,
        imageUri,
      });
      setStatus("success");
    } catch (err: any) {
      console.error("Minting failed:", err);

      // Error haptic
      try {
        await sdk.haptics.notificationOccurred("error");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      let errorMessage = "Minting failed";
      if (err?.message?.includes("rejected")) {
        errorMessage = "Transaction cancelled";
      } else if (err?.message?.includes("FidAlreadyMinted")) {
        errorMessage = "This FID has already been minted";
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setStatus("error");
    }
  };

  const handleShare = async () => {
    if (!mintSuccessData || !neynarUser) return;

    try {
      const text = `Just minted my Carplet #${mintSuccessData.fid}! 🎨\\n\\nGet your personalized Farcaster NFT on Celo`;
      const miniAppUrl = "https://carplets.vercel.app";

      await sdk.actions.composeCast({
        text,
        embeds: [mintSuccessData.imageUri, miniAppUrl] as [string, string],
      });
    } catch (error) {
      console.error("Failed to compose cast:", error);
    }
  };

  const handleRetry = () => {
    setStatus("idle");
    setError(null);
    setGeneratedImageUrl(null);
    setNeynarUser(null);
  };

  if (!isConnected) {
    return (
      <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-8 border border-[#2596be]/30">
        <div className="text-center">
          <h3 className="text-xl font-bold text-[#2596be] mb-2">
            Connect Wallet
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            Connect your wallet to generate your personalized Carplet
          </p>
          <w3m-button />
        </div>
      </div>
    );
  }

  if (!userFid) {
    return (
      <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-8 border border-[#2596be]/30">
        <div className="text-center">
          <h3 className="text-xl font-bold text-[#2596be] mb-2">
            FID Required
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            We need your Farcaster ID to generate your Carplet
          </p>
          <input
            type="number"
            placeholder="Enter your FID"
            value={userFid || ""}
            onChange={(e) => setUserFid(parseInt(e.target.value) || null)}
            className="w-full px-4 py-3 bg-slate-700/50 border border-[#2596be]/30 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-[#2596be] mb-4"
          />
          <button
            onClick={handleGenerateCarplet}
            disabled={!userFid}
            className="w-full py-3 bg-[#2596be] hover:bg-[#1d7a9f] disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (isFidMinted) {
    return (
      <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-8 border border-[#2596be]/30">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-yellow-500/20 rounded-full flex items-center justify-center border-2 border-yellow-500/50">
            <svg
              className="w-8 h-8 text-yellow-400"
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
          <h3 className="text-xl font-bold text-[#2596be] mb-2">
            Already Minted
          </h3>
          <p className="text-sm text-slate-400">
            Carplet for FID {userFid} has already been minted. Each FID can only
            mint one Carplet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] overflow-hidden border border-[#2596be]/30">
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#2596be] to-transparent"></div>

      {/* Header */}
      <div className="p-6 text-center border-b border-[#2596be]/20">
        <h2 className="text-2xl font-bold text-[#2596be] mb-2">
          Generate Your Carplet
        </h2>
        <p className="text-sm text-slate-400">
          {totalSupply !== undefined && `${totalSupply}/10,000 minted • `}
          Personalized Farcaster NFT • FID: {userFid}
        </p>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Image Container */}
        <div className="relative w-full aspect-square">
          {generatedImageUrl ? (
            <div className="relative group">
              <img
                src={generatedImageUrl}
                alt="Generated Carplet"
                className="w-full h-full object-cover rounded-2xl shadow-lg ring-1 ring-[#2596be]/20"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#2596be]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-700/50 via-slate-800/50 to-[#1a5f7a]/50 rounded-2xl flex items-center justify-center border border-[#2596be]/20">
              <div className="text-center px-4">
                {status === "verifying" && (
                  <>
                    <div className="relative inline-block mb-4">
                      <div className="w-16 h-16 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
                      <div className="w-16 h-16 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-sm font-semibold text-[#2596be]">
                      Verifying FID ownership...
                    </p>
                  </>
                )}
                {status === "generating" && (
                  <>
                    <div className="relative inline-block mb-4">
                      <div className="w-16 h-16 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
                      <div className="w-16 h-16 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-sm font-semibold text-[#2596be]">
                      Generating your Carplet...
                    </p>
                  </>
                )}
                {status === "error" && (
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
                    <p className="text-sm font-semibold text-red-300 mb-2">
                      Generation Failed
                    </p>
                    <p className="text-xs text-red-400 mb-4">{error}</p>
                    <button
                      onClick={handleRetry}
                      className="px-4 py-2 bg-[#2596be] hover:bg-[#1d7a9f] text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Try Again
                    </button>
                  </>
                )}
                {status === "idle" && (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 bg-[#2596be]/20 rounded-full flex items-center justify-center border-2 border-[#2596be]/50">
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#2596be] mb-2">
                      Ready to Generate
                    </p>
                    <p className="text-xs text-slate-400">
                      Click below to create your personalized Carplet
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Info */}
        {neynarUser && (
          <div className="bg-slate-800/50 rounded-xl p-4 border border-[#2596be]/20">
            <div className="flex items-center gap-3 mb-3">
              {neynarUser.pfp_url && (
                <img
                  src={neynarUser.pfp_url}
                  alt="Profile"
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <h4 className="font-semibold text-white">
                  {neynarUser.display_name || neynarUser.username}
                </h4>
                <p className="text-sm text-slate-400">
                  @{neynarUser.username} • FID {neynarUser.fid}
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-400 grid grid-cols-2 gap-4">
              <div>Followers: {neynarUser.follower_count}</div>
              <div>Following: {neynarUser.following_count}</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {status === "idle" && (
            <button
              onClick={handleGenerateCarplet}
              className="w-full py-3 bg-[#2596be] hover:bg-[#1d7a9f] text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              Generate My Carplet
            </button>
          )}

          {status === "ready" && (
            <>
              <button
                onClick={handleGenerateCarplet}
                className="w-full py-2.5 text-[#2596be] bg-slate-700/50 hover:bg-slate-700 border border-[#2596be]/30 font-medium rounded-xl transition-colors"
              >
                🔄 Regenerate
              </button>
              <button
                onClick={handleMintCarplet}
                className="w-full py-3 bg-[#2596be] hover:bg-[#1d7a9f] text-white font-semibold rounded-xl transition-colors shadow-lg"
              >
                Mint Carplet{" "}
                {mintFee ? `• ${formatEther(mintFee)} CELO` : "• FREE"}
              </button>
            </>
          )}

          {status === "minting" && (
            <button
              disabled
              className="w-full py-3 bg-gray-600 text-white font-semibold rounded-xl opacity-60 cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Minting...
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {status === "success" && mintSuccessData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 rounded-3xl shadow-xl max-w-md w-full border border-[#2596be]/30 overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-transparent via-[#2596be] to-transparent"></div>
            <div className="p-6 text-center">
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
                Carplet Minted!
              </h2>
              <p className="text-sm text-slate-300 mb-4">
                Carplet #{mintSuccessData.fid.toString()}
              </p>

              <div className="mb-6 rounded-2xl overflow-hidden border border-[#2596be]/30 shadow-lg">
                <img
                  src={mintSuccessData.imageUri}
                  alt="Minted Carplet"
                  className="w-full h-auto"
                />
              </div>

              <div className="bg-slate-800/50 rounded-xl p-3 mb-4 text-xs">
                <p className="text-slate-400 mb-1">Transaction Hash:</p>
                <p className="text-[#2596be] font-mono break-all">
                  {mintSuccessData.hash.slice(0, 10)}...
                  {mintSuccessData.hash.slice(-8)}
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleShare}
                  className="w-full py-3 bg-[#2596be] hover:bg-[#1d7a9f] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
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
                  onClick={() => setStatus("idle")}
                  className="w-full py-2.5 text-[#2596be] bg-slate-700/50 hover:bg-slate-700 border border-[#2596be]/30 font-medium rounded-xl transition-colors"
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
