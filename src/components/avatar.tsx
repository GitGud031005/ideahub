"use client";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Author } from "@/lib/domain";
export function Avatar({person,className=""}:{person:Pick<Author,"initial"|"avatarUrl">;className?:string}){
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[person.avatarUrl]);
  return <span className={`ih-avatar ${className}`} aria-hidden="true">{person.avatarUrl&&!failed?<img src={person.avatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:person.initial}</span>;
}
export function avatarFileError(file:File){return file.size>2*1024*1024?"Ảnh tối đa 2 MB":!file.size||!["image/jpeg","image/png","image/webp"].includes(file.type)?"Chọn ảnh JPG, PNG hoặc WebP":"";}
export function AvatarPicker({file,onChange,initial,disabled}:{file:File|null;onChange:(file:File|null)=>void;initial:string;disabled:boolean}){
  const input=useRef<HTMLInputElement>(null),[preview,setPreview]=useState<string|null>(null),[error,setError]=useState("");
  useEffect(()=>{if(!file){setPreview(null);return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  return <div className="ih-avatar-picker"><div className="ih-avatar-picker-row"><Avatar person={{initial,avatarUrl:preview}} className="ih-avatar-preview"/><div><button type="button" className="ih-avatar-choose" disabled={disabled} onClick={()=>input.current?.click()}><Camera size={14} aria-hidden="true"/>{file?"Chọn ảnh khác":"Chọn ảnh đại diện"}</button><p>Không bắt buộc · JPG, PNG, WebP · tối đa 2 MB</p>{file&&<button className="ih-avatar-remove" type="button" disabled={disabled} onClick={()=>{onChange(null);setError("");}}><X size={12} aria-hidden="true"/>Bỏ ảnh</button>}</div></div>
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn tệp ảnh đại diện" disabled={disabled} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(!f)return;const issue=avatarFileError(f);setError(issue);if(!issue)onChange(f);}}/>{error&&<p className="ih-field-error" role="alert">{error}</p>}
  </div>;
}
