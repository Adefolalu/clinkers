import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { http, createConfig } from "wagmi";
import { celo } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "@wagmi/connectors";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

// Get WalletConnect project ID from environment (optional)
// Fallback to a demo id to avoid undefined issues in dev
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo-project-id";

// Set up the Wagmi adapter
const wagmiAdapter = new WagmiAdapter({
  networks: [celo],
  projectId,
});

// Create AppKit instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [celo],
  projectId,
  metadata: {
    name: "Clinker",
    description: "Generate your personalized Farcaster NFT on Celo",
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
  chains: [celo],
  connectors: [
    injected(), // MetaMask, Rainbow, Coinbase Wallet browser extensions
    farcasterMiniApp(), // Farcaster Frame connector
    walletConnect({ projectId }), // WalletConnect
    coinbaseWallet({ appName: "Carplets" }), // Coinbase Wallet
  ],
  transports: {
    [celo.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
