"use client";
import { useEffect } from "react";

/** Keep mobile dialogs and the composer inside the area above the software keyboard. */
export function useMobileViewport() {
  useEffect(() => {
    const root=document.documentElement, viewport=window.visualViewport;
    let frame=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        // Pinch zoom must remain available without resizing the application underneath it.
        if(viewport && viewport.scale>1.05)return;
        root.style.setProperty("--ih-viewport-height",`${viewport?.height??window.innerHeight}px`);
        root.style.setProperty("--ih-viewport-top",`${viewport?.offsetTop??0}px`);
      });
    };
    update();window.addEventListener("resize",update);viewport?.addEventListener("resize",update);viewport?.addEventListener("scroll",update);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",update);viewport?.removeEventListener("resize",update);viewport?.removeEventListener("scroll",update);root.style.removeProperty("--ih-viewport-height");root.style.removeProperty("--ih-viewport-top");};
  },[]);
}
