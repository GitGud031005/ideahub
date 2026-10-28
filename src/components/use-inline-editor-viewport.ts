"use client";
import {useEffect,type RefObject} from "react";
import {inlineEditorScroll} from "@/lib/inline-editor-scroll";

export function useInlineEditorViewport(enabled:boolean,field:RefObject<HTMLTextAreaElement|null>){
  useEffect(()=>{
    const textarea=field.current,form=textarea?.closest<HTMLElement>(".ih-reply-form"),pane=textarea?.closest<HTMLElement>(".ih-thread-comments");
    if(!enabled||!textarea||!form||!pane)return;
    const viewport=window.visualViewport;let frame=0;
    const place=()=>{
      if(!window.matchMedia("(max-width:760px), (max-width:1000px) and (max-height:500px)").matches||!form.contains(document.activeElement)||pane.closest("[inert]"))return;
      const footer=form.querySelector<HTMLElement>(".ih-reply-form-footer");if(!footer)return;
      const top=viewport?.offsetTop??0,bottom=top+(viewport?.height??window.innerHeight);
      const next=inlineEditorScroll(pane.getBoundingClientRect(),textarea.getBoundingClientRect(),footer.getBoundingClientRect(),{top,bottom},pane.scrollTop);
      if(Math.abs(next-pane.scrollTop)>=1)pane.scrollTo({top:next,behavior:"instant"});
    };
    // Let viewport CSS and the hidden main composer settle before measuring the reply.
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(place);});};
    const observer=new ResizeObserver(schedule);observer.observe(form);observer.observe(pane);
    form.addEventListener("focusin",schedule);textarea.addEventListener("input",schedule);
    window.addEventListener("resize",schedule);viewport?.addEventListener("resize",schedule);viewport?.addEventListener("scroll",schedule);schedule();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();form.removeEventListener("focusin",schedule);textarea.removeEventListener("input",schedule);window.removeEventListener("resize",schedule);viewport?.removeEventListener("resize",schedule);viewport?.removeEventListener("scroll",schedule);};
  },[enabled,field]);
}
