import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  getContractBalance,
  getContractOwner,
  withdrawTreasury,
} from "../services/treasuryService";

export default function AdminPanel() {
  const { address, isConnected } = useAccount();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<`0x${string}` | null>(null);

  const [balanceEth, setBalanceEth] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const shortAddr = useMemo(() => {
    if (!ownerAddress) return "";
    return `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`;
  }, [ownerAddress]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!isConnected || !address) return;
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const [owner, bal] = await Promise.all([
          getContractOwner(),
          getContractBalance(),
        ]);
        if (!mounted) return;
        setOwnerAddress(owner);
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
        setBalanceEth(bal.eth);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.shortMessage || e?.message || "Failed to load admin data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [isConnected, address]);

  if (!isConnected || isOwner === false) {
    return null; // hidden for non-owners
  }

  // While determining ownership, render a subtle skeleton
  if (isOwner === null) {
    return (
      <div className="mb-4">
        <div className="bg-gradient-to-br from-yellow-900/20 to-amber-800/10 border border-yellow-600/30 rounded-2xl p-4 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="bg-gradient-to-br from-yellow-900/20 to-amber-800/10 border border-yellow-600/30 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-600/20 text-yellow-300 text-xs font-bold">
              ⚡
            </span>
            <h2 className="text-sm font-bold text-yellow-300 tracking-wide">
              Admin Treasury
            </h2>
          </div>
          {ownerAddress && (
            <div className="text-[10px] text-yellow-200/70">
              Owner: {shortAddr}
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/30 border border-red-700/40 rounded-lg p-2 mb-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-emerald-200 bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-2 mb-2">
            {success}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-yellow-200/90">
            Treasury balance
            <div className="text-lg font-semibold text-yellow-300">
              {loading ? (
                <span className="animate-pulse">…</span>
              ) : (
                `${Number(balanceEth).toFixed(4)} ETH`
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const bal = await getContractBalance();
                  setBalanceEth(bal.eth);
                } catch (e: any) {
                  setError(
                    e?.shortMessage ||
                      e?.message ||
                      "Failed to refresh balance."
                  );
                } finally {
                  setLoading(false);
                }
              }}
              className="px-3 py-2 text-xs rounded-lg bg-yellow-700/30 text-yellow-200 hover:bg-yellow-700/40 border border-yellow-600/40 disabled:opacity-60"
            >
              Refresh
            </button>
            <button
              disabled={withdrawing || loading || Number(balanceEth) <= 0}
              onClick={async () => {
                setWithdrawing(true);
                setError(null);
                setSuccess(null);
                try {
                  const hash = await withdrawTreasury();
                  setSuccess(
                    `Withdrawal sent. Tx: ${hash.slice(0, 8)}…${hash.slice(-6)}`
                  );
                  // refresh balance after success
                  const bal = await getContractBalance();
                  setBalanceEth(bal.eth);
                } catch (e: any) {
                  const msg: string =
                    e?.shortMessage || e?.message || "Withdrawal failed.";
                  if (msg.toLowerCase().includes("user rejected")) {
                    setError("Transaction cancelled.");
                  } else if (
                    msg.toLowerCase().includes("unauthorized") ||
                    msg.toLowerCase().includes("onlyowner")
                  ) {
                    setError("Only the owner can withdraw.");
                  } else {
                    setError(msg);
                  }
                } finally {
                  setWithdrawing(false);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-yellow-500 text-slate-900 hover:bg-yellow-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(245,158,11,0.25)]"
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
