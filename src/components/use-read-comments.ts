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
  const structural=useMemo(()=>visibleCommentIds(comments??[],expanded),[comments,expanded]);
  const [inView,setInView]=useState<Set<string>>(()=>new Set());
  useEffect(()=>{const root=document.querySelector(".ih-thread-comments");if(!root||!active)return;const nodes=structural.map(id=>document.getElementById(`comment-${id}`)).filter((el):el is HTMLElement=>!!el&&el.getClientRects().length>0);const observer=new IntersectionObserver(entries=>{setInView(current=>{const next=new Set(current);for(const entry of entries){const id=entry.target.id.slice(8);if(entry.isIntersecting)next.add(id);else next.delete(id);}return next;});},{root,threshold:0.1});setInView(new Set());for(const node of nodes)observer.observe(node);return()=>observer.disconnect();},[structural,active]);
  const visible=useMemo(()=>structural.filter(id=>inView.has(id)),[structural,inView]);
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
