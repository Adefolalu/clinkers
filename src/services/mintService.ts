import { base } from "wagmi/chains";
import { parseEther } from "viem";
import {
  getChainId,
  switchChain,
  writeContract,
  waitForTransactionReceipt,
} from "wagmi/actions";
import { config } from "../wagmi";
import { clinkers, clinkersContractAddress, clinkersabi } from "../constants/Abi";
import { decodeEventLog } from "viem";

export interface MintArgs {
  fid: bigint | number | string;
  metadataURI: string; // ipfs://...
  feeEth?: string; // default free (0)
}

export interface MintResult {
  hash: `0x${string}`;
  fid: bigint;
}

async function ensureBase(): Promise<void> {
  const current = getChainId(config);
  if (current !== base.id) {
    await switchChain(config, { chainId: base.id });
  }
}

export async function mintCarplet(args: MintArgs): Promise<MintResult> {
  await ensureBase();

  const value = parseEther(args.feeEth ?? "0");
  const fid = typeof args.fid === "bigint" ? args.fid : BigInt(args.fid);

  const hash = await writeContract(config, {
    address: clinkers.address as `0x${string}`,
    abi: clinkers.abi as any,
    functionName: "mint",
    args: [fid, args.metadataURI],
    value,
    chainId: base.id,
  });

  const receipt = await waitForTransactionReceipt(config, { hash });

  // Try to parse ClinkerMinted event
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: clinkers.abi as any,
        data: log.data,
        topics: log.topics,
      }) as any;
      if (decoded?.eventName === "ClinkerMinted") {
        const args = decoded.args as {
          fid: bigint;
          minter: `0x${string}`;
          level: number;
          metadataURI: string;
        };
        return { hash, fid: args.fid };
      }
    } catch {
      // not our event
    }
  }

  return { hash, fid };
}

export interface MintClinkerArgs {
  fid: bigint | number | string;
  metadataURI: string;
  initialLevel: number;
  feeEth?: string; // base mint fee (not upgrade)
}

export async function mintClinker(args: MintClinkerArgs): Promise<MintResult> {
  await ensureBase();

  const value = parseEther(args.feeEth ?? "0");
  const fid = typeof args.fid === "bigint" ? args.fid : BigInt(args.fid);

  const hash = await writeContract(config, {
    address: clinkersContractAddress as `0x${string}`,
    abi: clinkersabi as any,
    functionName: "mint",
    args: [fid, args.metadataURI, args.initialLevel],
    value,
    chainId: base.id,
  });

  const receipt = await waitForTransactionReceipt(config, { hash });

  // Try to parse ClinkerMinted event
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: clinkersabi as any,
        data: log.data,
        topics: log.topics,
      }) as any;
      if (decoded?.eventName === "ClinkerMinted") {
        const args = decoded.args as {
          fid: bigint;
          minter: `0x${string}`;
          level: number;
          metadataURI: string;
        };
        return { hash, fid: args.fid };
      }
    } catch {
      // not our event
    }
  }

  return { hash, fid };
}

export interface UpgradeClinkerArgs {
  fid: bigint | number | string;
  newLevel: number;
  metadataURI: string;
  feeEth?: string; // exact upgrade price in ETH as string
}

export async function upgradeClinker(args: UpgradeClinkerArgs): Promise<MintResult> {
  await ensureBase();

  const value = parseEther(args.feeEth ?? "0");
  const fid = typeof args.fid === "bigint" ? args.fid : BigInt(args.fid);

  const hash = await writeContract(config, {
    address: clinkersContractAddress as `0x${string}`,
    abi: clinkersabi as any,
    functionName: "upgradeNft",
    args: [fid, args.newLevel, args.metadataURI],
    value,
    chainId: base.id,
  });

  const receipt = await waitForTransactionReceipt(config, { hash });

  // Try to parse ClinkerUpgraded event
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: clinkersabi as any,
        data: log.data,
        topics: log.topics,
      }) as any;
      if (decoded?.eventName === "ClinkerUpgraded") {
        const args = decoded.args as {
          fid: bigint;
          owner: `0x${string}`;
          oldLevel: number;
          newLevel: number;
          metadataURI: string;
        };
        return { hash, fid: args.fid };
      }
    } catch {
      // not our event
    }
  }

  return { hash, fid };
}
