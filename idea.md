# 🎨 Carplets - Personalized Farcaster NFTs

## Overview

Generate your personalized **Carplet** - a unique NFT representing your Farcaster identity! This project creates AI-generated personality-based NFTs on Celo blockchain using your Farcaster profile data.

**Key Features:**

- One NFT per Farcaster ID (FID)
- Token ID matches your FID
- AI-generated based on your profile personality
- Built on Celo blockchain
- Max supply: 10,000 Carplets

**Mint Fee:** Free (for now)

---

## 🎯 Objective

Create a Farcaster Mini App that:

1. Connects the user's wallet (Celo network).
2. Verifies FID ownership using Neynar API.
3. Fetches user's Farcaster profile data and personality traits.
4. Generates a **personalized AI avatar** based on their profile.
5. Uploads the image + metadata to **IPFS** via Pinata.
6. Mints a **Carplet NFT** with the user's FID as token ID.
7. Prevents duplicate mints (1 Carplet per FID).

---

## ⚙️ Architecture

| Layer              | Responsibility                                                                    | Tools                                             |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Frontend**       | Wallet connection, FID verification, personality analysis, AI generation, minting | React, Wagmi, Neynar API, Tailwind, Farcaster SDK |
| **Smart Contract** | FID-based minting, duplicate prevention, max supply control, funds withdrawal     | Solidity 0.8.20, OpenZeppelin ERC-721, Celo       |
| **AI Generation**  | Personality-based image generation from Farcaster profile data                    | Google Gemini 2.5 Flash Image                     |
| **Storage**        | Immutable storage for Carplet images & metadata                                   | IPFS via Pinata                                   |
| **Data Source**    | Farcaster user data, FID verification, wallet ownership validation                | Neynar API v2                                     |

---

## 🔄 User Flow

1. **Connect Wallet** → User connects wallet or uses Farcaster Mini App auto-connect.
2. **FID Detection** → App detects user's FID from Farcaster context or manual entry.
3. **Ownership Verification** → Verify the connected wallet owns the FID (via Neynar).
4. **Duplicate Check** → Ensure the FID hasn't already been minted.
5. **Profile Analysis** → Fetch user's Farcaster data and extract personality traits.
6. **AI Generation** → Generate personalized Carplet image using Gemini AI.
7. **IPFS Upload** → Upload image and metadata to Pinata.
8. **Mint Carplet** → Mint NFT with FID as token ID on Celo.
9. **Success & Share** → Show minted Carplet with Farcaster sharing option.

---

## 🧠 Mutation Logic (Hybrid Model)

The hybrid approach uses **off-chain visual mutation** + **on-chain origin recording**.

### Off-Chain (Frontend)

- Fetch NFT₁ metadata + image.
- Apply mutation visually (filters, overlays, animation).
- Generate new metadata JSON:
  ```json
  {
    "name": "Mutated #123",
    "description": "A mutation of token #123",
    "image": "ipfs://Qm...mutated.png"
  }
  ```
