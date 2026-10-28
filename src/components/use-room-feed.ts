"use client";
import {useLayoutEffect,useRef,useState} from "react";
import type {Comment} from "@/lib/domain";
import {roomBranchVisible} from "@/lib/room-attention";

export function useRoomFeed(data:Comment[]|undefined,userId:string|undefined,following:React.RefObject<boolean>,expanded:ReadonlySet<string>){
  const [state,setState]=useState<{items:Comment[];queued:Comment[]}>({items:[],queued:[]}),initialized=useRef(false);
  useLayoutEffect(()=>{
    if(!data)return;
    if(!initialized.current){initialized.current=true;setState({items:data,queued:[]});return;}
    setState(current=>{
      const existing=new Set(current.items.map(c=>c.id)),held=new Set(current.queued.map(c=>c.id)),items:Comment[]=[],queued:Comment[]=[];
      for(const c of data){
        if(existing.has(c.id)||c.author.id===userId||following.current&&!held.has(c.id))items.push(c);
        // Keep replies live in the branch the reader is actually viewing, even away from the room's newest edge.
        else if(userId&&c.parentId&&expanded.has(c.parentId)&&roomBranchVisible(c.ideaId,c.parentId,userId))items.push(c);
        else queued.push(c);
      }
      return {items,queued};
    });
  },[data,userId,following,expanded]);
  function release(snapshot?:Comment[]){const next=state.queued[0];setState(current=>({items:snapshot??[...current.items,...current.queued],queued:[]}));return next?.id;}
  function releaseBranch(parentId:string){setState(current=>({items:[...current.items,...current.queued.filter(c=>c.parentId===parentId)],queued:current.queued.filter(c=>c.parentId!==parentId)}));}
  return {...state,release,releaseBranch};
}
