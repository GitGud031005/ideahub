"use client";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
interface Option<T extends string> { value: T; label: string; icon?: ReactNode }
interface Props<T extends string> { label: string; value: T; options: readonly Option<T>[]; onChange: (value: T) => void; disabled?: boolean; wide?: boolean }
export function Select<T extends string>({ label, value, options, onChange, disabled, wide }: Props<T>) {
  const id = useId(), ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{left:number;top:number;width:number;maxHeight:number}>();
  const selected = options.find(o => o.value === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const reposition = (event: Event) => { if (!(event.target instanceof Node) || !ref.current?.querySelector('[role=listbox]')?.contains(event.target)) setOpen(false); };
    window.addEventListener("resize", reposition); document.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); document.removeEventListener("scroll", reposition, true); };
  }, [open]);
  function focusOption(index: number) { ref.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[index]?.focus(); }
  function show(focus = false) {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(wide ? rect.width : Math.max(rect.width, 184), window.innerWidth - 24);
      const above = rect.top - 12, below = window.innerHeight - rect.bottom - 12;
      const up = below < Math.min(260, options.length * 38 + 10) && above > below;
      const maxHeight = Math.min(288, up ? above - 6 : below - 6);
      setPosition({width,left:Math.max(12,Math.min(wide ? rect.left : rect.right-width,window.innerWidth-width-12)),top:up ? rect.top-Math.min(options.length*38+10,maxHeight)-6 : rect.bottom+6,maxHeight});
    }
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
    <button ref={trigger} type="button" className="ih-picker-trigger" aria-label={`${label}: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => open ? setOpen(false) : show(true)}><span className="ih-picker-label">{selected.icon}{selected.label}</span><ChevronDown size={12} aria-hidden="true" /></button>
    {open && <div className="ih-picker-menu" style={{position:"fixed",...position,right:"auto",bottom:"auto"}} id={id} role="listbox" aria-label={label}>{options.map(option => <button key={option.value} type="button" className="ih-picker-option" role="option" aria-selected={value === option.value} tabIndex={-1} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}><span className="ih-picker-label">{option.icon}{option.label}</span><Check size={12} aria-hidden="true" style={{ visibility: value === option.value ? "visible" : "hidden" }} /></button>)}</div>}
  </div>;
}
