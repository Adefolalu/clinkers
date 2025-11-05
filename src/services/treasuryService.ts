import { celo } from "wagmi/chains";
import {
  getBalance,
  getChainId,
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { config } from "../wagmi";
import { carplets } from "../constants/Abi";
import { formatEther } from "viem";

async function ensureCelo(): Promise<void> {
  const current = getChainId(config);
  if (current !== celo.id) {
    await switchChain(config, { chainId: celo.id });
  }
}

export async function getContractOwner(): Promise<`0x${string}`> {
  const owner = (await readContract(config, {
    address: carplets.address as `0x${string}`,
    abi: carplets.abi as any,
    functionName: "owner",
    args: [],
    chainId: celo.id,
  })) as `0x${string}`;
  return owner;
}

export async function getContractBalance(): Promise<{
  wei: bigint;
  eth: string;
}> {
  const balance = await getBalance(config, {
    address: carplets.address as `0x${string}`,
    chainId: celo.id,
  });
  // getBalance returns { value, decimals, formatted, symbol }, but we also return raw wei
  return { wei: balance.value, eth: formatEther(balance.value) };
}

export async function withdrawTreasury(): Promise<`0x${string}`> {
  await ensureCelo();
  const hash = await writeContract(config, {
    address: carplets.address as `0x${string}`,
    abi: carplets.abi as any,
    functionName: "withdraw",
    args: [],
    chainId: celo.id,
  });
  await waitForTransactionReceipt(config, { hash });
  return hash;
}
