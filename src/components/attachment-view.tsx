"use client";
import { Download, File, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Attachment } from "@/lib/domain";
import { fileSize } from "@/lib/shared-content";

export function AttachmentViewer({attachment,onClose}:{attachment:Attachment;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current,previous=document.body.style.overflow;d?.showModal();document.body.style.overflow="hidden";return()=>{d?.close();document.body.style.overflow=previous;};},[]);
  return <dialog ref={ref} className="ih-attachment-viewer" aria-label={`Xem ảnh ${attachment.name}`} onCancel={e=>{e.preventDefault();onClose();}}>
    <header><span>{attachment.name}</span><a href={attachment.url.startsWith("blob:")?attachment.url:`${attachment.url}?download=1`} download={attachment.name} aria-label="Tải ảnh xuống"><Download size={18}/></a><button autoFocus type="button" aria-label="Đóng ảnh" onClick={onClose}><X size={20}/></button></header>
    <img src={attachment.url} alt={attachment.name}/><p>{fileSize(attachment.size)}</p>
  </dialog>;
}
export function AttachmentList({items,onImage}:{items:Attachment[];onImage:(a:Attachment)=>void}){
  if(!items.length)return null;
  return <div className="ih-message-attachments"><div className="ih-message-images">{items.filter(a=>a.kind==="image").map(a=><button key={a.id} type="button" onClick={()=>onImage(a)} aria-label={`Xem ảnh ${a.name}`}><img src={a.url} alt={a.name} loading="lazy"/></button>)}</div>
    {items.filter(a=>a.kind==="file").map(a=><a className="ih-message-file" key={a.id} href={a.url} download={a.name}><File size={18} aria-hidden="true"/><span><strong>{a.name}</strong><small>{fileSize(a.size)}</small></span><Download size={14} aria-hidden="true"/></a>)}
  </div>;
}
