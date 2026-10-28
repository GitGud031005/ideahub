import assert from "node:assert/strict";
import {test} from "node:test";
import {extendOpenReplies,openReplyPath,reconcileRoomFeed} from "../src/lib/live-room-feed";
import {inlineEditorScroll} from "../src/lib/inline-editor-scroll";
import type {Comment} from "../src/lib/domain";
const c=(id:string,parentId:string|null):Comment=>({id,parentId,ideaId:"room",author:{id:"other",name:"Other",initial:"O"},text:id,createdAt:"2026-10-28T00:00:00Z"});
test("opening a notification keeps later self-replies and deep replies live, regardless of snapshot order",()=>{
 const old=[c("root",null),c("target","root"),c("closed","root"),c("hidden","closed")];
 const incoming=[c("deep","first"),c("first","target"),c("hidden-new","hidden")];
 const opened=extendOpenReplies(new Set(old.map(c=>c.id)),[...incoming,...old],new Set(["root","target","hidden"]));
 assert(opened.has("first"));assert(opened.has("deep"));assert(!opened.has("closed"));assert(!opened.has("hidden-new"));
 const collapsed=extendOpenReplies(new Set(old.map(c=>c.id)),[...old,...incoming],new Set(["root"]));
 assert(!collapsed.has("first"));assert(!collapsed.has("deep"));
});
test("new-message markers cannot hide new roots or replies after notification navigation disables edge following",()=>{
 const old=[c("root",null),c("target","root")],fresh=[...old,c("new-root",null),c("reply","target")];
 const result=reconcileRoomFeed(fresh,new Set(old.map(c=>c.id)),new Set(),"me",false,c=>c.parentId==="target");
 assert.deepEqual(result.items,fresh);assert.deepEqual(result.queued.map(c=>c.id),["new-root"]);
 const repeated=reconcileRoomFeed(fresh,new Set(fresh.map(c=>c.id)),new Set(["new-root"]),"me",false,()=>false);
 assert.equal(repeated.items.length,4);assert.equal(repeated.queued.length,1);
});
test("collapsed ancestors keep the new-message marker even if a descendant remains expanded",()=>{
 const comments=[c("root",null),c("child","root"),c("reply","child")],byId=new Map(comments.map(c=>[c.id,c]));
 assert.equal(openReplyPath(comments[2],byId,new Set(["child"])),false);
 assert.equal(openReplyPath(comments[2],byId,new Set(["root","child"])),true);
 const result=reconcileRoomFeed(comments,new Set(["root","child"]),new Set(),"me",false,c=>openReplyPath(c,byId,new Set(["child"])));
 assert.deepEqual(result.queued.map(c=>c.id),["reply"]);
});
test("mobile inline reply keeps field and send controls inside short and panned viewports",()=>{
 for(const height of [280,320,390,480,568,667,844])for(const pan of [0,48]){
  const pane={top:pan+64,bottom:pan+height},field={top:pan+height+120,bottom:pan+height+180},footer={top:pan+height+190,bottom:pan+height+234};
  const next=inlineEditorScroll(pane,field,footer,{top:pan,bottom:pan+height},400),delta=next-400;
  assert(field.top-delta>=pane.top+8);assert(footer.bottom-delta<=pane.bottom-8);
 }
 assert.equal(inlineEditorScroll({top:64,bottom:400},{top:120,bottom:180},{top:190,bottom:234},{top:0,bottom:400},200),200);
});
