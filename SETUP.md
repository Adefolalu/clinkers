# 🧬 Mutant Warplets - Setup Guide

AI-powered NFT mutation platform using Google Gemini API.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:

```env
# Required: Get your Gemini API key from https://makersuite.google.com/app/apikey
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Optional: For WalletConnect support
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### 3. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

## 🔑 Getting API Keys

### Google Gemini API Key (Required)

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and add it to `.env.local`

### WalletConnect Project ID (Optional)

1. Visit [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. Create a new project
3. Copy the Project ID
4. Add it to `.env.local`

## 🎮 How to Use

1. **Connect Wallet**
   - Click any wallet connector (MetaMask, WalletConnect, or Coinbase Wallet)
   - Approve the connection in your wallet

2. **Load NFT**
   - Click "Load Ape NFT" or "Load Mutant NFT" to test with mock data
   - Or connect to your actual NFTs (coming soon)

3. **Choose Mutation Type**
   - Select from 6 mutation types:
     - **Cyberpunk Evolution** (Common - 0.01 ETH)
     - **Undead Mutation** (Common - 0.015 ETH)
     - **Cosmic Horror** (Rare - 0.025 ETH)
     - **Dragon Metamorphosis** (Rare - 0.03 ETH)
     - **Crystal Entity** (Legendary - 0.05 ETH)
     - **Void Walker** (Legendary - 0.08 ETH)

4. **Begin Mutation**
   - Click "Begin Mutation"
   - Gemini AI will analyze your NFT and generate:
     - Enhanced mutation prompt
     - Mutation description
     - New trait attributes
     - Epic backstory/lore
     - Quality validation

5. **Mint Mutated NFT**
   - Review the mutation details
   - Proceed to mint (feature in development)

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS v3
- **Blockchain**: Wagmi + Viem
- **AI**: Google Gemini 2.5 Flash (with image understanding)
- **Wallet Support**: MetaMask, WalletConnect, Coinbase Wallet

## 📋 Features

### Current Features ✅

- Wallet connection (MetaMask, WalletConnect, Coinbase)
- AI-powered mutation analysis with Gemini
- 6 unique mutation types with different rarities
- Mutation lore generation
- Quality validation
- Mock NFT testing

### Coming Soon 🚧

- Smart contract integration for minting
- IPFS upload for mutated NFTs
- Real NFT fetching from user wallets
- Actual image mutation/transformation
- Mutation history tracking
- Mutation marketplace

## 🔧 Troubleshooting

### "Gemini API Not Available" Error

- Make sure you've created `.env.local` file
- Verify your `VITE_GEMINI_API_KEY` is correctly set
- Restart the dev server after adding the key

### CORS/Image Loading Issues

- The app uses fallback mechanisms for CORS-restricted images
- Try the alternative mock NFT if one fails
- For production, images must support CORS or use a proxy

### Wallet Not Connecting

- Ensure you have MetaMask or another Web3 wallet installed
- Check that you're on a supported network (Base or Ethereum Mainnet)
- Refresh the page and try again

## 📦 Build for Production

```bash
npm run build
npm run preview
```

## 🧪 Development Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run Biome linter
```

## 🤝 Contributing

This is a production project. All functions must be fully implemented with no placeholders.

## 📄 License

MIT
