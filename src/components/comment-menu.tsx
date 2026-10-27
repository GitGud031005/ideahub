"use client";
import {createPortal} from "react-dom";
import {useFloatingPanel} from "./use-floating-panel";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { useSurface } from "./use-surface";
export function CommentMenu({onEdit}:{onEdit:()=>void}) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),item=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLDivElement>(null),position=useFloatingPanel(open,trigger,menu,{width:180,maxHeight:120});
  useSurface(open,()=>setOpen(false));
  useEffect(()=>{
    if(!open)return;
    item.current?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  return <div className="ih-comment-menu" ref={root} onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node)&&!menu.current?.contains(e.relatedTarget as Node))setOpen(false);}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
    <button type="button" ref={trigger} aria-label="Tùy chọn bình luận" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}><MoreHorizontal size={16}/></button>
    {open&&createPortal(<div ref={menu} className="ih-comment-popover" style={position} role="menu" aria-label="Thao tác bình luận"><button type="button" role="menuitem" ref={item} onClick={()=>{setOpen(false);onEdit();}}><Pencil size={14}/>Chỉnh sửa</button></div>,trigger.current?.closest("dialog")??document.body)}
  </div>;
}
