import { sdk } from "@farcaster/frame-sdk";
import { sdk as miniAppSdk } from "@farcaster/miniapp-sdk";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { MutationComponent } from "./components/MutationComponent";
import type { NFTData } from "./hooks/useMutation";
import { useFarcasterContext } from "./hooks/useFarcasterContext";
import { fetchUserWarplets, type WarpletNFT } from "./services/warpletService";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-[#1a5f7a]">
      <div className="container mx-auto py-6 px-4 max-w-md">
        <header className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#2596be] mb-1 tracking-tight drop-shadow-[0_2px_8px_rgba(37,150,190,0.3)]">
            Mutant Warplets
          </h1>
          <p className="text-[10px] text-[#2596be]/80 font-semibold tracking-widest uppercase">
            Evolve • Mutate • Mint
          </p>
        </header>
        {/* Owner-only admin panel (withdraw treasury). Renders null for non-owners. */}
        <AdminPanel />
        <WarpletMutator />
      </div>
    </div>
  );
}

function WarpletMutator() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const farcasterContext = useFarcasterContext();
  const [warpletData, setWarpletData] = useState<NFTData | null>(null);

  const [error] = useState<string | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(false);
  // null = detecting, true/false = resolved
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  // Owned Warplets (by connected wallet)
  const [ownedWarplets, setOwnedWarplets] = useState<WarpletNFT[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [ownedError, setOwnedError] = useState<string | null>(null);

  // Check if running in Mini App
  useEffect(() => {
    async function checkMiniApp() {
      // Use a small timeout to allow context comms and avoid flicker
      let isInMiniApp = false;
      try {
        // Some SDKs accept a timeout arg; if unsupported, this will be ignored
        isInMiniApp = (await sdk.isInMiniApp()) ?? false;
      } catch {
        isInMiniApp = false;
      }
      setIsMiniApp(isInMiniApp);
    }
    checkMiniApp();
  }, []);

  // Mini app lifecycle hooks: mark ready and suggest adding mini app
  useEffect(() => {
    async function onMiniAppReady() {
      if (!isMiniApp) return;
      try {
        sdk.actions.ready();
      } catch (e) {
        console.debug("Mini app ready failed:", e);
      }
      try {
        await miniAppSdk.actions.addMiniApp();
      } catch (e) {
        // Non-fatal if user dismisses or not supported
        console.debug("Add mini app skipped:", e);
      }
    }
    onMiniAppReady();
  }, [isMiniApp]);

  // Auto-connect Farcaster wallet if in miniapp
  useEffect(() => {
    async function autoConnectFarcaster() {
      if (isMiniApp === true && !isConnected && !autoConnecting) {
        setAutoConnecting(true);
        try {
          // Retry a few times in case connector registry isn't ready yet
          for (let attempt = 0; attempt < 3 && !isConnected; attempt++) {
            const farcasterConnector = connectors.find(
              (connector) => connector.id === "farcasterFrame"
            );
            if (farcasterConnector) {
              console.log(
                "Auto-connecting Farcaster wallet in Mini App... (attempt",
                attempt + 1,
                ")"
              );
              try {
                await connect({ connector: farcasterConnector });
                break;
              } catch (e) {
                // transient error, retry shortly
                await new Promise((r) => setTimeout(r, 400));
              }
            } else {
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        } catch (error) {
          console.error("Auto-connect failed:", error);
        } finally {
          setAutoConnecting(false);
        }
      }
    }

    autoConnectFarcaster();
  }, [isMiniApp, isConnected, autoConnecting, connectors, connect]);

  // Fetch Warplets owned by connected wallet (works for primary/secondary owners)
  useEffect(() => {
    async function loadOwnedWarplets() {
      if (!isConnected || !address) return;
      setOwnedLoading(true);
      setOwnedError(null);
      try {
        const nfts = await fetchUserWarplets(address);
        setOwnedWarplets(nfts);
        // Auto-select if exactly one
        if (nfts.length === 1) {
          const w = nfts[0];
          setWarpletData({
            tokenId: w.tokenId,
            contractAddress: "0x699727F9E01A822EFdcf7333073f0461e5914b4E",
            name: w.name || `Warplet #${w.tokenId}`,
            description: w.description || "",
            image: w.image,
            attributes: w.attributes || [],
          });
        }
      } catch (e) {
        console.error("Failed to fetch owned Warplets:", e);
        setOwnedError("Unable to load your Warplets. Please try again.");
      } finally {
        setOwnedLoading(false);
      }
    }
    loadOwnedWarplets();
  }, [isConnected, address]);

  // Show loading state (context or owned warplets)
  if (farcasterContext.isLoading || ownedLoading) {
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-10 text-center border border-[#2596be]/30">
          <div className="relative inline-block mb-4">
            <div className="w-14 h-14 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
            <div className="w-14 h-14 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm font-semibold text-[#2596be] tracking-wide">
            Loading your Warplets...
          </p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    // Special handling for users without Warplet NFT
    if (error.startsWith("no_warplet:")) {
      const tokenId = error.split(":")[1];
      return (
        <div className="w-full">
          <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-8 border border-[#2596be]/30">
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#2596be]/10 rounded-full flex items-center justify-center border-2 border-[#2596be]/30">
                <svg
                  className="w-10 h-10 text-[#2596be]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#2596be] mb-2">
                No Warplet in This Wallet
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                You don't have a Warplet in this wallet. Mint your Warplet first
                before mutation.
              </p>
            </div>

            <div className="space-y-3">
              <a
                href="https://warpcast.com/~/composer-actions/compose?text=https://warplets.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 px-4 bg-[#2596be] hover:bg-[#1d7a9f] text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_4px_16px_rgba(37,150,190,0.3)]"
              >
                🎨 Mint Your Warplet
              </a>

              <div className="text-center text-xs text-slate-500 py-2">
                <p className="mb-1">Your FID: {tokenId}</p>
                <p className="text-[10px] text-slate-600">
                  Mint Warplet #{tokenId} first, then come back to mutate it.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Generic error state
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-red-900/80 to-red-800/70 border-2 border-red-500/50 rounded-3xl p-8 text-center shadow-[0_8px_24px_rgba(239,68,68,0.3)]">
          <p className="text-red-300 font-semibold mb-2">⚠️ {error}</p>
          <p className="text-xs text-red-400 font-medium">
            FID: {farcasterContext.fid || "Not detected"}
          </p>
        </div>
      </div>
    );
  }

  // Show wallet connection prompt
  if (!isConnected) {
    // While detecting environment, avoid flashing the browser connect UI
    if (isMiniApp === null) {
      return (
        <div className="w-full">
          <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-10 text-center border border-[#2596be]/30">
            <div className="relative inline-block mb-4">
              <div className="w-14 h-14 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
              <div className="w-14 h-14 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-sm text-slate-300">Preparing environment...</p>
          </div>
        </div>
      );
    }

    // Mini app: show a minimal auto-connecting card (no Connect Wallet heading)
    if (isMiniApp === true) {
      return (
        <div className="w-full">
          <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-10 text-center border border-[#2596be]/30">
            <div className="relative inline-block mb-4">
              <div className="w-14 h-14 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
              <div className="w-14 h-14 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-sm text-slate-300 mb-1">
              Connecting Warpcast wallet...
            </p>
            {farcasterContext.fid && (
              <p className="text-xs text-[#2596be]/80">
                FID: {farcasterContext.fid}
              </p>
            )}
          </div>
        </div>
      );
    }

    // Browser: show AppKit button
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-10 text-center border border-[#2596be]/30">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#2596be]/10 rounded-full flex items-center justify-center border-2 border-[#2596be]/30">
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
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-[#2596be] mb-2">
            Connect Wallet
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            Connect your wallet to mutate your Warplet
          </p>
          <div className="space-y-4">
            <w3m-button />
            <div className="text-xs text-slate-500">
              Click above to see all wallet options
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If connected but no Warplet selected yet, render selection or empty state (no manual token id)
  if (isConnected && !warpletData) {
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-6 border border-[#2596be]/30">
          {ownedError ? (
            <div className="text-center">
              <p className="text-sm text-slate-300 mb-4">{ownedError}</p>
              <button
                onClick={async () => {
                  if (!address) return;
                  setOwnedLoading(true);
                  setOwnedError(null);
                  try {
                    const nfts = await fetchUserWarplets(address);
                    setOwnedWarplets(nfts);
                    if (nfts.length === 1) {
                      const w = nfts[0];
                      setWarpletData({
                        tokenId: w.tokenId,
                        contractAddress:
                          "0x699727F9E01A822EFdcf7333073f0461e5914b4E",
                        name: w.name || `Warplet #${w.tokenId}`,
                        description: w.description || "",
                        image: w.image,
                        attributes: w.attributes || [],
                      });
                    }
                  } catch (e) {
                    console.error(e);
                    setOwnedError(
                      "Unable to load your Warplets. Please try again."
                    );
                  } finally {
                    setOwnedLoading(false);
                  }
                }}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-[#2596be] text-white hover:bg-[#1f83a6] transition-colors"
              >
                Try again
              </button>
            </div>
          ) : ownedWarplets.length === 0 ? (
            <div className="text-center">
              <h3 className="text-xl font-bold text-[#2596be] mb-2">
                No Warplet found
              </h3>
              <p className="text-sm text-slate-400 mb-2">
                We couldn’t find a Warplet in this wallet.
              </p>
              {isMiniApp ? (
                <p className="text-xs text-slate-500">
                  This mini app uses your Warpcast wallet. If your Warplet is in
                  a different wallet
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Connect the wallet that owns your Warplet.
                </p>
              )}
            </div>
          ) : ownedWarplets.length > 1 ? (
            <div>
              <h3 className="text-lg font-semibold text-[#2596be] mb-4">
                Select a Warplet to mutate
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {ownedWarplets.map((nft) => (
                  <button
                    key={nft.tokenId}
                    onClick={() =>
                      setWarpletData({
                        tokenId: nft.tokenId,
                        contractAddress:
                          "0x699727F9E01A822EFdcf7333073f0461e5914b4E",
                        name: nft.name || `Warplet #${nft.tokenId}`,
                        description: nft.description || "",
                        image: nft.image,
                        attributes: nft.attributes || [],
                      })
                    }
                    className="group overflow-hidden rounded-xl border border-slate-700/60 hover:border-[#2596be]/60 transition-colors"
                  >
                    <div className="aspect-square bg-slate-900/50">
                      {nft.image ? (
                        <img
                          src={nft.image}
                          alt={nft.name || `Warplet #${nft.tokenId}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-left">
                      <div className="text-sm text-slate-200 truncate">
                        {nft.name || `Warplet #${nft.tokenId}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        ID: {nft.tokenId}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // If exactly one, we likely already auto-selected; render a subtle message
            <div className="text-center text-slate-400 text-sm">
              Preparing your Warplet…
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render mutation component
  return (
    <div className="w-full">
      {warpletData && <MutationComponent nftData={warpletData} />}
    </div>
  );
}
