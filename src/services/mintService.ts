import { celo } from "wagmi/chains";
import { parseEther } from "viem";
import {
  getChainId,
  switchChain,
  writeContract,
  waitForTransactionReceipt,
} from "wagmi/actions";
import { config } from "../wagmi";
import { carplets } from "../constants/Abi";
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

async function ensureCelo(): Promise<void> {
  const current = getChainId(config);
  if (current !== celo.id) {
    await switchChain(config, { chainId: celo.id });
  }
}

export async function mintCarplet(args: MintArgs): Promise<MintResult> {
  await ensureCelo();

  const value = parseEther(args.feeEth ?? "0");
  const fid = typeof args.fid === "bigint" ? args.fid : BigInt(args.fid);

  const hash = await writeContract(config, {
    address: carplets.address as `0x${string}`,
    abi: carplets.abi as any,
    functionName: "mint",
    args: [fid, args.metadataURI],
    value,
    chainId: celo.id,
  });

  const receipt = await waitForTransactionReceipt(config, { hash });

  // Try to parse CarpletMinted event
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: carplets.abi as any,
        data: log.data,
        topics: log.topics,
      }) as any;
      if (decoded?.eventName === "CarpletMinted") {
        const args = decoded.args as {
          fid: bigint;
          minter: `0x${string}`;
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
