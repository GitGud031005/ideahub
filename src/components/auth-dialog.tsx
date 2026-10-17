"use client";
import { useMutation,useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { loginSchema, registerSchema } from "@/lib/auth-validation";
import type { Session } from "@/lib/domain";
import { AvatarPicker } from "./avatar";
import { initials } from "@/lib/format";
interface Props { onClose: () => void; onSuccess: (session: Session) => Promise<void>;oauthNext?:string;initialError?:string }
export function AuthDialog({ onClose, onSuccess,oauthNext="/",initialError="" }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), first = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login"), [show, setShow] = useState(false);
  const [username, setUsername] = useState(""), [fullName, setFullName] = useState(""), [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [avatar,setAvatar]=useState<File|null>(null),[registered,setRegistered]=useState<Session|null>(null),[uploadError,setUploadError]=useState("");
  const config=useQuery({queryKey:["auth-config"],queryFn:({signal})=>api<{google:boolean;avatarUpload:boolean}>("/auth/config",{signal}),staleTime:300000});
  const registering = mode === "register";
  async function upload(){const body=new FormData();body.set("avatar",avatar!);return api<Session>("/auth/avatar",{method:"POST",body});}
  const mutation = useMutation({ mutationFn: (body: { username: string; password: string; fullName?: string }) => api<Session>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) }), onSuccess:async next=>{if(registering&&avatar){try{const updated=await upload();await onSuccess(updated);}catch(e){setRegistered(next);setUploadError((e as Error).message);}}else await onSuccess(next);} });
  const retryUpload=useMutation({mutationFn:upload,onSuccess,onError:e=>setUploadError(e.message)});
  const busy=mutation.isPending||retryUpload.isPending;
  function close(){if(registered)void onSuccess(registered);else onClose();}
  useEffect(() => { const el = dialog.current; el?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { el?.close(); document.body.style.overflow = previous; }; }, []);
  useEffect(() => { first.current?.focus(); }, [mode]);
  function clear(field: string) { setErrors(current => ({ ...current, [field]: "" })); if (mutation.isError) mutation.reset(); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (mutation.isPending) return;
    const result = registering ? registerSchema.safeParse({ username, password, fullName }) : loginSchema.safeParse({ username, password });
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      const field = (registering ? ["fullName", "username", "password"] : ["username", "password"]).find(name => next[name]);
      dialog.current?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus(); return;
    }
    setErrors({}); mutation.mutate(result.data);
  }
  const serverError = mutation.error instanceof ApiError ? mutation.error : null;
  return <dialog ref={dialog} className="ih-create-dialog ih-auth-dialog" aria-labelledby="auth-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <div className="ih-dialog-top"><span className="ih-eyebrow">CÙNG NHAU TẠO NÊN ĐIỀU LỚN LAO</span><button className="ih-icon-button" type="button" aria-label="Đóng đăng nhập" disabled={busy} onClick={close}><X size={17} aria-hidden="true"/></button></div>
    {registered?<><h2 id="auth-title">Tài khoản đã được tạo</h2><p className="ih-dialog-subtitle">Ảnh đại diện chưa tải lên được. Bạn có thể thử lại hoặc cập nhật sau trong menu tài khoản</p><AvatarPicker file={avatar} onChange={setAvatar} initial={registered.user?.initial||"TV"} disabled={busy}/>{uploadError&&<p className="ih-form-error" role="alert">{uploadError}</p>}<div className="ih-form-footer"><button type="button" className="ih-secondary" disabled={busy} onClick={()=>void onSuccess(registered)}>Để sau</button><button type="button" className="ih-primary" disabled={busy||!avatar} onClick={()=>retryUpload.mutate()}>{busy?"Đang tải ảnh...":"Thử tải lại"}</button></div></>:<>
    <h2 id="auth-title">{registering ? "Bắt đầu cùng ideahub" : "Chào mừng bạn trở lại"}</h2>
    <p className="ih-dialog-subtitle">{registering ? "Tạo tài khoản để tìm đồng đội và xây dựng ý tưởng" : "Đăng nhập để chia sẻ ý tưởng và tham gia thảo luận"}</p>
    {initialError&&<p className="ih-form-error" role="alert">{initialError}</p>}
    <a className={`ih-google-login${!config.data?.google?" ih-google-disabled":""}`} href={config.data?.google?`/api/auth/google/start?next=${encodeURIComponent(oauthNext)}`:undefined} aria-disabled={!config.data?.google} onClick={e=>{if(!config.data?.google||busy)e.preventDefault();}}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.74 2.98-4.31 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.35 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>Tiếp tục với Google</a>
    {!config.isPending&&!config.data?.google&&<p className="ih-auth-connection">Đăng nhập Google đang được thiết lập</p>}<div className="ih-auth-divider"><span>hoặc dùng username</span></div>
    <form noValidate aria-busy={mutation.isPending} onSubmit={submit}>
      {registering&&<AvatarPicker file={avatar} onChange={setAvatar} initial={initials(fullName)||"TV"} disabled={busy||!config.data?.avatarUpload}/>}
      {registering && <><label htmlFor="auth-name">Họ và tên</label><input ref={first} className="ih-field" id="auth-name" name="fullName" autoComplete="name" value={fullName} maxLength={80} disabled={mutation.isPending} placeholder="Nguyễn Minh An" required aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "auth-name-error" : undefined} onChange={e => { setFullName(e.target.value); clear("fullName"); }}/>{errors.fullName && <p className="ih-field-error" id="auth-name-error" role="alert">{errors.fullName}</p>}</>}
      <label htmlFor="auth-username">Username</label><input ref={!registering ? first : undefined} className="ih-field" id="auth-username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} maxLength={24} disabled={mutation.isPending} placeholder="minhan" required aria-invalid={!!errors.username || serverError?.code === "USERNAME_TAKEN"} aria-describedby={errors.username ? "auth-username-error" : registering ? "auth-username-hint" : undefined} onChange={e => { setUsername(e.target.value); clear("username"); }}/>
      {errors.username && <p className="ih-field-error" id="auth-username-error" role="alert">{errors.username}</p>}
      {registering && <div className="ih-field-meta" id="auth-username-hint">3–24 chữ cái không dấu, số hoặc dấu gạch dưới</div>}
      <label htmlFor="auth-password">Mật khẩu</label><div className="ih-password"><input className="ih-field" id="auth-password" name="password" type={show ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} value={password} maxLength={128} disabled={mutation.isPending} placeholder={registering ? "Ít nhất 8 ký tự" : "Mật khẩu của bạn"} required aria-invalid={!!errors.password} aria-describedby={errors.password ? "auth-password-error" : registering ? "auth-password-hint" : undefined} onChange={e => { setPassword(e.target.value); clear("password"); }}/><button type="button" className="ih-password-toggle" disabled={mutation.isPending} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShow(!show)}>{show ? <EyeOff size={17} aria-hidden="true"/> : <Eye size={17} aria-hidden="true"/>}</button></div>
      {errors.password && <p className="ih-field-error" id="auth-password-error" role="alert">{errors.password}</p>}
      {registering && <div className="ih-field-meta" id="auth-password-hint">Gợi ý: dùng một câu dễ nhớ, có ít nhất 8 ký tự</div>}
      {mutation.error && <p className="ih-form-error" role="alert">{mutation.error.message}</p>}
      <button type="submit" className="ih-primary ih-auth-submit" disabled={mutation.isPending}>{mutation.isPending ? "Đang xử lý..." : registering ? "Tạo tài khoản" : "Đăng nhập"}</button>
    </form>
    <p className="ih-auth-switch">{registering ? "Đã có tài khoản?" : "Chưa có tài khoản?"}<button type="button" disabled={mutation.isPending} onClick={() => { setMode(registering ? "login" : "register"); setErrors({}); setPassword(""); setShow(false); mutation.reset(); }}>{registering ? "Đăng nhập" : "Đăng ký"}</button></p>
    </>}
  </dialog>;
}
