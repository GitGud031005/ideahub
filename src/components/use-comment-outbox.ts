"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { Account, Comment, Mention, Attachment } from "@/lib/domain";
import {persistPending,removePending} from "@/lib/outbox-storage";
import { api,ApiError,fetchComments } from "@/lib/api-client";
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
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);
      try{
        await persistPending(entry).catch(()=>{});
        const uploadedIds=entry.uploadedIds??=[];
        for(let i=uploadedIds.length;i<(entry.localFiles?.length??0);i++){
          const form=new FormData();form.set("file",entry.localFiles![i]);
          const a=await api<Attachment>(`/ideas/${encodeURIComponent(entry.ideaId)}/attachments`,{method:"POST",body:form,signal:controller.signal});
          uploadedIds.push(a.id);
          update(entry,items=>items.map(c=>c.id===entry.id?{...c,uploadedIds:[...uploadedIds]}:c));
        }
        try{return await api<Comment>(`/ideas/${encodeURIComponent(entry.ideaId)}/comments`,{method:"POST",body:JSON.stringify({text:entry.text,parentId:entry.parentId,clientId:entry.id,attachmentIds:uploadedIds,mentions:entry.mentions??[]}),signal:controller.signal});}catch(error){
          if(!(error instanceof ApiError)||error.code!=="COMMENT_CONFLICT"||entry.originalText===undefined)throw error;
          const saved=(await fetchComments(entry.ideaId,controller.signal)).find(c=>c.id===entry.id);
          if(!saved||saved.author.id!==entry.author.id||saved.text!==entry.originalText)throw error;
          return api<Comment>(`/ideas/${encodeURIComponent(entry.ideaId)}/comments/${encodeURIComponent(entry.id)}/edit`,{method:"POST",body:JSON.stringify({text:entry.text,mentions:entry.mentions??[],revision:saved.revision??0}),signal:controller.signal});
        }
      }
      finally{clearTimeout(timeout);}
    },
    onSuccess:async(comment,entry)=>{
      const key=["comments",entry.ideaId,entry.author.id];
      await client.cancelQueries({queryKey:key});
      client.setQueryData<Comment[]>(key,current=>[...(current??[]).filter(c=>c.id!==comment.id),comment]);
      await removePending(entry.id).catch(()=>{});
      update(entry,items=>items.filter(c=>c.id!==entry.id));
      for(const a of entry.attachments??[])if(a.url.startsWith("blob:"))URL.revokeObjectURL(a.url);
      // A send acknowledgement may have cancelled a live refresh. Reconcile the full room.
      void client.invalidateQueries({queryKey:key},{cancelRefetch:false});
      void client.invalidateQueries({queryKey:["idea",entry.ideaId]});void client.invalidateQueries({queryKey:["ideas"]});
    },
    onError:(error,entry)=>{const failed={...entry,delivery:"failed" as const,deliveryError:error instanceof Error&&error.name!=="AbortError"?error.message:"Chưa xác nhận được tin nhắn. Bạn có thể thử gửi lại"};void persistPending(failed).catch(()=>{});update(entry,items=>items.map(c=>c.id===entry.id?failed:c));},
    onSettled:(_data,_error,entry)=>{inFlight.current.delete(entry.id);},
  });
  function transmit(entry:PendingComment){if(inFlight.current.has(entry.id))return;inFlight.current.add(entry.id);mutation.mutate(entry);}
  function enqueue(text:string,parentId:string|null,files:File[]=[],mentions:Mention[]=[]){
    if(!user||(!text.trim()&&!files.length))return;
    const entry:PendingComment={id:crypto.randomUUID(),ideaId,parentId,author:user,text:text.trim(),mentions,createdAt:new Date().toISOString(),delivery:"sending",localFiles:files,uploadedIds:[],attachments:files.map(file=>({id:crypto.randomUUID(),name:file.name,mime:file.type,size:file.size,kind:file.type.startsWith("image/")?"image":"file",url:URL.createObjectURL(file)}))};
    update(entry,items=>[...items,entry]);transmit(entry);return entry;
  }
  const items=user?outbox[outboxKey(ideaId,user.id)]??[]:[];
  return {items,enqueue,revise:(id:string,text:string,mentions:Mention[])=>{const entry=items.find(c=>c.id===id);if(!entry||entry.delivery!=="failed")return;const changed={...entry,text,mentions,originalText:entry.originalText??entry.text,delivery:"sending" as const,deliveryError:undefined};update(entry,list=>list.map(c=>c.id===id?changed:c));transmit(changed);},retry:(id:string)=>{const entry=items.find(c=>c.id===id);if(!entry||entry.delivery!=="failed")return;update(entry,list=>list.map(c=>c.id===id?{...c,delivery:"sending",deliveryError:undefined}:c));transmit({...entry,delivery:"sending",deliveryError:undefined});},dismiss:(id:string)=>{const entry=items.find(c=>c.id===id);if(entry?.delivery==="failed"){void removePending(id).catch(()=>{});for(const a of entry.attachments??[])if(a.url.startsWith("blob:"))URL.revokeObjectURL(a.url);update(entry,list=>list.filter(c=>c.id!==id));}}};
}
