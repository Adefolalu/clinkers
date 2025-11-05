import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "@wagmi/connectors";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

// Get WalletConnect project ID from environment (optional)
// Fallback to a demo id to avoid undefined issues in dev
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo-project-id";

// Set up the Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
  networks: [base],
  projectId,
});

// Create AppKit instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [base],
  projectId,
  metadata: {
    name: "Mutant Warplets",
    description: "Mutate your Warplet into cyberpunk creatures",
    url: typeof window !== "undefined" ? window.location.origin : "",
    icons: [],
  },
  features: {
    email: true, // default to true
    socials: ["farcaster"],
    emailShowWallets: true, // default to true
  },
  allWallets: "SHOW", // default to SHOW
});

export const config = createConfig({
  chains: [base],
  connectors: [
    injected(), // MetaMask, Rainbow, Coinbase Wallet browser extensions
    farcasterFrame(), // Farcaster Frame connector
    walletConnect({ projectId }), // WalletConnect
    coinbaseWallet({ appName: "Mutant Warplets" }), // Coinbase Wallet
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
