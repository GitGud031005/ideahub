"use client";
import {useLayoutEffect,useRef,useState} from "react";
import type {Comment} from "@/lib/domain";
import {openReplyPath,reconcileRoomFeed} from "@/lib/live-room-feed";

export function useRoomFeed(data:Comment[]|undefined,userId:string|undefined,following:React.RefObject<boolean>,expanded:ReadonlySet<string>){
  const [state,setState]=useState<{items:Comment[];queued:Comment[]}>({items:[],queued:[]}),initialized=useRef(false);
  useLayoutEffect(()=>{
    if(!data)return;
    if(!initialized.current){initialized.current=true;setState({items:data,queued:[]});return;}
    const byId=new Map(data.map(c=>[c.id,c]));
    setState(current=>reconcileRoomFeed(data,new Set(current.items.map(c=>c.id)),new Set(current.queued.map(c=>c.id)),userId,following.current,c=>openReplyPath(c,byId,expanded)));
  },[data,userId,following,expanded]);
  function release(snapshot?:Comment[]){const next=state.queued[0];setState(current=>({items:snapshot??current.items,queued:[]}));return next?.id;}
  function releaseBranch(parentId:string){setState(current=>({...current,queued:current.queued.filter(c=>c.parentId!==parentId)}));}
  return {...state,release,releaseBranch};
}
