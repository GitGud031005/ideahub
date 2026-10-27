"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { watchComments } from "@/lib/comment-live";

export function useLiveComments(ideaId: string, userId: string | undefined, enabled: boolean) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(false);
    if (!enabled || !userId) return;
    let disposed = false, refreshing = false, changedAgain = false;
    const key = ["comments", ideaId, userId];
    async function refresh() {
      changedAgain = true;
      if (refreshing) return;
      refreshing = true;
      do {
        changedAgain = false;
        // Finish any older snapshot, then refresh once more so an event during a fetch is not lost.
        const fetching = client.isFetching({ queryKey: key }) > 0;
        await Promise.allSettled([
          client.invalidateQueries({ queryKey: key }, { cancelRefetch: false }),
          client.invalidateQueries({ queryKey: ["unread-comments", ideaId, userId] }, { cancelRefetch: false }),
          client.invalidateQueries({ queryKey: ["idea", ideaId] }, { cancelRefetch: false }),
          client.invalidateQueries({ queryKey: ["notifications",userId] }, { cancelRefetch: false }),
          client.invalidateQueries({ queryKey: ["ideas"] }, { cancelRefetch: false }),
        ]);
        if (fetching) changedAgain = true;
      } while (changedAgain && !disposed);
      refreshing = false;
    }
    const stop = watchComments(ideaId, {
      connected: setConnected,
      changed: () => { void refresh(); },
      expired: () => window.dispatchEvent(new Event("ideahub:auth-required")),
    });
    return () => { disposed = true; stop(); };
  }, [client, ideaId, userId, enabled]);
  // HTTP fallback also handles proxies/browsers that cannot stream SSE.
  return connected ? 30000 : 3000;
}
