"use client";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { loginSchema, registerSchema } from "@/lib/auth-validation";
import type { Session } from "@/lib/domain";
interface Props { onClose: () => void; onSuccess: (session: Session) => Promise<void> }
export function AuthDialog({ onClose, onSuccess }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), first = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login"), [show, setShow] = useState(false);
  const [username, setUsername] = useState(""), [fullName, setFullName] = useState(""), [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const registering = mode === "register";
  const mutation = useMutation({ mutationFn: (body: { username: string; password: string; fullName?: string }) => api<Session>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) }), onSuccess });
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
  return <dialog ref={dialog} className="ih-create-dialog ih-auth-dialog" aria-labelledby="auth-title" onCancel={event => { event.preventDefault(); if (!mutation.isPending) onClose(); }}>
    <div className="ih-dialog-top"><span className="ih-eyebrow">CÙNG NHAU TẠO NÊN ĐIỀU LỚN LAO</span><button className="ih-icon-button" type="button" aria-label="Đóng đăng nhập" disabled={mutation.isPending} onClick={onClose}><X size={17} aria-hidden="true"/></button></div>
    <h2 id="auth-title">{registering ? "Bắt đầu cùng ideahub" : "Chào mừng bạn trở lại"}</h2>
    <p className="ih-dialog-subtitle">{registering ? "Tạo tài khoản để tìm đồng đội và xây dựng ý tưởng" : "Đăng nhập để chia sẻ ý tưởng và tham gia thảo luận"}</p>
    <form noValidate aria-busy={mutation.isPending} onSubmit={submit}>
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
  </dialog>;
}
