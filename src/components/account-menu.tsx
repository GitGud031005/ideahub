"use client";
import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./providers";
export function AccountMenu() {
  const { user, ready, requestLogin, logout } = useAuth();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside); }, [open]);
  if (!user) return <button type="button" className="ih-secondary ih-login-button" disabled={!ready} onClick={() => requestLogin()}>Đăng nhập</button>;
  return <div className="ih-account" ref={ref} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <button className="ih-account-trigger" ref={trigger} type="button" aria-label={`Tài khoản ${user.name}`} aria-expanded={open} aria-controls="account-panel" onClick={() => setOpen(!open)}><span className="ih-avatar ih-you" aria-hidden="true">{user.initial}</span><span className="ih-account-name">{user.name}</span></button>
    {open && <div className="ih-account-panel" id="account-panel"><strong>{user.name}</strong><span>@{user.username}</span><button type="button" disabled={pending} onClick={async () => { setPending(true); setError(""); try { await logout(); setOpen(false); } catch (e) { setError((e as Error).message); } finally { setPending(false); } }}><LogOut size={15} aria-hidden="true"/>{pending ? "Đang đăng xuất..." : "Đăng xuất"}</button>{error && <p className="ih-form-error" role="alert">{error}</p>}</div>}
  </div>;
}
