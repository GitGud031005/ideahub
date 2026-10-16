"use client";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
interface Option<T extends string> { value: T; label: string }
interface Props<T extends string> { label: string; value: T; options: readonly Option<T>[]; onChange: (value: T) => void; disabled?: boolean; wide?: boolean }
export function Select<T extends string>({ label, value, options, onChange, disabled, wide }: Props<T>) {
  const id = useId(), ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [up, setUp] = useState(false);
  const selected = options.find(o => o.value === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function focusOption(index: number) { ref.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[index]?.focus(); }
  function show(focus = false) {
    const rect = trigger.current?.getBoundingClientRect();
    setUp(!!rect && rect.bottom + options.length * 38 + 20 > window.innerHeight && rect.top > options.length * 38);
    setOpen(true);
    if (focus) requestAnimationFrame(() => focusOption(Math.max(0, options.findIndex(o => o.value === value))));
  }
  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === "Tab" && open) { setOpen(false); trigger.current?.focus(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!open || event.target === trigger.current) { show(true); return; }
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [])], index = buttons.indexOf(event.target as HTMLButtonElement);
    focusOption(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
  }
  return <div className={`ih-picker${wide ? " ih-picker-wide" : ""}`} ref={ref} onKeyDown={keydown}>
    <button ref={trigger} type="button" className="ih-picker-trigger" aria-label={`${label}: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => open ? setOpen(false) : show(true)}><span>{selected.label}</span><ChevronDown size={12} aria-hidden="true" /></button>
    {open && <div className={`ih-picker-menu${up ? " ih-picker-up" : ""}`} id={id} role="listbox" aria-label={label}>{options.map(option => <button key={option.value} type="button" className="ih-picker-option" role="option" aria-selected={value === option.value} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}><span>{option.label}</span><Check size={12} aria-hidden="true" style={{ visibility: value === option.value ? "visible" : "hidden" }} /></button>)}</div>}
  </div>;
}
