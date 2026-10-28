import {AppRouterContext} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {useState,useEffect} from "react";
import {Providers} from "../../src/components/providers";
import {Discussion} from "../../src/components/discussion";
import {deferPushInvite} from "../../src/lib/device-push";
import type {Comment,RoomNotification} from "../../src/lib/domain";
const viewer={id:"qa-reader",name:"Người đọc QA",initial:"Q",username:"qa"},writer={id:"qa-writer",name:"Người gửi QA",initial:"G"};
let sequence=0,last="qa-target";
const room="qa-room",make=(id:string,parentId:string|null,text:string,at:number):Comment=>({id,parentId,text,ideaId:room,author:writer,createdAt:new Date(at).toISOString()});
const base=Date.now()-100000;
let comments:Comment[]=[make("qa-root",null,"Nhánh đang đọc từ thông báo",base),make("qa-target","qa-root","Tin nhắn được mở từ thông báo",base+10),...Array.from({length:25},(_,i)=>make(`qa-old-${i}`,null,`Góc nhìn ${i+1}. Nội dung kiểm tra chiều cao phòng và cuộn trên điện thoại.`,base-i*1000-1000))];
const notifications:RoomNotification[]=[{id:"qa-notice",userId:viewer.id,ideaId:room,ideaTitle:"Phòng QA",commentId:"qa-target",actor:writer,kind:"reply",excerpt:"Tin nhắn được mở từ thông báo",createdAt:new Date(base+10).toISOString(),readAt:null}];
const read=new Set<string>();
class MockSource extends EventTarget{static all:MockSource[]=[];onopen:(()=>void)|null=null;onerror=null;constructor(public url:string){super();MockSource.all.push(this);setTimeout(()=>{this.onopen?.();this.dispatchEvent(new Event(url.includes("notifications")?"notifications-changed":"comments-changed"));},20);}close(){MockSource.all=MockSource.all.filter(s=>s!==this);}}
Object.defineProperty(window,"EventSource",{value:MockSource});
const worker={active:{postMessage(){}},pushManager:{getSubscription:async()=>null}};
Object.defineProperty(navigator,"serviceWorker",{value:{register:async()=>worker,ready:Promise.resolve(worker),getRegistration:async()=>worker,addEventListener(){},removeEventListener(){}}});
deferPushInvite(viewer.id,{permanently:true});
window.fetch=async(input,init)=>{
 const path=new URL(String(input),location.origin).pathname,body=init?.body?JSON.parse(String(init.body)):{};let result:unknown;
 if(path==="/api/session")result={user:viewer,storage:"memory"};
 else if(path==="/api/notifications/read"){for(const n of notifications)if(body.ids==="all"||body.ids?.includes(n.id))n.readAt=new Date().toISOString();result={ok:true};}
 else if(path==="/api/notifications")result={items:[...notifications].reverse(),unread:notifications.filter(n=>!n.readAt).length,nextCursor:null};
 else if(path==="/api/unread")result={[room]:comments.filter(c=>!read.has(c.id)).length};
 else if(path.endsWith("/notification-settings"))result={muted:false};
 else if(path.endsWith("/members"))result=[viewer,writer];
 else if(path.endsWith("/recaps"))result={items:[],nextOffset:null};
 else if(path.endsWith("/context"))result=comments;
 else if(path.endsWith("/read")){
  if(init?.method==="POST"){for(const id of body.commentIds??[])read.add(id);for(const n of notifications)if(read.has(n.commentId))n.readAt=new Date().toISOString();result={ok:true};}
  else result={unreadIds:comments.filter(c=>!read.has(c.id)).map(c=>c.id)};
 }
 else if(path.endsWith("/comments"))result={items:comments,total:comments.length,nextCursor:null};
 else if(path===`/api/ideas/${room}`)result={id:room,title:"Phòng QA",description:"Dữ liệu tổng hợp, không có tin thật",creator:writer,createdAt:new Date(base).toISOString(),joined:true,mine:false,tags:[],status:"potential",memberCount:2,commentCount:comments.length,lastCommentAt:null};
 else if(path==="/api/ideas")result={items:[],total:0,counts:{},nextCursor:null};
 else throw Error(`Unexpected QA API: ${path}`);
 return new Response(JSON.stringify(result),{headers:{"Content-Type":"application/json"}});
};
function arrival(kind:string){setTimeout(()=>{
 const id=`qa-new-${++sequence}`,parent=kind==="root"?null:kind==="sibling"?"qa-root":kind==="child"?"qa-target":last;
 const comment=make(id,parent,`Tin mới ${sequence}: ${kind}`,Date.now());comments=[...comments,comment];last=id;
 notifications.push({id:`notice-${id}`,userId:viewer.id,ideaId:kind==="other"?"qa-other":room,ideaTitle:"Phòng QA",commentId:id,actor:writer,kind:"message",excerpt:comment.text,createdAt:comment.createdAt,readAt:null});
 // Deliberately deliver inbox first to exercise the notification-click race.
 for(const s of MockSource.all)if(s.url.includes("notifications"))s.dispatchEvent(new Event("notifications-changed"));
 setTimeout(()=>{for(const s of MockSource.all)if(!s.url.includes("notifications"))s.dispatchEvent(new Event("comments-changed"));},700);
},600);}
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.data?.type==="qa:arrival")arrival(e.data.kind);});
function App(){const [requested,setRequested]=useState<string|undefined>();useEffect(()=>{const go=(e:Event)=>setRequested(new URL((e as CustomEvent).detail,location.origin).searchParams.get("comment")??undefined);window.addEventListener("qa:navigate",go);return()=>window.removeEventListener("qa:navigate",go);},[]);return <Providers><Discussion id={room} requestedComment={requested}/></Providers>;}
const qaRouter={bfcacheId:"qa",back(){},forward(){},refresh(){},hmrRefresh(){},push:(url:string)=>window.dispatchEvent(new CustomEvent("qa:navigate",{detail:url})),replace(){},prefetch:async()=>{}};
export default function Fixture(){return <AppRouterContext.Provider value={qaRouter}><App/></AppRouterContext.Provider>;}
