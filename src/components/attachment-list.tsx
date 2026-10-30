"use client";
import {File,Eye} from "lucide-react";
import type {Attachment} from "@/lib/domain";
import {fileSize} from "@/lib/shared-content";
export function AttachmentList({items,onImage}:{items:Attachment[];onImage:(a:Attachment)=>void}){
 if(!items.length)return null;
 return <div className="ih-message-attachments"><div className="ih-message-images">{items.filter(a=>a.kind==='image').map(a=><button key={a.id} type="button" onClick={()=>onImage(a)} aria-label={`Xem ảnh ${a.name}`}><img src={a.url} alt={a.name} loading="lazy"/></button>)}</div>
 {items.filter(a=>a.kind==='file').map(a=><button type="button" className="ih-message-file" style={{width:"100%",fontFamily:"inherit",textAlign:"left"}} key={a.id} onClick={()=>onImage(a)} aria-label={`Xem tệp ${a.name}`}><File size={18} aria-hidden="true"/><span><strong>{a.name}</strong><small>{fileSize(a.size)}</small></span><Eye size={16} aria-hidden="true"/></button>)}
 </div>;
}
