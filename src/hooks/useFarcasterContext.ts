import { sdk } from "@farcaster/frame-sdk";
import { useEffect, useState } from "react";

export interface FarcasterContext {
  fid: number | null;
  username: string | null;
  isLoading: boolean;
  isSDKLoaded: boolean;
  error: string | null;
}

export function useFarcasterContext() {
  const [context, setContext] = useState<FarcasterContext>({
    fid: null,
    username: null,
    isLoading: true,
    isSDKLoaded: false,
    error: null,
  });

  useEffect(() => {
    async function fetchContext() {
      try {
        const ctx = await sdk.context;

        if (ctx?.user?.fid) {
          setContext({
            fid: ctx.user.fid,
            username: ctx.user.username || null,
            isLoading: false,
            isSDKLoaded: true,
            error: null,
          });
        } else {
          setContext({
            fid: null,
            username: null,
            isLoading: false,
            isSDKLoaded: true,
            error: "No Farcaster user context found",
          });
        }
      } catch (error) {
        console.error("Failed to get Farcaster context:", error);
        setContext({
          fid: null,
          username: null,
          isLoading: false,
          isSDKLoaded: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    fetchContext();
  }, []);

  return context;
}
