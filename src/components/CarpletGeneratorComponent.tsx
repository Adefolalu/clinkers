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
import { useReadContract, useAccount, useBalance } from "wagmi";
import { formatEther } from "viem";
import { carplets } from "../constants/Abi";
import { sdk } from "@farcaster/miniapp-sdk";
import { useFarcasterContext } from "../hooks/useFarcasterContext";

export function CarpletGeneratorComponent() {
  const { address, isConnected } = useAccount();
  const farcasterContext = useFarcasterContext();
  const MINI_APP_URL = "https://the-carplet.vercel.app";

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
    CELO_NATIVE: "eip155:42220/native",
    BASE_NATIVE: "eip155:8453/native",
    BASE_USDC: "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  } as const;

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

  // If minted, get tokenURI for this fid (tokenId == fid)
  const { data: tokenUri } = useReadContract({
    address: carplets.address as `0x${string}`,
    abi: carplets.abi,
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

  // Read CELO balance on Celo mainnet for the connected address
  const { data: celoBalanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: 42220,
  });
  const celoBalanceWei = celoBalanceData?.value ?? 0n;
  const mintFeeWei = mintFee ?? 0n;
  const hasEnoughCelo = celoBalanceWei >= mintFeeWei;

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

  const handleGenerateCarplet = async () => {
    if (!userFid) {
      setError("Please enter a FID to generate a Carplet");
      return;
    }

    try {
      resetState();
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

      setNeynarUser(user);
      setStatus("generating");

      // Generate Carplet prompt based on user personality and casts
      const personalityPrompt = await generateCarpletPrompt(user);

      // Increment regeneration counter to vary seed for uniqueness
      const nextSeedSalt = regenCounter + 1;
      setRegenCounter(nextSeedSalt);

      // Generate image using user's PFP as reference
      console.log("[Generation] Starting image generation...");
      const result = await imageService.generateCarpletImage({
        prompt: personalityPrompt,
        customPrompt: personalityPrompt,
        seedSalt: nextSeedSalt,
        pfpUrl: user.pfp_url,
        username: user.username,
        fid: user.fid,
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
          `carplet-${userFid}.png`
        );
        console.log("[IPFS] Image uploaded:", imageUri); // Create and upload metadata
        const metadata = {
          name: `Carplet #${userFid}`,
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
      console.error("Carplet generation failed:", err);
      setError(err.message || "Failed to generate Carplet. Please try again.");
      setStatus("error");
    }
  };

  const [preparedMintData, setPreparedMintData] = useState<{
    imageUri: string;
    metadataUri: string;
  } | null>(null);

  const handleMintCarplet = async () => {
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

      // Mint Carplet
      const result = await mintCarplet({
        fid: BigInt(userFid),
        metadataURI: metadataUri,
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

  const handleSwapForCelo = async (sellToken: string) => {
    try {
      await sdk.actions.swapToken({
        sellToken,
        buyToken: CAIP.CELO_NATIVE,
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
      const miniAppUrl = "https://the-carplet.vercel.app";
      const text = `Just minted my Carplet #${mintSuccessData.fid}! 🎨\n\nGet your personalized Carplet on Celo`;

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
      const text = `My Carplet #${userFid} on Celo 🎨\n\nGet yours: ${MINI_APP_URL}`;
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
      handleGenerateCarplet();
    }
  }, [status, userFid, generatedImageUrl]);

  // Minimal fallback if no FID (browser-only). Keep structure simple: image placeholder + disabled mint
  if (!userFid) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="w-full aspect-square max-w-sm rounded-2xl border border-brand/40 bg-white/5 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        </div>
        <button
          disabled
          className="w-full max-w-sm py-3 rounded-xl bg-brand text-black font-semibold opacity-60 cursor-not-allowed"
        >
          Mint
        </button>
      </div>
    );
  }

  if (isFidMinted) {
    return (
      <div className="w-full max-w-sm mx-auto rounded-2xl border border-brand/30 bg-white/5 p-6 text-center space-y-4">
        <h3 className="text-xl font-bold text-brand font-display">
          Your Carplet
        </h3>
        <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-brand/30 bg-white/5">
          {mintedImageUrl ? (
            <img
              src={mintedImageUrl}
              alt="Minted Carplet"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {mintedMetadataUri && (
            <a
              href={mintedMetadataUri}
              target="_blank"
              rel="noreferrer"
              className="py-2 rounded-xl bg-brand text-black font-semibold"
            >
              View NFT
            </a>
          )}
          {mintedImageUrl && (
            <a
              href={mintedImageUrl}
              target="_blank"
              rel="noreferrer"
              className="py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-brand/30 text-brand font-medium"
            >
              Open Image
            </a>
          )}
        </div>
        <button
          onClick={handleShareMintedView}
          disabled={!mintedImageUrl}
          className="w-full py-2 rounded-xl bg-brand text-black font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Share on Farcaster
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-full max-w-sm aspect-square rounded-2xl border border-brand/40 bg-white/5 overflow-hidden">
        {generatedImageUrl ? (
          <>
            <img
              src={generatedImageUrl}
              alt="Carplet"
              className="w-full h-full object-cover"
            />
            {status === "preparing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4 bg-black/70 backdrop-blur-sm">
                <div className="w-12 h-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                <p className="text-sm text-slate-300">Preparing for mint...</p>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <p className="text-sm text-slate-300">
              {status === "verifying"
                ? "Checking FID..."
                : "Creating your Carplet..."}
            </p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm space-y-2">
        <button
          onClick={handleMintCarplet}
          disabled={
            !isConnected ||
            !hasEnoughCelo ||
            !preparedMintData ||
            status === "preparing" ||
            status === "minting" ||
            status === "generating" ||
            status === "verifying"
          }
          className="w-full py-3 rounded-xl bg-brand text-black font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {!isConnected
            ? "Connect wallet to mint"
            : status === "preparing"
              ? "Preparing..."
              : status === "minting"
                ? "Minting..."
                : `Mint${mintFee ? ` • ${formatEther(mintFee)} CELO` : ""}`}
        </button>
        {/* Ownership hint */}
        {isConnected && (
          <p className="mt-2 text-xs text-slate-400 text-center">
            {walletOwnsFid === null &&
              "Verifying wallet ownership for this FID..."}
            {walletOwnsFid === false && (
              <span className="text-red-300">
                Connected wallet does not own FID {userFid}. You can still
                preview, but mint will be blocked.
              </span>
            )}
            {walletOwnsFid === true && (
              <span className="text-emerald-300">
                Wallet verified for FID {userFid}.
              </span>
            )}
          </p>
        )}

        {/* Insufficient CELO helper: offer Base ETH or Base USDC swap to CELO */}
        {isConnected && status !== "minting" && !hasEnoughCelo && (
          <div className="mt-1 text-center text-xs">
            <p className="mb-2 text-slate-300">
              Insufficient CELO to cover the mint fee
              {mintFee ? ` (${formatEther(mintFee)} CELO)` : ""}. Get CELO here:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSwapForCelo(CAIP.BASE_NATIVE)}
                className="py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-brand/40 text-brand font-medium transition-colors"
              >
                With ETH (Base)
              </button>
              <button
                onClick={() => handleSwapForCelo(CAIP.BASE_USDC)}
                className="py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-brand/40 text-brand font-medium transition-colors"
              >
                With USDC (Base)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Success Modal */}
      {status === "success" && mintSuccessData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-3xl shadow-xl max-w-md w-full border border-brand/30 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-brand/15 rounded-full flex items-center justify-center border-2 border-brand">
                <svg
                  className="w-8 h-8 text-brand"
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
              <h2 className="text-2xl font-bold text-brand mb-2">
                Carplet Minted!
              </h2>
              <p className="text-sm text-slate-300 mb-4">
                Carplet #{mintSuccessData.fid.toString()}
              </p>

              <div className="mb-6 rounded-2xl overflow-hidden border border-brand/30 shadow-lg">
                <img
                  src={mintSuccessData.imageUri}
                  alt="Minted Carplet"
                  className="w-full h-auto"
                />
              </div>

              <div className="bg-white/5 rounded-xl p-3 mb-4 text-xs">
                <p className="text-slate-400 mb-1">Transaction Hash:</p>
                <p className="text-brand font-mono break-all">
                  {mintSuccessData.hash.slice(0, 10)}...
                  {mintSuccessData.hash.slice(-8)}
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleShare}
                  className="w-full py-3 bg-brand text-black font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
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
                  className="w-full py-2.5 text-brand bg-white/5 hover:bg-white/10 border border-brand/30 font-medium rounded-xl transition-colors"
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
