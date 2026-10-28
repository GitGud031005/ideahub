import assert from "node:assert/strict";
import {test} from "node:test";
import {activeRoom,roomCommentVisible,roomBranchVisible,waitForVisibleComment} from "../src/lib/room-attention";

test("only the visible room and rendered open branch can suppress a notification",async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,"document");
 let hidden=false,focused=true,modal=false,inert=false,rendered=true,top=150,branchTop=150;
 const pane={dataset:{ideaId:"room",userId:"reader"},closest:()=>inert?{}:null,contains:()=>true,getBoundingClientRect:()=>({top:100,bottom:600,height:500})};
 const article={getClientRects:()=>rendered?[{}]:[],getBoundingClientRect:()=>({top,bottom:top+100,height:100})};
 const branch={getClientRects:()=>rendered?[{}]:[],getBoundingClientRect:()=>({top:branchTop,bottom:branchTop+400,height:400})};
 Object.defineProperty(globalThis,"document",{configurable:true,value:{get hidden(){return hidden;},hasFocus:()=>focused,querySelector:(selector:string)=>selector==="dialog[open]"?(modal?{}:null):pane,getElementById:(id:string)=>id==="comment-new"?article:id==="children-parent"?branch:null}});
 try{
  assert(roomCommentVisible("room","new","reader"));assert(await waitForVisibleComment("room","new","reader"));
  assert(!roomCommentVisible("other-room","new","reader"));assert(!roomCommentVisible("room","new","other-account"));
  hidden=true;assert(!activeRoom("room","reader"));assert.equal(await waitForVisibleComment("room","new","reader"),false);hidden=false;
  focused=false;assert(roomCommentVisible("room","new","reader"),"returning from a notification can temporarily retain browser focus elsewhere");focused=true;
  modal=true;assert(!roomCommentVisible("room","new","reader"));modal=false;
  inert=true;assert(!roomCommentVisible("room","new","reader"));inert=false;
  rendered=false;assert(!roomCommentVisible("room","new","reader"));assert(!roomBranchVisible("room","parent","reader"));rendered=true;
  top=700;assert(!roomCommentVisible("room","new","reader"));
  assert(roomBranchVisible("room","parent","reader"),"visible replies keep a branch active even when the parent is above the pane");
  branchTop=700;assert(!roomBranchVisible("room","parent","reader"));
 }finally{if(previous)Object.defineProperty(globalThis,"document",previous);else Reflect.deleteProperty(globalThis,"document");}
});
