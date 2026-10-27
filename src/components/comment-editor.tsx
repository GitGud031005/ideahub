"use client";
import {createPortal} from "react-dom";
import {useFloatingPanel} from "./use-floating-panel";
import { CornerDownLeft, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, fileSize } from "@/lib/shared-content";
import type {Author,Mention} from "@/lib/domain";
import {normalize} from "@/lib/format";
import {moveMentions,trimmedMessage,validMentions} from "@/lib/mentions";
import {Avatar} from "./avatar";
import {useSurface} from "./use-surface";
import { useDraft } from "./providers";
interface Props { draftKey: string; label: string; reply?: boolean; pending: boolean; error?: string; onSubmit: (text: string,files?:File[],mentions?:Mention[]) => void;members?:Author[];initialText?:string;initialMentions?:Mention[];editing?:boolean; onCancel?: () => void }
export function CommentEditor({ draftKey, label, reply, pending, error, onSubmit, onCancel,members=[],initialText,initialMentions=[],editing=false }: Props) {
  const [text, setText] = useDraft(draftKey), field = useRef<HTMLTextAreaElement>(null);
  const [mentions,setMentions]=useState<Mention[]>(initialMentions),[caret,setCaret]=useState(0),[choice,setChoice]=useState(0),[dismissed,setDismissed]=useState(false),initialized=useRef(false);
  useEffect(()=>{if(initialText!==undefined&&!initialized.current){initialized.current=true;setText(initialText);setMentions(initialMentions);}},[initialText,initialMentions,setText]);
  useEffect(()=>{if(editing)return;try{setMentions(validMentions(text,JSON.parse(sessionStorage.getItem(`mentions:${draftKey}`)||"[]")));}catch{}},[draftKey]);
  useEffect(()=>{if(!editing)try{sessionStorage.setItem(`mentions:${draftKey}`,JSON.stringify(mentions));}catch{}},[mentions,draftKey,editing]);
  const match=text.slice(0,caret).match(/(?:^|\s)@([^@\n]{0,60})$/),start=match?caret-match[1].length-1:-1;
  const options=!dismissed&&match&&!mentions.some(m=>start>=m.start&&start<m.end)?members.filter(u=>normalize(u.name).includes(normalize(match[1]))).slice(0,7):[];
  const mentionPanel=useRef<HTMLDivElement>(null);
  const mentionPosition=useFloatingPanel(options.length>0,field,mentionPanel,{width:320,maxHeight:280,preferAbove:!reply});
  useSurface(options.length>0,()=>setDismissed(true));
  function change(next:string,pos:number){setMentions(current=>moveMentions(text,next,current));setText(next);setCaret(pos);setChoice(0);setDismissed(false);}
  function choose(person:Author){const label=`@${person.name}`,next=text.slice(0,start)+label+" "+text.slice(caret),end=start+label.length;if(next.length>2000)return;setMentions([...moveMentions(text,next,mentions),{userId:person.id,name:person.name,start,end}]);setText(next);setCaret(end+1);setDismissed(true);requestAnimationFrame(()=>{field.current?.focus();field.current?.setSelectionRange(end+1,end+1);});}
  const [files,setFiles]=useState<File[]>([]),[fileError,setFileError]=useState(""),[dragging,setDragging]=useState(false),picker=useRef<HTMLInputElement>(null);
  const [previews,setPreviews]=useState<string[]>([]);
  useEffect(()=>{const urls=files.map(f=>f.type.startsWith("image/")?URL.createObjectURL(f):"");setPreviews(urls);return()=>urls.forEach(u=>{if(u)URL.revokeObjectURL(u);});},[files]);
  useEffect(()=>{setFiles([]);setFileError("");},[draftKey]);
  function select(items:File[]){
    if(editing)return;
    const extension=/\.(jpe?g|png|webp|pdf|txt|csv|docx|xlsx|pptx|zip)$/i;
    if(items.some(f=>!f.size||f.size>ATTACHMENT_MAX_BYTES||!extension.test(f.name))){setFileError("Chọn tệp được hỗ trợ, mỗi tệp tối đa 3 MB");return;}
    if(files.length+items.length>5){setFileError("Mỗi tin nhắn tối đa 5 tệp");return;}
    setFileError("");setFiles(current=>[...current,...items]);
  }
  useEffect(() => { if (reply) field.current?.focus({preventScroll:true}); }, [reply]);
  useEffect(() => { const el = field.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(160, Math.max(40, el.scrollHeight + 2)) + "px"; } }, [text]);
  function send(){if((!text.trim()&&!files.length)||pending)return;const next=trimmedMessage(text,mentions);onSubmit(next.text,files,next.mentions);if(!editing){setText("");setMentions([]);setFiles([]);setFileError("");}requestAnimationFrame(()=>field.current?.focus({preventScroll:true}));}
  function keydown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if(options.length){if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setChoice(c=>(c+(event.key==="ArrowDown"?1:-1)+options.length)%options.length);return;}if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();choose(options[choice%options.length]);return;}if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setDismissed(true);return;}}
    if (event.key === "Escape" && onCancel) { event.preventDefault(); if (!pending) onCancel(); }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) { event.preventDefault(); send(); }
  }
  return <form className={`${reply ? "ih-reply-form" : "ih-thread-composer"}${dragging?" ih-composer-dragging":""}${editing?" ih-edit-form":""}`} noValidate aria-busy={pending} onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();setDragging(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(!pending)select([...e.dataTransfer.files]);}} onSubmit={event => { event.preventDefault(); send(); }}>
    <label className={editing?"ih-edit-label":reply ? "ih-sr" : ""} htmlFor={`editor-${draftKey}`}>{label}</label><div className="ih-editor-input"><textarea id={`editor-${draftKey}`} ref={field} rows={1} maxLength={2000} value={text} disabled={pending} aria-invalid={!!error} aria-describedby={error ? `editor-error-${draftKey}` : undefined} aria-label={label} placeholder={reply ? "Viết câu trả lời..." : "Một câu hỏi, một góp ý, hay một cách làm khác..."} role="combobox" aria-autocomplete="list" aria-expanded={!!options.length} aria-controls={options.length?`mentions-${draftKey}`:undefined} aria-activedescendant={options.length?`mention-${draftKey}-${choice%options.length}`:undefined} onChange={e=>change(e.target.value,e.target.selectionStart)} onSelect={e=>setCaret(e.currentTarget.selectionStart)} onBlur={e=>{if(!(e.relatedTarget instanceof Element)||!e.relatedTarget.closest(".ih-mention-options"))setDismissed(true);}} onPaste={e=>{const pasted=[...e.clipboardData.files];if(pasted.length){e.preventDefault();select(pasted);}}} onKeyDown={keydown}/>{options.length>0&&createPortal(<div ref={mentionPanel} role="listbox" id={`mentions-${draftKey}`} aria-label="Nhắc thành viên" className="ih-mention-options" style={mentionPosition}><div className="ih-mention-heading"><span>Nhắc thành viên</span><kbd>↑ ↓ <span>chọn</span> ↵</kbd></div>{options.map((person,i)=><button key={person.id} type="button" id={`mention-${draftKey}-${i}`} role="option" aria-selected={i===choice%options.length} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(person)}><Avatar person={person}/><span className="ih-mention-name" title={person.name}>{person.name}{members.filter(m=>m.name===person.name).length>1&&<small>Thành viên {members.filter(m=>m.name===person.name).findIndex(m=>m.id===person.id)+1}</small>}</span><CornerDownLeft size={12} className="ih-mention-enter" aria-hidden="true"/></button>)}</div>,field.current?.closest("dialog")??document.body)}</div>
    {!!mentions.length&&<span className="ih-sr" role="status">Đã nhắc {[...new Map(mentions.map(m=>[m.userId,m.name])).values()].join(", ")}</span>}
    <input ref={picker} className="ih-sr" tabIndex={-1} type="file" multiple accept={ATTACHMENT_ACCEPT} aria-label="Chọn ảnh hoặc tệp" onChange={e=>{select([...e.target.files??[]]);e.target.value="";}}/>
    {!!files.length&&<div className="ih-composer-files">{files.map((file,i)=><div key={`${file.name}:${i}`}>{previews[i]&&<img src={previews[i]} alt=""/>}<span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span><button type="button" aria-label={`Bỏ tệp ${file.name}`} onClick={()=>setFiles(current=>current.filter((_,n)=>n!==i))}><X size={14}/></button></div>)}</div>}
    {(error||fileError) && <p id={`editor-error-${draftKey}`} className="ih-form-error" role="alert">{error||fileError}</p>}
    <div className={reply ? "ih-reply-form-footer" : "ih-thread-composer-bottom"}><button hidden={editing} type="button" className="ih-attach-button" aria-label="Đính kèm ảnh hoặc tệp" title="Tối đa 5 tệp, 3 MB mỗi tệp" disabled={pending||files.length>=5} onClick={()=>picker.current?.click()}><Paperclip size={17}/><span>Đính kèm</span></button>{!reply && <span>Shift + Enter xuống dòng · @ nhắc tên</span>}{onCancel && <button type="button" className="ih-reply-cancel" aria-keyshortcuts="Escape" disabled={pending} onClick={onCancel}>Hủy <kbd>Esc</kbd></button>}<button className="ih-reply-submit" type="submit" aria-keyshortcuts="Enter" disabled={(!text.trim()&&!files.length) || pending}>{pending ? "Đang lưu..." : editing ? "Lưu thay đổi" : reply ? "Gửi trả lời" : "Đăng bình luận"}<CornerDownLeft size={13} aria-hidden="true"/></button></div>
  </form>;
}
