"use client";
import { ChevronDown, File, Image as ImageIcon, Link as LinkIcon, Pin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Attachment, Comment } from "@/lib/domain";
import { sharedContent,fileSize } from "@/lib/shared-content";
import { relativeTime } from "@/lib/format";

export function SharedFiles({comments,onReveal,onImage}:{comments:Comment[];onReveal:(id:string)=>void;onImage:(a:Attachment)=>void}){
  const [tab,setTab]=useState<"images"|"files"|"links"|"pins">("images"),[open,setOpen]=useState(true),[q,setQ]=useState("");
  const content=useMemo(()=>sharedContent(comments),[comments]),needle=q.trim().toLocaleLowerCase("vi");
  const matches=(s:string)=>s.toLocaleLowerCase("vi").includes(needle);
  const rows=content[tab];
  return <section className="ih-shared" aria-label="Nội dung đã chia sẻ"><button className="ih-shared-heading" type="button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="shared-content"><span>NỘI DUNG ĐÃ CHIA SẺ</span><ChevronDown size={14} style={{transform:open?undefined:"rotate(-90deg)"}}/></button>
    {open&&<div id="shared-content"><div className="ih-shared-tabs" role="group" aria-label="Loại nội dung">{([['images','Ảnh',ImageIcon],['files','Tệp',File],['links','Liên kết',LinkIcon],['pins','Tin ghim',Pin]] as const).map(([value,label,Icon])=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>{setTab(value);setQ("");}}><Icon size={14} aria-hidden="true"/><span>{label}</span><small>{content[value].length}</small></button>)}</div>
    {!!rows.length&&<label className="ih-shared-search"><Search size={14} aria-hidden="true"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm trong mục này" aria-label="Tìm nội dung đã chia sẻ"/></label>}
    <div className={`ih-shared-items ih-shared-${tab}`}>
      {tab==="images"&&content.images.filter(r=>matches(r.attachment.name)).map(({comment,attachment})=><div key={attachment.id}><button type="button" onClick={()=>onImage(attachment)} aria-label={`Xem ảnh ${attachment.name}`}><img loading="lazy" src={attachment.url} alt={attachment.name}/></button><button type="button" className="ih-shared-source" onClick={()=>onReveal(comment.id)}>Xem tin nhắn</button></div>)}
      {tab==="files"&&content.files.filter(r=>matches(r.attachment.name)).map(({comment,attachment})=><div className="ih-shared-row" key={attachment.id}><File size={17}/><div><a href={attachment.url} download={attachment.name}>{attachment.name}</a><small>{fileSize(attachment.size)} · {comment.author.name}</small><button type="button" className="ih-shared-source" onClick={()=>onReveal(comment.id)}>Xem tin nhắn</button></div></div>)}
      {tab==="links"&&content.links.filter(r=>matches(r.url)).map(({comment,url})=><div className="ih-shared-row" key={`${comment.id}:${url}`}><LinkIcon size={17}/><div><a href={url} target="_blank" rel="noopener noreferrer">{url}</a><small>{comment.author.name} · {relativeTime(comment.createdAt)}</small><button type="button" className="ih-shared-source" onClick={()=>onReveal(comment.id)}>Xem tin nhắn</button></div></div>)}
      {tab==="pins"&&content.pins.filter(c=>matches(c.text+' '+c.author.name)).map(c=><button className="ih-shared-pin" key={c.id} type="button" onClick={()=>onReveal(c.id)}><Pin size={14}/><span><strong>{c.author.name}</strong><span>{c.text||c.attachments?.[0]?.name||"Tệp đính kèm"}</span><small>Ghim {relativeTime(c.pinnedAt!)}</small></span></button>)}
      {!rows.length&&<p className="ih-shared-empty">{tab==="images"?"Ảnh trong cuộc thảo luận sẽ xuất hiện ở đây":tab==="files"?"Tệp đã gửi sẽ được lưu tại đây":tab==="links"?"Các liên kết HTTP/HTTPS sẽ được gom vào đây":"Ghim một tin nhắn để mọi người dễ tìm lại"}</p>}
      {needle&&<p className="ih-shared-search-note">Lọc theo “{q}”</p>}
    </div></div>}
  </section>;
}
