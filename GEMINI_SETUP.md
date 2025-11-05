# Gemini API Setup & Fallback System

## 🎯 Current Status

Your NFT mutation system is now equipped with:

### ✅ What's Working:

1. **Fallback Mode** - When Gemini API quota is exceeded, the system automatically switches to pre-generated mutation data
2. **6 Mutation Types** with detailed fallback lore and traits
3. **Local Image Support** - Using `/.well-known/download.jpeg`
4. **Multiple Wallet Connectors** - MetaMask, WalletConnect, Coinbase Wallet
5. **Error Handling** - Graceful degradation when API limits are hit

### 🔧 How It Works:

#### When Gemini API is Available:

- Generates custom AI-powered mutation descriptions
- Creates unique backstories and lore
- Analyzes NFT metadata for personalized transformations

#### When Quota is Exceeded (Fallback Mode):

- Uses pre-written, high-quality mutation descriptions
- Provides themed lore for each mutation type
- Maintains full functionality without API calls
- Shows warning banner to users

## 🚀 Getting Started

### 1. Get a Gemini API Key (Optional)

If you want AI-powered mutations, get a free API key:

- Visit: https://makersuite.google.com/app/apikey
- Create an account
- Generate an API key

### 2. Set Up Environment Variables

Create a `.env.local` file:

```bash
# Gemini API (Optional - fallback mode works without it)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# WalletConnect (Optional - for WalletConnect support)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### 3. Run the Development Server

```bash
npm run dev
```

Visit: http://localhost:5173/

## 📊 Mutation Types & Costs

| Mutation             | Rarity    | Cost      | Description                    |
| -------------------- | --------- | --------- | ------------------------------ |
| Cyberpunk Evolution  | Common    | 0.01 ETH  | Futuristic neon enhancements   |
| Undead Mutation      | Common    | 0.015 ETH | Zombie transformation          |
| Cosmic Horror        | Rare      | 0.025 ETH | Eldritch otherworldly features |
| Dragon Metamorphosis | Rare      | 0.03 ETH  | Epic dragon transformation     |
| Crystal Entity       | Legendary | 0.05 ETH  | Crystalline being              |
| Void Walker          | Legendary | 0.08 ETH  | Dark entity from the void      |

## 🛠️ Testing Without API Key

The app works perfectly in fallback mode:

1. Connect your wallet (MetaMask recommended)
2. Click "Load NFT #123" or "Load NFT #456"
3. Select a mutation type
4. Click "Begin [Mutation Name] Mutation"
5. View the generated mutation data (using fallback system)

## ⚠️ Handling API Quotas

### Free Tier Limits:

- **Requests**: Limited per minute/day
- **Tokens**: Limited input tokens per minute

### When Quota is Exceeded:

- System automatically detects quota errors (429 status)
- Switches to fallback mode
- Shows yellow warning banner
- All functionality continues working
- No data loss or errors

### Tips to Avoid Quota Issues:

1. Use fallback mode for testing
2. Upgrade to paid tier if needed
3. Wait 30 seconds between API calls
4. The fallback content is actually quite good!

## 📝 Next Steps

### Ready for Production:

- [ ] Add actual NFT fetching from wallet
- [ ] Implement image generation (using Replicate, Stability AI, etc.)
- [ ] Add IPFS upload for mutated images
- [ ] Deploy smart contract for minting
- [ ] Connect minting functionality to UI
- [ ] Add payment processing

### Nice to Have:

- [ ] Preview mutations before committing
- [ ] Save mutation history
- [ ] Social sharing features
- [ ] Rarity scoring system
- [ ] Multi-generation mutation chains

## 🐛 Troubleshooting

### "Gemini API Not Available"

- Check if `.env.local` exists
- Verify `VITE_GEMINI_API_KEY` is set
- Restart the dev server after adding env variables

### "Quota Exceeded" Error

- This is normal for free tier
- Fallback mode activates automatically
- Consider upgrading API plan or using fallback mode

### Image Not Loading

- Verify image exists at `/public/.well-known/download.jpeg`
- Check browser console for 404 errors
- Ensure dev server is running

## 💡 Pro Tips

1. **Fallback Mode is Production-Ready**: The pre-written lore is actually engaging and consistent
2. **Mix and Match**: Use AI for some mutations, fallback for others
3. **Rate Limiting**: Implement client-side rate limiting to avoid quota issues
4. **Caching**: Cache AI responses to reduce API calls

---

Built with ❤️ using React, Wagmi, Vite, and Gemini AI
