"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
export function TagStrip({ tags }: { tags: string[] }) {
  const ref = useRef<HTMLDivElement>(null), drag = useRef<{ start: number; left: number; moved: boolean } | null>(null);
  const suppress = useRef(false), [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
    const wheel = (event: WheelEvent) => { if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return; const next = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + event.deltaY)); if (next !== el.scrollLeft) { event.preventDefault(); el.scrollLeft = next; } };
    const observer = new ResizeObserver(update); observer.observe(el); el.addEventListener("scroll", update); el.addEventListener("wheel", wheel, { passive: false }); update();
    return () => { observer.disconnect(); el.removeEventListener("scroll", update); el.removeEventListener("wheel", wheel); };
  }, [tags]);
  return <div className={`ih-tags-wrap${more ? " ih-has-more" : ""}`} data-tags onClick={event => { event.stopPropagation(); if (suppress.current) { event.preventDefault(); suppress.current = false; } }}>
    <div ref={ref} className="ih-tags" aria-label="Tags của ý tưởng" onPointerDown={event => { if (event.pointerType === "mouse" && event.button === 0) drag.current = { start: event.clientX, left: event.currentTarget.scrollLeft, moved: false }; }} onPointerMove={event => { const current = drag.current; if (!current) return; const delta = event.clientX - current.start; if (Math.abs(delta) > 5) { current.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); event.currentTarget.scrollLeft = current.left - delta; } }} onPointerUp={() => { suppress.current = !!drag.current?.moved; drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>{tags.map(tag => <span key={tag} className="ih-tag">{tag}</span>)}</div>
    {more && <button className="ih-tags-next" type="button" aria-label="Cuộn tags sang phải" onClick={() => ref.current?.scrollBy({ left: Math.max(80, ref.current.clientWidth * .65), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronRight size={14} aria-hidden="true" /></button>}
  </div>;
}
