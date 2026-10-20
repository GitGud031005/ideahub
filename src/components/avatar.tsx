"use client";
import { Camera, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Author } from "@/lib/domain";
import { AvatarDialog } from "./avatar-dialog";
export function Avatar({person,className=""}:{person:Pick<Author,"initial"|"avatarUrl">;className?:string}){
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[person.avatarUrl]);
  return <span className={`ih-avatar ${className}`} aria-hidden="true">{person.avatarUrl&&!failed?<img src={person.avatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:person.initial}</span>;
}
export function AvatarPicker({file,onChange,initial,disabled,avatarUrl}:{file:File|null;onChange:(file:File|null)=>void;initial:string;disabled:boolean;avatarUrl?:string|null}){
  const [preview,setPreview]=useState<string|null>(null),[editing,setEditing]=useState(false);
  useEffect(()=>{if(!file){setPreview(null);return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  return <div className="ih-avatar-picker"><div className="ih-avatar-picker-row"><Avatar person={{initial,avatarUrl:preview||avatarUrl}} className="ih-avatar-preview"/><div><button type="button" className="ih-avatar-choose" disabled={disabled} onClick={()=>setEditing(true)}><Camera size={14} aria-hidden="true"/>{file?"Chọn ảnh khác":"Chọn ảnh đại diện"}</button><p>Không bắt buộc · JPG, PNG, WebP · tối đa 2 MB</p>{file&&<button className="ih-avatar-remove" type="button" disabled={disabled} onClick={()=>onChange(null)}><X size={12} aria-hidden="true"/>Bỏ ảnh</button>}</div></div>
    {editing&&<AvatarDialog confirmLabel="Dùng ảnh này" onClose={()=>setEditing(false)} onSave={async next=>{onChange(next);}}/>}
  </div>;
}
