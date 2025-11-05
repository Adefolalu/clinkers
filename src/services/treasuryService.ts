import { base } from "wagmi/chains";
import {
  getBalance,
  getChainId,
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { config } from "../wagmi";
import { mutantWarplet } from "../constants/Abi";
import { formatEther } from "viem";

async function ensureBase(): Promise<void> {
  const current = getChainId(config);
  if (current !== base.id) {
    await switchChain(config, { chainId: base.id });
  }
}

export async function getContractOwner(): Promise<`0x${string}`> {
  const owner = (await readContract(config, {
    address: mutantWarplet.address as `0x${string}`,
    abi: mutantWarplet.abi as any,
    functionName: "owner",
    args: [],
    chainId: base.id,
  })) as `0x${string}`;
  return owner;
}

export async function getContractBalance(): Promise<{
  wei: bigint;
  eth: string;
}> {
  const balance = await getBalance(config, {
    address: mutantWarplet.address as `0x${string}`,
    chainId: base.id,
  });
  // getBalance returns { value, decimals, formatted, symbol }, but we also return raw wei
  return { wei: balance.value, eth: formatEther(balance.value) };
}

export async function withdrawTreasury(): Promise<`0x${string}`> {
  await ensureBase();
  const hash = await writeContract(config, {
    address: mutantWarplet.address as `0x${string}`,
    abi: mutantWarplet.abi as any,
    functionName: "withdraw",
    args: [],
    chainId: base.id,
  });
  await waitForTransactionReceipt(config, { hash });
  return hash;
}
