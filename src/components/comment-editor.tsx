"use client";
import { CornerDownLeft } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useDraft } from "./providers";
interface Props { draftKey: string; label: string; reply?: boolean; pending: boolean; error?: string; onSubmit: (text: string) => void; onCancel?: () => void }
export function CommentEditor({ draftKey, label, reply, pending, error, onSubmit, onCancel }: Props) {
  const [text, setText] = useDraft(draftKey), field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (reply) field.current?.focus(); }, [reply]);
  useEffect(() => { const el = field.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(160, Math.max(40, el.scrollHeight + 2)) + "px"; } }, [text]);
  function send(){if(!text.trim()||pending)return;const next=text.trim();setText("");onSubmit(next);requestAnimationFrame(()=>field.current?.focus({preventScroll:true}));}
  function keydown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape" && onCancel) { event.preventDefault(); if (!pending) onCancel(); }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) { event.preventDefault(); send(); }
  }
  return <form className={reply ? "ih-reply-form" : "ih-thread-composer"} noValidate aria-busy={pending} onSubmit={event => { event.preventDefault(); send(); }}>
    <label className={reply ? "ih-sr" : ""} htmlFor={`editor-${draftKey}`}>{label}</label><textarea id={`editor-${draftKey}`} ref={field} rows={1} maxLength={2000} value={text} disabled={pending} aria-invalid={!!error} aria-describedby={error ? `editor-error-${draftKey}` : undefined} aria-label={label} placeholder={reply ? "Viết câu trả lời..." : "Một câu hỏi, một góp ý, hay một cách làm khác..."} onChange={e => setText(e.target.value)} onKeyDown={keydown}/>
    {error && <p id={`editor-error-${draftKey}`} className="ih-form-error" role="alert">{error}</p>}
    <div className={reply ? "ih-reply-form-footer" : "ih-thread-composer-bottom"}>{!reply && <span>Shift + Enter để xuống dòng</span>}{onCancel && <button type="button" className="ih-reply-cancel" aria-keyshortcuts="Escape" disabled={pending} onClick={onCancel}>Hủy <kbd>Esc</kbd></button>}<button className="ih-reply-submit" type="submit" aria-keyshortcuts="Enter" disabled={!text.trim() || pending}>{pending ? "Đang gửi..." : reply ? "Gửi trả lời" : "Đăng bình luận"}<CornerDownLeft size={13} aria-hidden="true"/></button></div>
  </form>;
}
