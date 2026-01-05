import { useEffect, useMemo, useState } from "react";
import {
  fetchUserByFid,
  verifyFidOwnership,
  generateClinkerPrompt,
  determineClinkerPhase,
  type NeynarUser,
} from "../services/neynarService";
import { blobFromUrl, uploadImageBlob, uploadMetadata } from "../services/ipfs";
import { mintClinker } from "../services/mintService";
import { ImageGenerationService } from "../services/imageGeneration";
import { useReadContract, useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";
import { clinkers } from "../constants/Abi";
import { sdk } from "@farcaster/miniapp-sdk";
import { useFarcasterContext } from "../hooks/useFarcasterContext";

export function ClinkerGeneratorComponent() {
  const { address, isConnected } = useAccount();
  const farcasterContext = useFarcasterContext();
  const MINI_APP_URL = "https://clinkers.vercel.app";

  // Development mode - auto-set test FID for local testing
  const isDevelopment = import.meta.env.MODE === "development";
  const TEST_FID = 239396; // ayojoseph's FID for testing

  // Generation states
  type GenerationStatus =
    | "idle"
    | "verifying"
    | "generating"
    | "preparing"
    | "ready"
    | "minting"
    | "success"
    | "error";

  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [, setError] = useState<string | null>(null);
  const [userFid, setUserFid] = useState<number | null>(
    isDevelopment ? TEST_FID : null
  );
  const [regenCounter, setRegenCounter] = useState<number>(0);
  const [userPhase, setUserPhase] = useState<number>(1); // Store determined phase
  const [neynarUser, setNeynarUser] = useState<NeynarUser | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(
    null
  );
  const [mintSuccessData, setMintSuccessData] = useState<{
    hash: string;
    fid: bigint;
    imageUri: string;
  } | null>(null);
  const [walletOwnsFid, setWalletOwnsFid] = useState<boolean | null>(null);
  const [mintedImageUrl, setMintedImageUrl] = useState<string | null>(null);
  const [mintedMetadataUri, setMintedMetadataUri] = useState<string | null>(
    null
  );

  // Helper to map ipfs:// to HTTP gateway
  const ipfsToHttp = (uri: string) => {
    if (!uri) return uri;
    if (uri.startsWith("http")) return uri;
    if (uri.startsWith("ipfs://")) {
      const cidPath = uri.replace("ipfs://", "");
      const gatewayBase = import.meta.env.VITE_PINATA_GATEWAY_DOMAIN as
        | string
        | undefined;
      return gatewayBase
        ? `https://${gatewayBase}/ipfs/${cidPath}`
        : `https://gateway.pinata.cloud/ipfs/${cidPath}`;
    }
    return uri;
  };

  // CAIP-19 asset IDs for swap helper
  const CAIP = {
    BASE_NATIVE: "eip155:8453/native",
    BASE_USDC: "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  } as const;

  const imageService = useMemo(() => new ImageGenerationService(), []);

  // Read contract data
  const { data: mintFee } = useReadContract({
    address: clinkers.address as `0x${string}`,
    abi: clinkers.abi,
    functionName: "mintFee",
  }) as { data: bigint | undefined };

  const { data: isFidMinted } = useReadContract({
    address: clinkers.address as `0x${string}`,
    abi: clinkers.abi,
    functionName: "isFidMinted",
    args: userFid ? [BigInt(userFid)] : undefined,
  }) as { data: boolean | undefined };

  // If minted, get tokenURI for this fid (tokenId == fid)
  const { data: tokenUri } = useReadContract({
    address: clinkers.address as `0x${string}`,
    abi: clinkers.abi,
    functionName: "tokenURI",
    args: userFid ? [BigInt(userFid)] : undefined,
    // @ts-ignore - wagmi query enabling (supported in v1/v2)
    query: { enabled: Boolean(userFid && isFidMinted) },
  }) as { data: string | undefined };

  // When tokenUri is available, fetch metadata and extract image url
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenUri || !isFidMinted) {
        setMintedMetadataUri(null);
        setMintedImageUrl(null);
        return;
      }
      try {
        const httpUri = ipfsToHttp(tokenUri);
        setMintedMetadataUri(httpUri);
        const res = await fetch(httpUri);
        if (!res.ok) throw new Error(`Failed metadata fetch ${res.status}`);
        const json = await res.json();
        const img = json?.image as string | undefined;
        setMintedImageUrl(img ? ipfsToHttp(img) : null);
      } catch (e) {
        if (!cancelled) {
          setMintedImageUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenUri, isFidMinted]);

  // Read ETH balance on Base mainnet for the connected address
  const { data: baseBalanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: 8453,
  });
  const baseBalanceWei = baseBalanceData?.value ?? 0n;
  const mintFeeWei = mintFee ?? 0n;
  const hasEnoughEth = baseBalanceWei >= mintFeeWei;

  // Initialize with Farcaster context FID
  useEffect(() => {
    if (farcasterContext.fid && !userFid) {
      setUserFid(farcasterContext.fid);
    }
  }, [farcasterContext.fid, userFid]);

  // Proactively check if connected wallet owns the FID (for UX hint under the button)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (userFid && address && isConnected) {
        try {
          setWalletOwnsFid(null);
          const ok = await verifyFidOwnership(userFid, address);
          if (!cancelled) setWalletOwnsFid(ok);
        } catch (e) {
          if (!cancelled) setWalletOwnsFid(false);
        }
      } else {
        setWalletOwnsFid(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userFid, address, isConnected]);

  // Reset everything on retry
  const resetState = () => {
    setStatus("idle");
    setError(null);
    setPreparedMintData(null);
    setGeneratedImageUrl(null);
  };

  const handleGenerateClinker = async () => {
    if (!userFid) {
      setError("Please enter a FID to generate a Clinker");
      return;
    }

    try {
      resetState();
      setStatus("verifying");
      setError(null);

      // Check if FID is already minted
      if (isFidMinted) {
        setError(`Clinker for FID ${userFid} has already been minted!`);
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

      setNeynarUser(user);
      setStatus("generating");

      // Determine user phase
      const { phase } = determineClinkerPhase(user);
      setUserPhase(phase); // Store the phase for minting

      // Generate Clinker prompt based on user phase
      const personalityPrompt = await generateClinkerPrompt(user);

      // Increment regeneration counter to vary seed for uniqueness
      const nextSeedSalt = regenCounter + 1;
      setRegenCounter(nextSeedSalt);

      // Generate image using user's PFP as reference and phase
      console.log("[Generation] Starting image generation...");
      const result = await imageService.generateClinkerImage({
        prompt: personalityPrompt,
        customPrompt: personalityPrompt,
        seedSalt: nextSeedSalt,
        pfpUrl: user.pfp_url,
        username: user.username,
        fid: user.fid,
        phase, // Pass the determined phase
        variationStrength: "bold",
      });
      console.log("[Generation] Image generated successfully");

      setGeneratedImageUrl(result.imageUrl);

      // Prepare IPFS uploads right after generation
      try {
        setStatus("preparing");
        console.log("[IPFS] Starting uploads...");

        // Upload image to IPFS
        const imageBlob = await blobFromUrl(result.imageUrl);
        console.log("[IPFS] Image blob created");
        const imageUri = await uploadImageBlob(
          imageBlob,
          `clinker-${userFid}.png`
        );
        console.log("[IPFS] Image uploaded:", imageUri); // Create and upload metadata
        const metadata = {
          name: `Clinker #${userFid}`,
          description: `Personalized Farcaster NFT for ${user.display_name || user.username} (FID: ${userFid})`,
          image: imageUri,
          attributes: [
            { trait_type: "FID", value: userFid.toString() },
            { trait_type: "Username", value: user.username },
            {
              trait_type: "Display Name",
              value: user.display_name || user.username,
            },
            {
              trait_type: "Followers",
              value: user.follower_count.toString(),
            },
            {
              trait_type: "Following",
              value: user.following_count.toString(),
            },
          ],
          properties: {
            fid: userFid,
            username: user.username,
            generated_at: new Date().toISOString(),
          },
        };

        const metadataUri = await uploadMetadata(metadata);

        // Store prepared data
        setPreparedMintData({ imageUri, metadataUri });
        setStatus("ready");
      } catch (uploadErr: any) {
        console.error("Failed to prepare mint data:", uploadErr);
        setError("Failed to prepare mint data. Please try again.");
        setStatus("error");
      }
    } catch (err: any) {
      console.error("Clinker generation failed:", err);
      setError(err.message || "Failed to generate Clinker. Please try again.");
      setStatus("error");
    }
  };

  const [preparedMintData, setPreparedMintData] = useState<{
    imageUri: string;
    metadataUri: string;
  } | null>(null);

  const handleMintClinker = async () => {
    if (
      !preparedMintData ||
      !userFid ||
      !address ||
      !isConnected ||
      !walletOwnsFid // Use existing proactive check
    )
      return;

    try {
      setStatus("minting");

      // Trigger haptic feedback
      try {
        await sdk.haptics.impactOccurred("medium");
      } catch (e) {
        console.debug("Haptic feedback not available:", e);
      }

      const { metadataUri } = preparedMintData;

      // Mint Clinker with user's determined phase as the level
      // Contract expects 0-3 (baby, youngins, rising, OGs), frontend uses 1-4, so subtract 1
      const result = await mintClinker({
        fid: BigInt(userFid),
        metadataURI: metadataUri,
        initialLevel: userPhase - 1, // Convert frontend phase (1-4) to contract level (0-3)
        feeEth: mintFee ? formatEther(mintFee) : "0",
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
        imageUri: preparedMintData.imageUri,
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

  const handleSwapForEth = async (sellToken: string) => {
    try {
      await sdk.actions.swapToken({
        sellToken,
        buyToken: CAIP.BASE_NATIVE,
      });
    } catch (e) {
      console.error("Swap action failed:", e);
      try {
        await sdk.haptics.notificationOccurred("error");
      } catch {}
    }
  };

  const handleShare = async () => {
    if (!mintSuccessData || !neynarUser) return;

    try {
      const miniAppUrl = MINI_APP_URL;
      const text = `Just forged my $Clinkers #${mintSuccessData.fid}! 🔥💎\n\nReady to battle?\n\n@mrfuego.eth has the portal 👇`;

      await sdk.actions.composeCast({
        text,
        embeds: [mintSuccessData.imageUri, miniAppUrl] as [string, string],
      });
    } catch (error) {
      console.error("Failed to compose cast:", error);
    }
  };

  // Share button for already-minted view (re-entry). Embeds only the image and includes mini app URL in text.
  const handleShareMintedView = async () => {
    if (!userFid || !mintedImageUrl) return;
    try {
      const text = `My $Clinkers #${userFid} is forged. 🔥💎\n\nReady to battle?\n\n@mrfuego.eth can summon yours 👇\n\n${MINI_APP_URL}`;
      await sdk.actions.composeCast({
        text,
        embeds: [mintedImageUrl],
      });
    } catch (error) {
      console.error("Failed to compose cast (minted view):", error);
      try {
        await sdk.haptics.notificationOccurred("error");
      } catch {}
    }
  };

  // No explicit retry UI in minimalist design; generator auto-runs on load.

  // Auto-generate once FID is available and nothing generated yet
  useEffect(() => {
    if (status === "idle" && userFid && !generatedImageUrl) {
      handleGenerateClinker();
    }
  }, [status, userFid, generatedImageUrl]);

  // Minimal fallback if no FID (browser-only)
  if (!userFid) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000" />
          <div className="relative w-full aspect-square max-w-sm rounded-3xl border border-purple-500/30 bg-gradient-to-br from-slate-900/90 to-purple-900/30 backdrop-blur-xl flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)]" />
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
            </div>
          </div>
        </div>
        <button
          disabled
          className="w-full max-w-sm py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold opacity-40 cursor-not-allowed shadow-xl"
        >
          Connect Wallet to Mint
        </button>
      </div>
    );
  }

  if (isFidMinted) {
    return (
      <div className="w-full max-w-sm mx-auto">
        {/* Glass card with glow */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 rounded-3xl blur-lg opacity-30 group-hover:opacity-50 transition duration-500" />
          <div className="relative rounded-3xl border border-purple-400/30 bg-gradient-to-br from-slate-900/90 to-purple-900/20 backdrop-blur-xl p-6 space-y-5">
            {/* Header with badge */}
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-200 to-blue-200 bg-clip-text text-transparent">
                Your Clinker
              </h3>
              <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30">
                <span className="text-xs font-bold text-emerald-300">
                  ✓ MINTED
                </span>
              </div>
            </div>

            {/* Image with premium frame */}
            <div className="relative group/img">
              <div className="absolute -inset-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-20 group-hover/img:opacity-40 transition duration-300" />
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden border-2 border-purple-400/30 bg-gradient-to-br from-slate-900 to-purple-900/50 shadow-2xl">
                {mintedImageUrl ? (
                  <img
                    src={mintedImageUrl}
                    alt="Minted Clinker"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons - Modern grid */}
            <div className="grid grid-cols-2 gap-3">
              {mintedMetadataUri && (
                <a
                  href={mintedMetadataUri}
                  target="_blank"
                  rel="noreferrer"
                  className="py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-sm transition-all duration-200 shadow-lg hover:shadow-purple-500/50 hover:scale-105"
                >
                  View NFT
                </a>
              )}
              {mintedImageUrl && (
                <a
                  href={mintedImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-purple-400/30 text-purple-200 font-semibold text-sm transition-all duration-200 hover:scale-105"
                >
                  Full Image
                </a>
              )}
            </div>

            {/* Share button - Primary CTA */}
            <button
              onClick={handleShareMintedView}
              disabled={!mintedImageUrl}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-xl hover:shadow-indigo-500/50 hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
              </svg>
              Share on Farcaster
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Premium image card */}
      <div className="relative w-full max-w-sm group">
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 rounded-3xl blur-lg opacity-30 group-hover:opacity-50 transition duration-700 animate-pulse" />
        <div className="relative aspect-square rounded-3xl border-2 border-purple-400/30 bg-gradient-to-br from-slate-900/90 to-purple-900/30 backdrop-blur-xl overflow-hidden shadow-2xl">
          {generatedImageUrl ? (
            <>
              <img
                src={generatedImageUrl}
                alt="Clinker"
                className="w-full h-full object-cover"
              />
              {status === "preparing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6 bg-slate-950/80 backdrop-blur-md">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-400 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-purple-500/20" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-purple-200">
                      Preparing for mint
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.15),transparent_70%)]" />
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-purple-200">
                  {status === "verifying"
                    ? "Verifying your identity"
                    : "Creating your Clinker"}
                </p>
                <p className="text-xs text-slate-400">
                  {status === "verifying"
                    ? "Checking FID ownership..."
                    : "Creating your unique traits..."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Main mint button */}
        <div className="relative group/btn">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-40 group-hover/btn:opacity-70 transition duration-300" />
          <button
            onClick={handleMintClinker}
            disabled={
              !isConnected ||
              !hasEnoughEth ||
              !preparedMintData ||
              status === "preparing" ||
              status === "minting" ||
              status === "generating" ||
              status === "verifying"
            }
            className="relative w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-2xl hover:shadow-purple-500/50 hover:scale-[1.02] disabled:hover:scale-100"
          >
            {!isConnected
              ? "Connect Wallet to Mint"
              : status === "preparing"
                ? "⏳ Preparing..."
                : status === "minting"
                  ? "🔄 Minting..."
                  : `✨ Mint${mintFee ? ` • ${formatEther(mintFee)} ETH` : ""}`}
          </button>
        </div>

        {/* Status cards */}
        {isConnected && (
          <div className="rounded-xl bg-gradient-to-br from-slate-900/50 to-purple-900/20 border border-purple-400/20 backdrop-blur-sm p-4">
            <div className="flex items-start gap-3">
              {walletOwnsFid === null ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-purple-200">
                      Verifying ownership
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Checking FID {userFid}...
                    </p>
                  </div>
                </>
              ) : walletOwnsFid === false ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                    <svg
                      className="w-3 h-3 text-red-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-red-300">
                      Ownership verification failed
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      This wallet doesn't own FID {userFid}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5">
                    <svg
                      className="w-3 h-3 text-emerald-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-emerald-300">
                      Wallet verified
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      You own FID {userFid}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Insufficient ETH helper */}
        {isConnected && status !== "minting" && !hasEnoughEth && (
          <div className="rounded-xl bg-gradient-to-br from-amber-900/30 to-orange-900/20 border border-amber-500/30 backdrop-blur-sm p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center mt-0.5">
                <svg
                  className="w-3 h-3 text-amber-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-300">
                  Insufficient ETH
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Need {mintFee ? formatEther(mintFee) : "0"} ETH to mint
                </p>
              </div>
            </div>
            <button
              onClick={() => handleSwapForEth(CAIP.BASE_USDC)}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold text-sm transition-all duration-200 hover:scale-[1.02]"
            >
              Swap USDC → ETH
            </button>
          </div>
        )}
      </div>

      {/* Success Modal */}
      {status === "success" && mintSuccessData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          {/* Success glow backdrop */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10" />

          <div className="relative max-w-md w-full">
            {/* Outer glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-3xl blur-2xl opacity-40 animate-pulse" />

            {/* Modal content */}
            <div className="relative bg-gradient-to-br from-slate-900/95 to-purple-900/40 rounded-3xl shadow-2xl border border-purple-400/30 backdrop-blur-2xl overflow-hidden">
              {/* Success header */}
              <div className="p-8 text-center border-b border-purple-400/20">
                <div className="relative w-20 h-20 mx-auto mb-4">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full animate-pulse opacity-30 blur-xl" />
                  <div className="relative w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center border-2 border-purple-300/50 shadow-xl">
                    <svg
                      className="w-10 h-10 text-white animate-in zoom-in duration-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-200 via-pink-200 to-blue-200 bg-clip-text text-transparent mb-2">
                  Clinker Minted!
                </h2>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/30">
                  <span className="text-sm font-medium text-purple-200">
                    Clinker
                  </span>
                  <span className="text-sm font-bold text-white">
                    #{mintSuccessData.fid.toString()}
                  </span>
                </div>
              </div>

              {/* Image preview */}
              <div className="p-6">
                <div className="relative group/img">
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-30 group-hover/img:opacity-50 transition duration-300" />
                  <div className="relative rounded-2xl overflow-hidden border-2 border-purple-400/30 shadow-2xl">
                    <img
                      src={mintSuccessData.imageUri}
                      alt="Minted Clinker"
                      className="w-full h-auto"
                    />
                  </div>
                </div>

                {/* Transaction hash */}
                <div className="mt-6 rounded-xl bg-gradient-to-br from-slate-900/50 to-purple-900/20 border border-purple-400/20 backdrop-blur-sm p-4">
                  <p className="text-xs font-medium text-purple-300 mb-2">
                    Transaction Hash
                  </p>
                  <p className="text-xs font-mono text-slate-300 break-all">
                    {mintSuccessData.hash.slice(0, 10)}...
                    {mintSuccessData.hash.slice(-8)}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="mt-6 space-y-3">
                  <div className="relative group/share">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl blur opacity-40 group-hover/share:opacity-70 transition duration-300" />
                    <button
                      onClick={handleShare}
                      className="relative w-full py-3.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02]"
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
                  </div>
                  <button
                    onClick={() => setStatus("idle")}
                    className="w-full py-3 text-purple-200 bg-white/5 hover:bg-white/10 border border-purple-400/30 font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02]"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
