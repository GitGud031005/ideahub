"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Comment } from "@/lib/domain";

/** Acknowledge only the confirmed snapshot loaded in a visible, focused room. */
export function useReadComments(ideaId:string,userId:string|undefined,joined:boolean,comments:Comment[]|undefined){
  const client=useQueryClient(),confirmed=useRef("");
  useEffect(()=>{confirmed.current="";},[ideaId,userId]);
  useEffect(()=>{
    if(!joined||!userId||!comments?.length)return;
    const latest=comments.reduce<Comment|undefined>((last,c)=>c.readCursor&&(!last||BigInt(c.readCursor)>BigInt(last.readCursor!))?c:last,undefined);
    if(!latest)return;
    let disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    function attempt(){
      clearTimeout(timer);
      if(document.hidden||!document.hasFocus()||confirmed.current===latest!.id)return;
      timer=setTimeout(async()=>{
        if(disposed||document.hidden||!document.hasFocus())return;
        try{
          await api(`/ideas/${encodeURIComponent(ideaId)}/read`,{method:"POST",body:JSON.stringify({commentId:latest!.id}),signal:controller.signal});
          if(!disposed){confirmed.current=latest!.id;void client.invalidateQueries({queryKey:["unread",userId]});}
        }catch{if(!disposed)timer=setTimeout(attempt,5000);}
      },600);
    }
    window.addEventListener("focus",attempt);document.addEventListener("visibilitychange",attempt);window.addEventListener("online",attempt);attempt();
    return()=>{disposed=true;clearTimeout(timer);controller.abort();window.removeEventListener("focus",attempt);document.removeEventListener("visibilitychange",attempt);window.removeEventListener("online",attempt);};
  },[ideaId,userId,joined,comments,client]);
}
