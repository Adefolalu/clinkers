import { useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { clinkers } from "../constants/Abi";
import { fetchUserByFid } from "../services/neynarService";

interface MintEvent {
  fid: number;
  txHash: string;
  username?: string;
  pfpUrl?: string;
}

export function RecentMints() {
  const [mints, setMints] = useState<MintEvent[]>([]);
  const [, setLoading] = useState(true);
  const publicClient = usePublicClient();

  // Fetch initial logs (last 5)
  useEffect(() => {
    if (!publicClient) return;

    const fetchLogs = async () => {
      setLoading(true);
      try {
        // Only fetch last 10 blocks (Alchemy free tier limit)
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 9n; // 10 block range

        console.log(
          "📊 Fetching recent logs from block",
          fromBlock,
          "to",
          currentBlock
        );

        const logs = await publicClient.getContractEvents({
          address: clinkers.address as `0x${string}`,
          abi: clinkers.abi,
          eventName: "ClinkerMinted",
          fromBlock,
          toBlock: currentBlock,
        });

        console.log("📋 Total logs found:", logs.length);

        // Take last 5 logs and reverse to show newest first
        const recentLogs = logs.slice(-5).reverse();

        const mintsData: MintEvent[] = await Promise.all(
          recentLogs.map(async (log) => {
            // @ts-ignore - args type inference
            const fid = Number(log.args.fid);
            const user = await fetchUserByFid(fid);
            const mint: MintEvent = {
              fid,
              txHash: log.transactionHash ?? "",
              username: user?.username || `FID: ${fid}`,
              pfpUrl: user?.pfp_url,
            };
            return mint;
          })
        );

        console.log("🎉 Recent mints:", mintsData);
        setMints(mintsData);
      } catch (error) {
        console.error("Error fetching logs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [publicClient]);

  // Watch for new mints
  useWatchContractEvent({
    address: clinkers.address as `0x${string}`,
    abi: clinkers.abi,
    eventName: "ClinkerMinted",
    onLogs: async (logs) => {
      const newMints: MintEvent[] = await Promise.all(
        logs.map(async (log) => {
          // @ts-ignore
          const fid = Number(log.args.fid);
          const user = await fetchUserByFid(fid);
          const mint: MintEvent = {
            fid,
            txHash: log.transactionHash ?? "",
            username: user?.username || `FID: ${fid}`,
            pfpUrl: user?.pfp_url,
          };
          return mint;
        })
      );

      setMints((prev) => [...newMints, ...prev].slice(0, 5));
    },
  });

  if (mints.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto mb-6 overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent z-10" />

      <div className="flex gap-3 animate-marquee whitespace-nowrap hover:[animation-play-state:paused]">
        {/* Duplicate list for seamless loop if needed, but simple scroll is fine for now */}
        {mints.map((mint) => (
          <a
            key={mint.txHash}
            href={`https://basescan.org/tx/${mint.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-full pl-1 pr-3 py-1 border border-white/10 transition-colors"
          >
            {mint.pfpUrl ? (
              <img
                src={mint.pfpUrl}
                alt={mint.username}
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-purple-500/50" />
            )}
            <span className="text-xs text-purple-200">
              <span className="font-bold text-white">{mint.username}</span> just
              minted!
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
