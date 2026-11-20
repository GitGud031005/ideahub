"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, MonitorUp, Plus } from "lucide-react";
import styles from "./meeting-room.module.css";

const FIT = 100;
const MAX_ZOOM = 300;
const STEP = 25;

export function MeetingPresentation({ children, presenters, presenterId, selectPresenter }: {
  children: ReactNode;
  presenters: { id: string; name: string }[];
  presenterId: string;
  selectPresenter: (identity: string) => void;
}) {
  const [zoom, setZoom] = useState(FIT);
  const viewport = useRef<HTMLDivElement>(null);
  const scale = useRef(zoom);
  const anchor = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const presenter = presenters.find(person => person.id === presenterId);

  const zoomTo = useCallback((value: number, point?: { x: number; y: number }) => {
    const pane = viewport.current;
    const next = Math.min(MAX_ZOOM, Math.max(FIT, value));
    if (!pane || next === scale.current) return;
    const left = point?.x ?? pane.clientWidth / 2;
    const top = point?.y ?? pane.clientHeight / 2;
    anchor.current = {
      x: (pane.scrollLeft + left) / Math.max(1, pane.clientWidth * scale.current / FIT),
      y: (pane.scrollTop + top) / Math.max(1, pane.clientHeight * scale.current / FIT),
      left, top,
    };
    setZoom(next);
  }, []);

  useLayoutEffect(() => {
    scale.current = zoom;
    const pane = viewport.current;
    const point = anchor.current;
    if (!pane || !point) return;
    pane.scrollLeft = point.x * pane.scrollWidth - point.left;
    pane.scrollTop = point.y * pane.scrollHeight - point.top;
    anchor.current = null;
  }, [zoom]);

  useEffect(() => {
    const pane = viewport.current;
    if (!pane) return;
    function wheel(event: WheelEvent) {
      if (!event.deltaY || event.shiftKey || !pane) return;
      event.preventDefault();
      const bounds = pane.getBoundingClientRect();
      zoomTo(scale.current + (event.deltaY < 0 ? STEP : -STEP), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }
    pane.addEventListener("wheel", wheel, { passive: false });
    return () => pane.removeEventListener("wheel", wheel);
  }, [zoomTo]);

  return <section className={styles.presentation} aria-label="Phần trình chiếu">
    <div className={styles.presentationBar}>
      {presenters.length > 1
        ? <select aria-label="Chọn màn hình trình chiếu" value={presenterId} onChange={event => selectPresenter(event.target.value)}>
          {presenters.map(person => <option key={person.id} value={person.id}>Màn hình của {person.name}</option>)}
        </select>
        : <p title={`Màn hình của ${presenter?.name}`} aria-label={`Màn hình của ${presenter?.name}`}>
          <MonitorUp size={16} aria-hidden="true" /><span>{presenter?.name}</span>
        </p>}
      <div className={styles.zoomControls} role="group" aria-label="Thu phóng trình chiếu">
        <button type="button" aria-label="Thu nhỏ" disabled={zoom === FIT} onClick={() => zoomTo(zoom - STEP)}><Minus size={16} aria-hidden="true" /></button>
        <output aria-label="Mức thu phóng">{zoom}%</output>
        <button type="button" aria-label="Phóng to" disabled={zoom === MAX_ZOOM} onClick={() => zoomTo(zoom + STEP)}><Plus size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Vừa khung" title="Vừa khung" disabled={zoom === FIT} onClick={() => zoomTo(FIT)}><Maximize size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <div ref={viewport} className={styles.presentationViewport} data-zoomed={zoom > FIT}
      role="region" tabIndex={zoom > FIT ? 0 : -1} aria-label="Màn hình trình chiếu"
      onPointerDown={event => {
        if (zoom === FIT || event.pointerType !== "mouse" || event.button !== 0) return;
        const pane = event.currentTarget;
        drag.current = { x: event.clientX, y: event.clientY, left: pane.scrollLeft, top: pane.scrollTop };
        pane.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start) return;
        event.currentTarget.scrollLeft = start.left + start.x - event.clientX;
        event.currentTarget.scrollTop = start.top + start.y - event.clientY;
      }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <div className={styles.presentationFrame} style={{ width: `${zoom}%`, height: `${zoom}%` }}>{children}</div>
    </div>
  </section>;
}
