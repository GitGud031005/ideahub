"use client";
import { Camera, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./providers";
import { Avatar,avatarFileError } from "./avatar";
import { api } from "@/lib/api-client";
import type { Session } from "@/lib/domain";
import { useQuery } from "@tanstack/react-query";
export function AccountMenu() {
  const { user, ready, requestLogin, logout,updateProfile } = useAuth();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const fileInput=useRef<HTMLInputElement>(null),config=useQuery({queryKey:["auth-config"],queryFn:()=>api<{avatarUpload:boolean;google:boolean}>("/auth/config"),staleTime:300000,enabled:!!user});
  useEffect(() => { if (!open) return; const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside); }, [open]);
  if (!user) return <button type="button" className="ih-secondary ih-login-button" disabled={!ready} onClick={() => requestLogin()}>Đăng nhập</button>;
  return <div className="ih-account" ref={ref} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <button className="ih-account-trigger" ref={trigger} type="button" aria-label={`Tài khoản ${user.name}`} aria-expanded={open} aria-controls="account-panel" onClick={() => setOpen(!open)}><Avatar person={user} className="ih-you"/><span className="ih-account-name">{user.name}</span></button>
    {open && <div className="ih-account-panel" id="account-panel"><strong>{user.name}</strong><span>{user.provider==="google"?"Tài khoản Google":`@${user.username}`}</span><button type="button" disabled={pending||!config.data?.avatarUpload} onClick={()=>fileInput.current?.click()}><Camera size={15} aria-hidden="true"/>{pending?"Đang xử lý...":"Đổi ảnh đại diện"}</button><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Tệp ảnh đại diện mới" onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;const issue=avatarFileError(file);setError(issue);if(issue)return;setPending(true);try{const body=new FormData();body.set("avatar",file);await updateProfile(await api<Session>("/auth/avatar",{method:"POST",body}));}catch(error){setError((error as Error).message);}finally{setPending(false);}}}/><button type="button" disabled={pending} onClick={async () => { setPending(true); setError(""); try { await logout(); setOpen(false); } catch (e) { setError((e as Error).message); } finally { setPending(false); } }}><LogOut size={15} aria-hidden="true"/>Đăng xuất</button>{error && <p className="ih-form-error" role="alert">{error}</p>}</div>}
  </div>;
}
