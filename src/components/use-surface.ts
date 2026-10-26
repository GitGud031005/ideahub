"use client";
import { useEffect, useId, useRef } from "react";

const eventName = "ideahub:surface-open";
/** Transient menus yield to one another while preserving the editor's draft. */
export function useSurface(open: boolean, dismiss: () => void) {
  const id = useId(), latestDismiss = useRef(dismiss);
  latestDismiss.current = dismiss;
  useEffect(() => {
    const close = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) latestDismiss.current();
    };
    window.addEventListener(eventName, close);
    return () => window.removeEventListener(eventName, close);
  }, [id]);
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent(eventName, { detail: id }));
  }, [open, id]);
}
