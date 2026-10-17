"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addDays, displayDay, validDay } from "@/lib/recaps";
import { Select } from "./select";

export function DatePicker({ id, label, value, min, max, disabled, onChange }: {
  id: string; label: string; value: string; min: string; max: string;
  disabled?: boolean; onChange: (value: string) => void;
}) {
  const popupId = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [month, setMonth] = useState(value.slice(0, 7));
  const [focused, setFocused] = useState(value);
  const first = `${month}-01`, offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
  const years = Array.from({ length: Number(max.slice(0, 4)) - Number(min.slice(0, 4)) + 1 }, (_, i) => String(Number(min.slice(0, 4)) + i));
  const allowed = (day: string) => validDay(day) && day >= min && day <= max;
  function close() { setOpen(false); trigger.current?.focus(); }
  function moveMonth(amount: number) {
    const date = new Date(`${first}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount);
    const next = date.toISOString().slice(0, 7); if (next >= min.slice(0, 7) && next <= max.slice(0, 7)) setMonth(next);
  }
  function focusDay(day: string) {
    if (!allowed(day)) return;
    setMonth(day.slice(0, 7)); setFocused(day);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus());
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    const day = (event.target as HTMLElement).dataset.day;
    if (!day) return;
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in delta) { event.preventDefault(); focusDay(addDays(day, delta[event.key])); }
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div className="ih-date-picker" ref={root} onKeyDown={keyboard} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} id={id} className="ih-date-trigger ih-field" type="button" disabled={disabled}
      aria-label={`${label}: ${displayDay(value)}`} aria-expanded={open} aria-controls={popupId} aria-haspopup="dialog"
      onClick={() => { if (open) close(); else { setMonth(value.slice(0, 7)); setFocused(value); setOpen(true); requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-day="${value}"]`)?.focus()); } }}>
      <span>{displayDay(value)}</span><CalendarDays size={16} aria-hidden="true"/>
    </button>
    {open && <div id={popupId} className="ih-date-popover" role="dialog" aria-label={label}>
      <div className="ih-date-toolbar">
        <button type="button" className="ih-icon-button" aria-label="Tháng trước" disabled={month <= min.slice(0, 7)} onClick={() => moveMonth(-1)}><ChevronLeft size={16}/></button>
        <div className="ih-date-month"><Select label="Tháng" value={month.slice(5)} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: `Tháng ${i + 1}` }))} onChange={m => setMonth(`${month.slice(0, 4)}-${m}`)}/><Select label="Năm" value={month.slice(0, 4)} options={years.map(y => ({ value: y, label: y }))} onChange={y => setMonth(`${y}-${month.slice(5)}`)}/></div>
        <button type="button" className="ih-icon-button" aria-label="Tháng sau" disabled={month >= max.slice(0, 7)} onClick={() => moveMonth(1)}><ChevronRight size={16}/></button>
      </div>
      <div className="ih-date-weekdays" aria-hidden="true">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(d => <span key={d}>{d}</span>)}</div>
      <div className="ih-date-grid" role="group" aria-label={`Ngày trong tháng ${month.slice(5)}/${month.slice(0, 4)}`}>
        {days.map(day => <button type="button" key={day} data-day={day} className={day.slice(0, 7) !== month ? "ih-date-outside" : ""}
          disabled={!allowed(day)} tabIndex={day === focused ? 0 : -1} aria-label={displayDay(day)} aria-pressed={day === value}
          aria-current={day === max ? "date" : undefined} onFocus={() => setFocused(day)} onClick={() => { onChange(day); close(); }}>{Number(day.slice(8))}</button>)}
      </div>
      <button type="button" className="ih-date-today" onClick={() => { onChange(max); close(); }}>Hôm nay · {displayDay(max)}</button>
    </div>}
  </div>;
}
