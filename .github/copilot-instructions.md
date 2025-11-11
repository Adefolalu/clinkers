# Copilot Instructions for The-clinkers

## Project Overview
- **Clinkers** is a Farcaster-integrated NFT mini-app built on the Base blockchain. Each NFT (Clinker) is generated using AI based on a user's Farcaster profile and activity.
- The app is a Vite project, bootstrapped with `@farcaster/create-mini-app`.
- Main features: One NFT per Farcaster ID (FID), token ID equals FID, AI-generated images, max supply 10,000.

## Architecture & Key Files
- **Frontend:** React (TypeScript) in `src/`.
  - `App.tsx`, `main.tsx`: App entry points.
  - `components/CarpletGeneratorComponent.tsx`: Core UI/logic for generating and minting Clinkers.
- **Smart Contract:** `contracts/Clinkers.sol` (not covered here, but referenced via ABI in `src/constants/Abi.ts`).
- **Services:**
  - `services/neynarService.ts`: Farcaster API integration, user/cast fetching, personality trait extraction, prompt generation.
  - `services/imageGeneration.ts`: AI image generation logic.
  - `services/ipfs.ts`: IPFS upload helpers.
  - `services/mintService.ts`: Handles minting logic, Base chain switching, contract calls.

## Data Flow
1. **User connects wallet** (via wagmi).
2. **Farcaster FID is detected** (from context or manual input).
3. **User data/casts fetched** from Neynar API.
4. **Personality traits extracted** and used to generate a custom AI prompt.
5. **Image generated** and uploaded to IPFS.
6. **Metadata created** and uploaded to IPFS.
7. **Mint transaction sent** to Base contract; token ID = FID.
8. **Minted NFT metadata/image displayed**; user can share on Farcaster.

## Developer Workflows
- **Build:**
  - `npm install` to install dependencies.
  - `npm run dev` for local development (Vite server).
  - `npm run build` for production build.
- **Environment Variables:**
  - Set `VITE_NEYNAR_API_KEY` and `VITE_PINATA_GATEWAY_DOMAIN` in `.env` for API and IPFS gateway access.
- **Testing:** No formal test suite detected; manual testing via UI and contract interactions.

## Project-Specific Patterns & Conventions
- **Minting:**
  - Only one Clinker per FID; contract enforces uniqueness.
  - Mint fee is read from contract (`mintFee`), and user must have enough ETH on Base.
  - Wallet ownership of FID is verified before minting (see `verifyFidOwnership`).
- **AI Prompt Generation:**
  - Personality traits and interests are extracted from Farcaster profile and casts.
  - Deterministic design spec (colors, silhouette, accessories) generated per user.
  - Prompt includes strict rendering rules for AI image generation.
- **IPFS:**
  - Images and metadata uploaded via Pinata gateway.
  - IPFS URIs are mapped to HTTP gateway URLs for display.
- **Sharing:**
  - After mint, users can share their Carplet on Farcaster using the mini-app SDK.

## Integration Points
- **Farcaster:** User context, profile/cast data, sharing via SDK.
- **Base Blockchain:** NFT minting, contract calls via wagmi.
- **IPFS (Pinata):** Storage for images and metadata.
- **AI Image Generation:** Service abstraction for prompt-based image creation.

## Examples
- See `CarpletGeneratorComponent.tsx` for the full minting flow, wallet/FID checks, and UI logic.
- See `neynarService.ts` for trait extraction and prompt generation logic.
- See `mintService.ts` for contract interaction and chain switching.

---

**For AI agents:**
- Always verify FID ownership before minting.
- Use deterministic prompt and design spec generation for image creation.
- Respect the one-per-FID minting rule enforced by the contract.
- Use provided service abstractions for API, blockchain, and storage interactions.
- Reference the README and service files for up-to-date workflow and integration details.
