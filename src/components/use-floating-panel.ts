"use client";
import {useLayoutEffect,useState,type RefObject} from "react";
import {floatingPanel} from "@/lib/floating-panel";

export function useFloatingPanel(open:boolean,anchor:RefObject<HTMLElement|null>,panel:RefObject<HTMLElement|null>,{width=320,maxHeight=288,preferAbove=false,minAnchorWidth=false}:{width?:number|"anchor";maxHeight?:number;preferAbove?:boolean;minAnchorWidth?:boolean}={}){
 const [position,setPosition]=useState<ReturnType<typeof floatingPanel>>();
 useLayoutEffect(()=>{
  if(!open){setPosition(undefined);return;}
  const viewport=window.visualViewport;let frame=0;
  const update=()=>{
   const field=anchor.current,menu=panel.current;if(!field||!menu)return;
   const rect=field.getBoundingClientRect(),next=floatingPanel(rect,{left:viewport?.offsetLeft??0,top:viewport?.offsetTop??0,width:viewport?.width??window.innerWidth,height:viewport?.height??window.innerHeight},{width:width==="anchor"?rect.width:Math.max(width,minAnchorWidth?rect.width:0),height:Math.min(maxHeight,menu.scrollHeight||maxHeight),preferAbove});
   setPosition(current=>current&&Object.keys(next).every(key=>current[key as keyof typeof next]===next[key as keyof typeof next])?current:next);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
  const observer=new ResizeObserver(schedule);if(anchor.current)observer.observe(anchor.current);if(panel.current)observer.observe(panel.current);
  update();window.addEventListener("resize",schedule);document.addEventListener("scroll",schedule,true);viewport?.addEventListener("resize",schedule);viewport?.addEventListener("scroll",schedule);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",schedule);document.removeEventListener("scroll",schedule,true);viewport?.removeEventListener("resize",schedule);viewport?.removeEventListener("scroll",schedule);};
 },[open,anchor,panel,width,maxHeight,preferAbove,minAnchorWidth]);
 return {position:"fixed" as const,...position,visibility:position?"visible" as const:"hidden" as const,right:"auto",bottom:"auto",minWidth:0,maxWidth:"none"};
}
