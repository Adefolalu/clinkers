import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "@wagmi/connectors";

// Get WalletConnect project ID from environment (optional)
// Fallback to a demo id to avoid undefined issues in dev
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo-project-id";

const metadata = {
  name: "Clinkers",
  description: "Generate your personalized Farcaster NFT on Base",
  url:
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://the-clinkers.vercel.app",
  icons: [],
};

export const config = createConfig({
  chains: [base],
  connectors: [
    injected({ shimDisconnect: true }),
    farcasterMiniApp(),
    walletConnect({
      projectId,
      metadata,
      showQrModal: true,
    }),
    coinbaseWallet({ appName: "Clinkers", chainId: base.id }),
  ],
  transports: {
    [base.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
