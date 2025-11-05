# 🧬 Mutant Warpletss - NFT Mutation Project

## Overview

Transform your **Warplet** into a **Mutant Warplets**! This project allows Warplet holders to mutate their NFTs using AI, creating unique variations while maintaining on-chain provenance.

**Original Collection:** The Warplets (`0x699727F9E01A822EFdcf7333073f0461e5914b4E` on Base)

- Farcaster's unofficial mascot
- 27,058 unique Warplets
- Dynamically generated from Farcaster profiles

**Mutation Fee:** 0.00037 ETH

---

## 🎯 Objective

Create a simple web app that:

1. Connects the user's wallet (Base network).
2. Fetches Warplets owned by the user from `0x699727F9E01A822EFdcf7333073f0461e5914b4E`.
3. Displays a **mutated preview** of that NFT image (via animation or filters).
4. Uploads the new image + metadata to **IPFS**.
5. Allows the user to **mint** a new NFT (NFT₂) representing the mutation.
6. Records the **on-chain link** between NFT₁ → NFT₂.

---

## ⚙️ Architecture

| Layer              | Responsibility                                                                | Tools                                                           |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Frontend**       | Wallet connection, NFT fetch, visual mutation, IPFS upload, mint interaction. | React, Wagmi, Alchemy SDK, Framer Motion, Tailwind, NFT.Storage |
| **Smart Contract** | Payable mint function, origin tracking, event emission, funds withdrawal.     | Solidity 0.8.17, OpenZeppelin ERC-721                           |
| **Storage**        | Immutable storage for mutated NFT image & metadata.                           | IPFS / Pinata / NFT.Storage                                     |

---

## 🔄 User Flow

1. **Connect Wallet** → User connects via MetaMask using Wagmi.
2. **Fetch NFT₁** → App retrieves NFTs owned by the user (via Alchemy).
3. **Select + Preview Mutation** → The user sees their NFT mutate visually (e.g., glitch, glow, morph).
4. **Confirm & Mint** → User clicks “Mint Mutated NFT” and pays the mint fee.
5. **Contract Interaction** → The mint function mints NFT₂ and records NFT₁ as its origin.
6. **Success Display** → UI confirms transaction and shows the newly minted NFT₂.

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
