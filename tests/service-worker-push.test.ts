import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {runInNewContext} from "node:vm";
import {allowedPushEndpoint} from "../src/server/web-push";
const source=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
function worker(user="a",appReady=false){
 let navigated=0,focused=0;
 const handlers=new Map<string,(event:any)=>void>(),shown:{title:string;options:any}[]=[],reads:unknown[]=[],opened:string[]=[];
 const context:any={URL,setTimeout,clearTimeout,MessageChannel:class {port1:any;port2:any;constructor(){this.port1={onmessage:null,close(){}};this.port2={postMessage:(data:any)=>this.port1.onmessage?.({data})};}},fetch:async(...args:unknown[])=>{reads.push(args);return new Response("{}");},self:{location:{origin:"https://ideahub.test"},addEventListener:(type:string,handler:any)=>handlers.set(type,handler),registration:{showNotification:async(title:string,options:any)=>{shown.push({title,options});}},clients:{matchAll:async()=>appReady?[{url:"https://ideahub.test/ideas/room",focus:async()=>{focused++;},navigate:async()=>{navigated++;},postMessage:(data:any,ports:any[])=>{if(data.type==="OPEN_COMMENT")ports[0].postMessage({opened:true});}}]:[],openWindow:async(url:string)=>{opened.push(url);}}}};
 runInNewContext(source,context);context.account=async()=>user;
 const invoke=async(type:string,event:any)=>{let pending:Promise<void>|undefined;handlers.get(type)!({...event,waitUntil:(p:Promise<void>)=>{pending=p;}});await pending;};
 return {shown,reads,opened,invoke,navigated:()=>navigated,focused:()=>focused};
}
const payload={id:"n",userId:"a",title:"Room",body:"Private message",url:"/ideas/room?comment=c"};
test("push always displays a notification instead of a silent foreground suppression",async()=>{
 const w=worker();await w.invoke("push",{data:{json:()=>payload}});assert.equal(w.shown.length,1);assert.equal(w.shown[0].options.body,payload.body);
});
test("in-flight pushes after an account change show only a generic notification",async()=>{
 const w=worker("b");await w.invoke("push",{data:{json:()=>payload}});assert.equal(w.shown.length,1);assert(!JSON.stringify(w.shown).includes(payload.body));assert(!JSON.stringify(w.shown).includes("room"));assert.deepEqual(JSON.parse(JSON.stringify(w.shown[0].options.data)),{url:"/"});
});
test("invalid payloads still have a safe visible fallback",async()=>{
 const w=worker();await w.invoke("push",{data:{json:()=>{throw Error("Invalid JSON");}}});assert.equal(w.shown.length,1);assert.equal(w.shown[0].title,"IdeaHub");
});
test("notification click opens the same-account source; generic and changed-account clicks go home",async()=>{
 const w=worker();await w.invoke("notificationclick",{notification:{data:payload,close(){}}});assert.equal(w.reads.length,1);assert.equal(w.opened[0],"https://ideahub.test/ideas/room?comment=c");
 const changed=worker("b");await changed.invoke("notificationclick",{notification:{data:payload,close(){}}});assert.equal(changed.reads.length,0);assert.equal(changed.opened[0],"https://ideahub.test/");
 const generic=worker();await generic.invoke("notificationclick",{notification:{data:{url:"/"},close(){}}});assert.equal(generic.reads.length,0);assert.equal(generic.opened[0],"https://ideahub.test/");
});
test("Apple push endpoints accept Apple subdomains without accepting lookalike hosts",()=>{
 assert.equal(allowedPushEndpoint("https://web.push.apple.com/qa"),true);assert.equal(allowedPushEndpoint("https://region.push.apple.com/qa"),true);assert.equal(allowedPushEndpoint("https://web.push.apple.com.evil.test/qa"),false);assert.equal(allowedPushEndpoint("http://web.push.apple.com/qa"),false);
});

test("clicking push reuses a ready room without a page reload",async()=>{
 const w=worker("a",true);await w.invoke("notificationclick",{notification:{data:payload,close(){}}});assert.equal(w.focused(),1);assert.equal(w.navigated(),0);assert.equal(w.opened.length,0);assert.equal(w.reads.length,1);
});
test("sequential pushes retain separate notification tags and can alert again",async()=>{
 const w=worker();for(let i=0;i<4;i++)await w.invoke("push",{data:{json:()=>({...payload,id:`message-${i}`})}});assert.equal(new Set(w.shown.map(n=>n.options.tag)).size,4);assert(w.shown.every(n=>n.options.renotify));
});
