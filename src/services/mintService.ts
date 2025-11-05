import { base } from "wagmi/chains";
import { parseEther } from "viem";
import {
  getChainId,
  switchChain,
  writeContract,
  waitForTransactionReceipt,
} from "wagmi/actions";
import { config } from "../wagmi";
import { mutantWarplet } from "../constants/Abi";
import { decodeEventLog } from "viem";

export interface MintArgs {
  originContract: `0x${string}`;
  originTokenId: bigint | number | string;
  metadataURI: string; // ipfs://...
  feeEth?: string; // default 0.00037
}

export interface MintResult {
  hash: `0x${string}`;
  tokenId?: bigint;
}

async function ensureBase(): Promise<void> {
  const current = getChainId(config);
  if (current !== base.id) {
    await switchChain(config, { chainId: base.id });
  }
}

export async function mintMutant(args: MintArgs): Promise<MintResult> {
  await ensureBase();

  const value = parseEther(args.feeEth ?? "0.00037");
  const originId =
    typeof args.originTokenId === "bigint"
      ? args.originTokenId
      : BigInt(args.originTokenId);

  const hash = await writeContract(config, {
    address: mutantWarplet.address as `0x${string}`,
    abi: mutantWarplet.abi as any,
    functionName: "mint",
    args: [args.originContract, originId, args.metadataURI],
    value,
    chainId: base.id,
  });

  const receipt = await waitForTransactionReceipt(config, { hash });

  // Try to parse Mutated event to get tokenId
  let tokenId: bigint | undefined = undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: mutantWarplet.abi as any,
        data: log.data,
        topics: log.topics,
      }) as any;
      if (decoded?.eventName === "Mutated") {
        const args = decoded.args as {
          tokenId: bigint;
          originContract: `0x${string}`;
          originTokenId: bigint;
          minter: `0x${string}`;
        };
        tokenId = args.tokenId;
        break;
      }
    } catch {
      // not our event
    }
  }

  return { hash, tokenId };
}
