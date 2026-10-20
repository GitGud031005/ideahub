"use client";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IDEA_TAGS, MAX_IDEA_TAGS, searchIdeaTags } from "@/lib/idea-tags";

export function TagPicker({value,onChange,disabled,error}:{value:string[];onChange:(tags:string[])=>void;disabled?:boolean;error?:string}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState("");
  const panelId=useId(),search=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const groups=useMemo(()=>searchIdeaTags(query),[query]),selected=new Set(value),full=value.length>=MAX_IDEA_TAGS;
  useEffect(()=>{if(open)search.current?.focus();},[open]);
  function toggle(tag:string){if(selected.has(tag))onChange(value.filter(t=>t!==tag));else if(!full)onChange([...value,tag]);}
  return <div className="ih-tag-picker" role="group" aria-labelledby="idea-tags-label" onKeyDown={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
    <div className="ih-selected-tags" aria-label="Tags đang chọn">{value.map(tag=><button key={tag} type="button" className="ih-tag-selected" aria-label={`Bỏ tag ${tag}`} disabled={disabled} onClick={()=>toggle(tag)}>{tag}<X size={12} aria-hidden="true"/></button>)}</div>
    <button ref={trigger} id="idea-tags" name="tags" type="button" className="ih-field ih-tags-trigger" aria-expanded={open} aria-controls={panelId} aria-invalid={!!error} aria-describedby={`idea-tags-hint${error?" idea-tags-error":""}`} disabled={disabled} onClick={()=>setOpen(v=>!v)}><span>{open?"Thu gọn danh mục tags":`Chọn từ ${IDEA_TAGS.length} tags có sẵn`}</span><ChevronDown size={14} aria-hidden="true" style={{transform:open?"rotate(180deg)":undefined}}/></button>
    {open&&<div className="ih-tag-catalog" id={panelId}>
      <div className="ih-tag-search"><Search size={14} aria-hidden="true"/><input ref={search} aria-label="Tìm tags" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} placeholder="Tìm tags hoặc lĩnh vực..." disabled={disabled} maxLength={80}/></div>
      <div className="ih-tag-options">{groups.length?groups.map(group=><div className="ih-tag-group" role="group" aria-label={group.name} key={group.name}><div className="ih-tag-group-name">{group.name}</div><div className="ih-tag-choices">{group.tags.map(tag=><button type="button" role="checkbox" aria-checked={selected.has(tag)} aria-label={tag} className={`ih-tag-choice${selected.has(tag)?" ih-tag-choice-selected":""}`} disabled={disabled||(!selected.has(tag)&&full)} key={tag} onClick={()=>toggle(tag)}>{selected.has(tag)&&<Check size={11} aria-hidden="true"/>}{tag}</button>)}</div></div>):<p className="ih-tag-no-results">Không tìm thấy tag phù hợp, thử một từ khóa khác</p>}</div>
    </div>}
    <div className="ih-field-meta" id="idea-tags-hint"><span>Chọn tối đa {MAX_IDEA_TAGS} tags</span><span>{value.length}/{MAX_IDEA_TAGS}</span></div>
    {full&&<p className="ih-tag-limit" role="status">Đã đủ {MAX_IDEA_TAGS} tags, bỏ một tag để chọn thêm</p>}
    {error&&<p id="idea-tags-error" className="ih-field-error" role="alert">{error}</p>}
  </div>;
}
