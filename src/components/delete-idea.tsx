"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {useMutation,useQueryClient} from "@tanstack/react-query";
import {useRouter} from "next/navigation";
import {Trash2} from "lucide-react";
import type {Idea} from "@/lib/domain";
import {api} from "@/lib/api-client";
import {useAuth} from "./providers";
import {useSurface} from "./use-surface";

export function DeleteIdea({idea}:{idea:Idea}){
 const {user}=useAuth(),[open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),client=useQueryClient(),router=useRouter();
 const mutation=useMutation({mutationFn:()=>api(`/ideas/${encodeURIComponent(idea.id)}/delete`,{method:"POST",body:"{}"}),onSuccess:async()=>{
  await client.cancelQueries({predicate:q=>q.queryKey.includes(idea.id)});
  client.removeQueries({predicate:q=>q.queryKey.includes(idea.id)});
  void client.invalidateQueries({queryKey:["ideas"]});
  void client.invalidateQueries({queryKey:["notifications"]});
  void client.invalidateQueries({queryKey:["unread"]});
  router.replace("/");
 }});
 useSurface(open,()=>{if(!mutation.isPending)setOpen(false);});
 if(!user||user.id!==idea.creator.id)return null;
 return <><button ref={trigger} type="button" className="ih-room-mute ih-delete-idea-trigger" aria-label="Xóa idea" title="Xóa idea" onClick={()=>{mutation.reset();setOpen(true);}}><Trash2 size={16}/><span>Xóa idea</span></button>{open&&createPortal(<DeleteIdeaDialog title={idea.title} pending={mutation.isPending} error={mutation.error?.message} cancel={()=>{if(!mutation.isPending){setOpen(false);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}}} confirm={()=>mutation.mutate()}/>,document.body)}</>;
}
function DeleteIdeaDialog({title,pending,error,cancel,confirm}:{title:string;pending:boolean;error?:string;cancel:()=>void;confirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),safe=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const el=dialog.current;el?.showModal();safe.current?.focus();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{el?.close();document.body.style.overflow=overflow;};},[]);
 return <dialog ref={dialog} className="ih-create-dialog ih-delete-idea-dialog" aria-labelledby="delete-idea-title" aria-describedby="delete-idea-description" onCancel={e=>{e.preventDefault();if(!pending)cancel();}}>
  <h2 id="delete-idea-title">Xóa idea này?</h2>
  <p className="ih-delete-idea-name">{title}</p>
  <p id="delete-idea-description" className="ih-dialog-subtitle">Idea cùng toàn bộ bình luận, tệp đính kèm và AI recap trong phòng sẽ bị xóa. Thao tác này không thể hoàn tác.</p>
  {error&&<p className="ih-inline-error" role="alert">{error}</p>}
  <div className="ih-delete-idea-actions" aria-busy={pending}><button ref={safe} type="button" className="ih-secondary" disabled={pending} onClick={cancel}>Hủy</button><button type="button" className="ih-primary ih-delete-idea-confirm" disabled={pending} onClick={confirm}>{pending?"Đang xóa…":"Xóa idea"}</button></div>
 </dialog>;
}
