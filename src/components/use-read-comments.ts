"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Comment } from "@/lib/domain";
import { visibleCommentIds } from "@/lib/comment-unread";

type ReadState = { unreadIds: string[] };
/** Acknowledge rendered levels only, in batches, while the room is active. */
export function useReadComments(ideaId:string,userId:string|undefined,joined:boolean,comments:Comment[]|undefined,expanded:ReadonlySet<string>,active=true){
  const client=useQueryClient(),scope=`${ideaId}:${userId??""}`;
  // Retain confirmed receipts over older in-flight GET snapshots in this room.
  const [receipts,setReceipts]=useState<{scope:string;ids:Set<string>}>(()=>({scope,ids:new Set()}));
  const state=useQuery({
    queryKey:["unread-comments",ideaId,userId],
    queryFn:({signal})=>api<ReadState>(`/ideas/${encodeURIComponent(ideaId)}/read`,{signal}),
    enabled:!!userId&&joined,refetchInterval:15000,refetchOnWindowFocus:"always",refetchOnReconnect:"always",
  });
  const unread=useMemo(()=>new Set((state.data?.unreadIds??[]).filter(id=>receipts.scope!==scope||!receipts.ids.has(id))),[state.data,receipts,scope]);
  useEffect(()=>{
    if(joined&&userId&&comments)void client.invalidateQueries({queryKey:["unread-comments",ideaId,userId]});
  },[client,ideaId,userId,joined,comments]);
  const visible=useMemo(()=>visibleCommentIds(comments??[],expanded),[comments,expanded]);
  useEffect(()=>{
    if(!joined||!userId||!active)return;
    let disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    const ids=visible.filter(id=>unread.has(id)).slice(0,200);
    if(!ids.length)return;
    function attempt(){
      clearTimeout(timer);
      if(document.hidden||!document.hasFocus())return;
      timer=setTimeout(async()=>{
        if(disposed||document.hidden||!document.hasFocus())return;
        try{
          await api(`/ideas/${encodeURIComponent(ideaId)}/read`,{method:"POST",body:JSON.stringify({commentIds:ids}),signal:controller.signal});
          if(disposed)return;
          setReceipts(current=>({scope,ids:new Set([...(current.scope===scope?current.ids:[]),...ids])}));
          client.setQueryData<ReadState>(["unread-comments",ideaId,userId],current=>current?{unreadIds:current.unreadIds.filter(id=>!ids.includes(id))}:current);
          void client.invalidateQueries({queryKey:["unread",userId]});
        }catch{if(!disposed)timer=setTimeout(attempt,5000);}
      },600);
    }
    window.addEventListener("focus",attempt);document.addEventListener("visibilitychange",attempt);window.addEventListener("online",attempt);attempt();
    return()=>{disposed=true;clearTimeout(timer);controller.abort();window.removeEventListener("focus",attempt);document.removeEventListener("visibilitychange",attempt);window.removeEventListener("online",attempt);};
  },[ideaId,userId,joined,active,visible,unread,client,scope]);
  return unread;
}
