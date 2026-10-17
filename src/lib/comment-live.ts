interface LiveCallbacks {
  changed: () => void;
  connected: (value: boolean) => void;
  expired: () => void;
}

/** One stream per visible discussion; EventSource handles transient reconnects. */
export function watchComments(ideaId: string, callbacks: LiveCallbacks) {
  let source: EventSource | undefined, stopped = false;
  function disconnect() {
    source?.close();
    source = undefined;
    callbacks.connected(false);
  }
  function connect() {
    if (stopped || document.hidden || !navigator.onLine) { disconnect(); return; }
    if (source || typeof EventSource === "undefined") return;
    const current = source = new EventSource(`/api/ideas/${encodeURIComponent(ideaId)}/comments/stream`);
    current.onopen = () => { if (source === current) callbacks.connected(true); };
    current.onerror = () => { if (source === current) callbacks.connected(false); };
    current.addEventListener("comments-changed", () => { if (source === current) callbacks.changed(); });
    current.addEventListener("stream-error", () => { if (source === current) callbacks.connected(false); });
    current.addEventListener("auth-required", () => {
      if (source !== current) return;
      stopped = true;
      disconnect();
      callbacks.expired();
    });
  }
  document.addEventListener("visibilitychange", connect);
  window.addEventListener("online", connect);
  window.addEventListener("offline", connect);
  connect();
  return () => {
    stopped = true;
    disconnect();
    document.removeEventListener("visibilitychange", connect);
    window.removeEventListener("online", connect);
    window.removeEventListener("offline", connect);
  };
}
