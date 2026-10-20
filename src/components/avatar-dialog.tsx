"use client";

import { Camera, ImagePlus, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { avatarCrop, avatarFileError, type AvatarPan } from "@/lib/avatar-crop";

export function AvatarDialog({onClose,onSave,confirmLabel="Lưu ảnh đại diện"}:{onClose:()=>void;onSave:(file:File)=>Promise<void>;confirmLabel?:string}) {
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),image=useRef<HTMLImageElement>(null),viewport=useRef<HTMLDivElement>(null);
  const [file,setFile]=useState<File|null>(null),[url,setUrl]=useState(""),[size,setSize]=useState({w:0,h:0}),[edge,setEdge]=useState(280);
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState<AvatarPan>({x:0,y:0}),[error,setError]=useState(""),[busy,setBusy]=useState(false),[over,setOver]=useState(false);
  const drag=useRef<{x:number;y:number;pan:AvatarPan}|null>(null),opener=useRef<HTMLElement|null>(null);
  const clamp=(n:number)=>Math.max(-1,Math.min(1,n)),scale=size.w?Math.max(edge/size.w,edge/size.h)*zoom:1,dw=size.w*scale,dh=size.h*scale;
  useEffect(()=>{opener.current=document.activeElement as HTMLElement;const el=dialog.current,previous=document.body.style.overflow;el?.showModal();document.body.style.overflow="hidden";return()=>{el?.close();document.body.style.overflow=previous;opener.current?.focus({preventScroll:true});};},[]);
  useEffect(()=>{if(!file){setUrl("");return;}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(()=>setEdge(el.clientWidth));observer.observe(el);setEdge(el.clientWidth);return()=>observer.disconnect();},[url]);
  function choose(next:File|undefined){if(!next||busy)return;const issue=avatarFileError(next);setError(issue);if(issue)return;setFile(next);setSize({w:0,h:0});setZoom(1);setPan({x:0,y:0});}
  async function save(){
    if(!image.current||!size.w||busy)return;setBusy(true);setError("");
    try{
      const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
      const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Trình duyệt chưa hỗ trợ cắt ảnh");
      const crop=avatarCrop(size.w,size.h,zoom,pan);ctx.imageSmoothingQuality="high";ctx.drawImage(image.current,crop.x,crop.y,crop.side,crop.side,0,0,512,512);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error("Chưa xử lý được ảnh")),"image/webp",.92));
      const cropped=new File([blob],blob.type==="image/webp"?"avatar.webp":"avatar.png",{type:blob.type});
      const issue=avatarFileError(cropped);if(issue)throw new Error(issue);
      await onSave(cropped);onClose();
    }catch(e){setError(e instanceof Error?e.message:"Chưa lưu được ảnh, hãy thử lại");setBusy(false);}
  }
  return <dialog ref={dialog} className="ih-avatar-dialog" aria-labelledby="avatar-dialog-title" aria-busy={busy} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!busy)onClose();}} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();if(e.target===e.currentTarget&&!busy&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))onClose();}}>
    <div className="ih-dialog-top"><span className="ih-eyebrow">ẢNH ĐẠI DIỆN</span><button className="ih-icon-button" type="button" aria-label="Đóng chỉnh ảnh" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    <h2 id="avatar-dialog-title">{url?"Căn lại một chút cho vừa":"Chọn một hình ảnh của bạn"}</h2><p className="ih-avatar-dialog-copy">{url?"Kéo ảnh để căn vị trí, thu phóng để chọn khung hình":"Chọn từ máy hoặc kéo thả ảnh vào khung bên dưới"}</p>
    <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Tệp ảnh để cắt" disabled={busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value="";}}/>
    {!url?<div className={`ih-avatar-drop${over?" ih-drag-over":""}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOver(false);}} onDrop={e=>{e.preventDefault();setOver(false);if(e.dataTransfer.files.length!==1){setError("Chọn đúng một ảnh");return;}choose(e.dataTransfer.files[0]);}}>
      <span className="ih-avatar-drop-icon"><ImagePlus size={28} aria-hidden="true"/></span><button type="button" className="ih-secondary" onClick={()=>input.current?.click()}>Chọn ảnh từ máy</button><p>hoặc kéo thả vào đây</p><small>JPG, PNG, WebP · tối đa 2 MB</small>
    </div>:<>
      <div ref={viewport} className="ih-avatar-crop" role="group" aria-label="Kéo để căn ảnh đại diện" tabIndex={0} style={{touchAction:"none"}} onKeyDown={e=>{if(busy)return;const step=.05;if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();setPan(p=>({x:clamp(p.x+(e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0)),y:clamp(p.y+(e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0))}));}}} onPointerDown={e=>{if(busy||e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,pan};}} onPointerMove={e=>{if(!drag.current||busy)return;setPan({x:dw>edge?clamp(drag.current.pan.x+2*(e.clientX-drag.current.x)/(dw-edge)):0,y:dh>edge?clamp(drag.current.pan.y+2*(e.clientY-drag.current.y)/(dh-edge)):0});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
        <img ref={image} src={url} alt="Ảnh đang chỉnh" draggable={false} style={{width:dw||"100%",height:dh||"100%",left:(edge-dw)/2+pan.x*(dw-edge)/2,top:(edge-dh)/2+pan.y*(dh-edge)/2}} onLoad={e=>{const el=e.currentTarget;if(el.naturalWidth*el.naturalHeight>24000000){setError("Ảnh quá lớn, chọn ảnh dưới 24 megapixel");setFile(null);return;}setSize({w:el.naturalWidth,h:el.naturalHeight});requestAnimationFrame(()=>viewport.current?.focus({preventScroll:true}));}} onError={()=>{setError("Không đọc được ảnh này. Chọn ảnh khác nhé");setFile(null);}}/>
        <span className="ih-avatar-crop-mask" aria-hidden="true"/>
      </div>
      <div className="ih-avatar-zoom"><button type="button" className="ih-icon-button" aria-label="Thu nhỏ ảnh" disabled={busy||zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.1))}><Minus size={16}/></button><input type="range" aria-label="Thu phóng ảnh" min={1} max={4} step={.01} value={zoom} disabled={busy} onChange={e=>setZoom(Number(e.target.value))}/><button type="button" className="ih-icon-button" aria-label="Phóng to ảnh" disabled={busy||zoom>=4} onClick={()=>setZoom(z=>Math.min(4,z+.1))}><Plus size={16}/></button></div>
      <button type="button" className="ih-avatar-replace" disabled={busy} onClick={()=>input.current?.click()}><Camera size={14}/>Chọn ảnh khác</button>
    </>}
    {error&&<p className="ih-form-error" role="alert">{error}</p>}
    <div className="ih-form-footer"><button className="ih-secondary" type="button" disabled={busy} onClick={onClose}>Hủy</button><button className="ih-primary" type="button" disabled={busy||!size.w} onClick={()=>void save()}>{busy?"Đang lưu ảnh...":confirmLabel}</button></div>
  </dialog>;
}
