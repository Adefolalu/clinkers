import { sdk } from "@farcaster/miniapp-sdk";
import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { ClinkerGeneratorComponent } from "./components/CarpletGeneratorComponent";
import { useFarcasterContext } from "./hooks/useFarcasterContext";
import AdminPanel from "./components/AdminPanel";
import { RecentMints } from "./components/RecentMints";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-white relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent" />

      {/* Animated mesh gradient overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
        <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-700" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="container mx-auto py-8 px-4 max-w-md relative z-10">
        <header className="text-center mb-10">
          <div className="inline-block mb-3">
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-400/30 backdrop-blur-sm">
              <span className="text-xs font-medium text-purple-200">
                ✨ clinker x clanker ✨
              </span>
            </div>
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold bg-gradient-to-r from-purple-200 via-blue-200 to-indigo-200 bg-clip-text text-transparent mb-2">
            CLINKERS
          </h1>
          <p className="text-sm text-slate-400 font-medium">
            Your clanker Identity
          </p>
        </header>

        <RecentMints />

        <AdminPanel />
        <ClinkerGenerator />
      </div>
    </div>
  );
}

function ClinkerGenerator() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const farcasterContext = useFarcasterContext();
  const [autoConnecting, setAutoConnecting] = useState(false);
  // null = detecting, true/false = resolved
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  // Check if running in Mini App and connect immediately
  useEffect(() => {
    async function checkMiniAppAndConnect() {
      let isInMiniApp = false;
      try {
        isInMiniApp = (await sdk.isInMiniApp()) ?? false;
      } catch {
        isInMiniApp = false;
      }
      setIsMiniApp(isInMiniApp);

      // Immediately connect if in Mini App
      if (isInMiniApp && !isConnected && !autoConnecting) {
        setAutoConnecting(true);
        const farcasterConnector = connectors.find(
          (connector) => connector.id === "farcasterMiniApp"
        );
        if (farcasterConnector) {
          try {
            await connect({ connector: farcasterConnector });
          } catch (error) {
            console.error("Auto-connect failed:", error);
          }
        }
        setAutoConnecting(false);
      }
    }
    checkMiniAppAndConnect();
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
        await sdk.actions.addMiniApp();
      } catch (e) {
        console.debug("Add mini app skipped:", e);
      }
    }
    onMiniAppReady();
  }, [isMiniApp]);

  // Show loading state
  if (farcasterContext.isLoading) {
    return (
      <div className="w-full">
        <div className="rounded-3xl border border-brand/30 bg-white/5 p-10 text-center">
          <div className="relative inline-block mb-4">
            <div className="w-14 h-14 border-[3px] border-brand/30 rounded-full absolute"></div>
            <div className="w-14 h-14 border-[3px] border-brand border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm font-semibold text-brand tracking-wide">
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
          <div className="rounded-3xl border border-brand/30 bg-white/5 p-10 text-center">
            <div className="relative inline-block mb-4">
              <div className="w-14 h-14 border-[3px] border-brand/30 rounded-full absolute"></div>
              <div className="w-14 h-14 border-[3px] border-brand border-t-transparent rounded-full animate-spin"></div>
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
          <div className="rounded-3xl border border-brand/30 bg-white/5 p-10 text-center">
            <div className="relative inline-block mb-4">
              <div className="w-14 h-14 border-[3px] border-brand/30 rounded-full absolute"></div>
              <div className="w-14 h-14 border-[3px] border-brand border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-sm text-slate-300 mb-1">
              Connecting Warpcast wallet...
            </p>
            {farcasterContext.fid && (
              <p className="text-xs text-brand/80">
                FID: {farcasterContext.fid}
              </p>
            )}
          </div>
        </div>
      );
    }
    // Browser (isMiniApp === false): fall through to show the generator without wallet
  }

  // Show Clinker generator:
  // - Browser: always
  // - Mini App: only when FID is available
  if (isMiniApp === false || (isMiniApp === true && farcasterContext.fid)) {
    return <ClinkerGeneratorComponent />;
  }

  // If connected but no FID detected (mini app only)
  return (
    <div className="w-full">
      <div className="rounded-3xl border border-brand/30 bg-white/5 p-8">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-brand/10 rounded-full flex items-center justify-center border-2 border-brand/30">
            <svg
              className="w-10 h-10 text-brand"
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
          <h3 className="text-xl font-bold text-brand mb-2">
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
