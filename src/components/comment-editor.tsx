"use client";
import { CornerDownLeft, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, fileSize } from "@/lib/shared-content";
import { useDraft } from "./providers";
interface Props { draftKey: string; label: string; reply?: boolean; pending: boolean; error?: string; onSubmit: (text: string,files?:File[]) => void; onCancel?: () => void }
export function CommentEditor({ draftKey, label, reply, pending, error, onSubmit, onCancel }: Props) {
  const [text, setText] = useDraft(draftKey), field = useRef<HTMLTextAreaElement>(null);
  const [files,setFiles]=useState<File[]>([]),[fileError,setFileError]=useState(""),[dragging,setDragging]=useState(false),picker=useRef<HTMLInputElement>(null);
  const [previews,setPreviews]=useState<string[]>([]);
  useEffect(()=>{const urls=files.map(f=>f.type.startsWith("image/")?URL.createObjectURL(f):"");setPreviews(urls);return()=>urls.forEach(u=>{if(u)URL.revokeObjectURL(u);});},[files]);
  useEffect(()=>{setFiles([]);setFileError("");},[draftKey]);
  function select(items:File[]){
    const extension=/\.(jpe?g|png|webp|pdf|txt|csv|docx|xlsx|pptx|zip)$/i;
    if(items.some(f=>!f.size||f.size>ATTACHMENT_MAX_BYTES||!extension.test(f.name))){setFileError("Chọn tệp được hỗ trợ, mỗi tệp tối đa 3 MB");return;}
    if(files.length+items.length>5){setFileError("Mỗi tin nhắn tối đa 5 tệp");return;}
    setFileError("");setFiles(current=>[...current,...items]);
  }
  useEffect(() => { if (reply) field.current?.focus(); }, [reply]);
  useEffect(() => { const el = field.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(160, Math.max(40, el.scrollHeight + 2)) + "px"; } }, [text]);
  function send(){if((!text.trim()&&!files.length)||pending)return;const next=text.trim();setText("");setFiles([]);setFileError("");onSubmit(next,files);requestAnimationFrame(()=>field.current?.focus({preventScroll:true}));}
  function keydown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape" && onCancel) { event.preventDefault(); if (!pending) onCancel(); }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) { event.preventDefault(); send(); }
  }
  return <form className={`${reply ? "ih-reply-form" : "ih-thread-composer"}${dragging?" ih-composer-dragging":""}`} noValidate aria-busy={pending} onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();setDragging(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(!pending)select([...e.dataTransfer.files]);}} onSubmit={event => { event.preventDefault(); send(); }}>
    <label className={reply ? "ih-sr" : ""} htmlFor={`editor-${draftKey}`}>{label}</label><textarea id={`editor-${draftKey}`} ref={field} rows={1} maxLength={2000} value={text} disabled={pending} aria-invalid={!!error} aria-describedby={error ? `editor-error-${draftKey}` : undefined} aria-label={label} placeholder={reply ? "Viết câu trả lời..." : "Một câu hỏi, một góp ý, hay một cách làm khác..."} onChange={e => setText(e.target.value)} onPaste={e=>{const pasted=[...e.clipboardData.files];if(pasted.length){e.preventDefault();select(pasted);}}} onKeyDown={keydown}/>
    <input ref={picker} className="ih-sr" tabIndex={-1} type="file" multiple accept={ATTACHMENT_ACCEPT} aria-label="Chọn ảnh hoặc tệp" onChange={e=>{select([...e.target.files??[]]);e.target.value="";}}/>
    {!!files.length&&<div className="ih-composer-files">{files.map((file,i)=><div key={`${file.name}:${i}`}>{previews[i]&&<img src={previews[i]} alt=""/>}<span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><button type="button" aria-label={`Bỏ tệp ${file.name}`} onClick={()=>setFiles(current=>current.filter((_,n)=>n!==i))}><X size={14}/></button></div>)}</div>}
    {(error||fileError) && <p id={`editor-error-${draftKey}`} className="ih-form-error" role="alert">{error||fileError}</p>}
    <div className={reply ? "ih-reply-form-footer" : "ih-thread-composer-bottom"}><button type="button" className="ih-attach-button" aria-label="Đính kèm ảnh hoặc tệp" title="Tối đa 5 tệp, 3 MB mỗi tệp" disabled={pending||files.length>=5} onClick={()=>picker.current?.click()}><Paperclip size={17}/><span>Đính kèm</span></button>{!reply && <span>Shift + Enter để xuống dòng</span>}{onCancel && <button type="button" className="ih-reply-cancel" aria-keyshortcuts="Escape" disabled={pending} onClick={onCancel}>Hủy <kbd>Esc</kbd></button>}<button className="ih-reply-submit" type="submit" aria-keyshortcuts="Enter" disabled={(!text.trim()&&!files.length) || pending}>{pending ? "Đang gửi..." : reply ? "Gửi trả lời" : "Đăng bình luận"}<CornerDownLeft size={13} aria-hidden="true"/></button></div>
  </form>;
}
