import { sdk } from "@farcaster/frame-sdk";
import { sdk as miniAppSdk } from "@farcaster/miniapp-sdk";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { CarpletGeneratorComponent } from "./components/CarpletGeneratorComponent";
import { useFarcasterContext } from "./hooks/useFarcasterContext";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  return (
    <div className="min-h-screen bg-surface text-white">
      <div className="container mx-auto py-10 px-4 max-w-md">
        <header className="text-center mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-brand">
            CARPLET
          </h1>
        </header>
        <AdminPanel />
        <CarpletGenerator />
      </div>
    </div>
  );
}

function CarpletGenerator() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const farcasterContext = useFarcasterContext();
  const [autoConnecting, setAutoConnecting] = useState(false);
  // null = detecting, true/false = resolved
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  // Check if running in Mini App
  useEffect(() => {
    async function checkMiniApp() {
      let isInMiniApp = false;
      try {
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

  // Show loading state
  if (farcasterContext.isLoading) {
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-10 text-center border border-[#2596be]/30">
          <div className="relative inline-block mb-4">
            <div className="w-14 h-14 border-[3px] border-[#2596be]/30 rounded-full absolute"></div>
            <div className="w-14 h-14 border-[3px] border-[#2596be] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm font-semibold text-[#2596be] tracking-wide">
            Loading your Farcaster profile...
          </p>
        </div>
      </div>
    );
  }

  // Show error state only in mini app mode (browser mode is expected to not have Farcaster context)
  if (farcasterContext.error && isMiniApp) {
    return (
      <div className="w-full">
        <div className="bg-gradient-to-br from-red-900/80 to-red-800/70 border-2 border-red-500/50 rounded-3xl p-8 text-center shadow-[0_8px_24px_rgba(239,68,68,0.3)]">
          <p className="text-red-300 font-semibold mb-2">
            ⚠️ {farcasterContext.error}
          </p>
          <p className="text-xs text-red-400 font-medium">
            FID: {farcasterContext.fid || "Not detected"}
          </p>
        </div>
      </div>
    );
  }

  // Show wallet connection prompt only for Mini App. In browser, allow generator without connection.
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

    // Mini app: show a minimal auto-connecting card
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
    // Browser (isMiniApp === false): fall through to show the generator without wallet
  }

  // Show Carplet generator:
  // - Browser: always
  // - Mini App: only when FID is available
  if (isMiniApp === false || (isMiniApp === true && farcasterContext.fid)) {
    return <CarpletGeneratorComponent />;
  }

  // If connected but no FID detected (mini app only)
  return (
    <div className="w-full">
      <div className="bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-[#1a5f7a]/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(37,150,190,0.25)] p-8 border border-[#2596be]/30">
        <div className="text-center">
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
            Farcaster Profile Not Found
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            We couldn't detect your Farcaster profile. Please make sure you're
            using this app through Warpcast.
          </p>
        </div>
      </div>
    </div>
  );
}
