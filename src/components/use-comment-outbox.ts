"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { Account, Comment } from "@/lib/domain";
import { api } from "@/lib/api-client";
import { outboxKey, type PendingComment } from "@/lib/comment-outbox";
import { useUi } from "./providers";

export function useCommentOutbox(ideaId:string,user:Account|null) {
  const {outbox,setOutbox}=useUi(),client=useQueryClient(),inFlight=useRef(new Set<string>());
  function update(entry:PendingComment,change:(items:PendingComment[])=>PendingComment[]){
    const key=outboxKey(entry.ideaId,entry.author.id);
    setOutbox(current=>({...current,[key]:change(current[key]??[])}));
  }
  const mutation=useMutation({
    mutationFn:async(entry:PendingComment)=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
      try{return await api<Comment>(`/ideas/${encodeURIComponent(entry.ideaId)}/comments`,{method:"POST",body:JSON.stringify({text:entry.text,parentId:entry.parentId,clientId:entry.id}),signal:controller.signal});}
      finally{clearTimeout(timeout);}
    },
    onSuccess:async(comment,entry)=>{
      const key=["comments",entry.ideaId,entry.author.id];
      await client.cancelQueries({queryKey:key});
      client.setQueryData<Comment[]>(key,current=>[...(current??[]).filter(c=>c.id!==comment.id),comment]);
      update(entry,items=>items.filter(c=>c.id!==entry.id));
      void client.invalidateQueries({queryKey:["idea",entry.ideaId]});void client.invalidateQueries({queryKey:["ideas"]});
    },
    onError:(error,entry)=>update(entry,items=>items.map(c=>c.id===entry.id?{...c,delivery:"failed",deliveryError:error instanceof Error&&error.name!=="AbortError"?error.message:"Chưa xác nhận được tin nhắn. Bạn có thể thử gửi lại"}:c)),
    onSettled:(_data,_error,entry)=>{inFlight.current.delete(entry.id);},
  });
  function transmit(entry:PendingComment){if(inFlight.current.has(entry.id))return;inFlight.current.add(entry.id);mutation.mutate(entry);}
  function enqueue(text:string,parentId:string|null){
    if(!user||!text.trim())return;
    const entry:PendingComment={id:crypto.randomUUID(),ideaId,parentId,author:user,text:text.trim(),createdAt:new Date().toISOString(),delivery:"sending"};
    update(entry,items=>[...items,entry]);transmit(entry);return entry;
  }
  const items=user?outbox[outboxKey(ideaId,user.id)]??[]:[];
  return {items,enqueue,retry:(id:string)=>{const entry=items.find(c=>c.id===id);if(!entry||entry.delivery!=="failed")return;update(entry,list=>list.map(c=>c.id===id?{...c,delivery:"sending",deliveryError:undefined}:c));transmit({...entry,delivery:"sending",deliveryError:undefined});},dismiss:(id:string)=>{const entry=items.find(c=>c.id===id);if(entry?.delivery==="failed")update(entry,list=>list.filter(c=>c.id!==id));}};
}
