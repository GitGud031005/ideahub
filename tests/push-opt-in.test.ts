import assert from "node:assert/strict";
import {test} from "node:test";
import {PUSH_INVITE_DELAY,clearPushInviteDecision,deferPushInvite,enableDevicePush,disableDevicePush,readPushInviteDecision,shouldInvitePush} from "../src/lib/device-push";
const eligible={support:"available" as const,permission:"default" as const,subscribed:false,decision:null};
test("invitation respects subscriptions and offers a recovery guide for blocked permissions",()=>{
 assert.equal(shouldInvitePush(eligible),true);
 assert.equal(shouldInvitePush({...eligible,support:"unsupported"}),false);
 assert.equal(shouldInvitePush({...eligible,permission:"denied"}),true);
 assert.equal(shouldInvitePush({...eligible,permission:"denied",subscribed:true}),true,"A stale subscription must not hide the blocked-permission guide");
 assert.equal(shouldInvitePush({...eligible,permission:"denied",decision:{until:Date.now()+PUSH_INVITE_DELAY}}),false);
 assert.equal(shouldInvitePush({...eligible,subscribed:true}),false);
 assert.equal(shouldInvitePush({...eligible,support:"install-ios"}),true);
});
test("later is remembered per user and expires after seven days, including without web storage",()=>{
 deferPushInvite("later-a",{now:1000});
 const decision=readPushInviteDecision("later-a");assert.equal(decision?.until,1000+PUSH_INVITE_DELAY);
 assert.equal(shouldInvitePush({...eligible,decision,now:1001}),false);
 assert.equal(shouldInvitePush({...eligible,decision,now:1001+PUSH_INVITE_DELAY}),true);
 assert.equal(readPushInviteDecision("later-b"),null);
 clearPushInviteDecision("later-a");assert.equal(readPushInviteDecision("later-a"),null);
});
test("deferring the iOS installation guide does not defer permission in the installed app",()=>{
 deferPushInvite("iphone",{now:1000,scope:"install"});
 assert(readPushInviteDecision("iphone","install"));assert.equal(readPushInviteDecision("iphone","push"),null);
 deferPushInvite("manual-off",{permanently:true});assert.equal(shouldInvitePush({...eligible,decision:readPushInviteDecision("manual-off"),now:Date.now()+PUSH_INVITE_DELAY}),false);
});
test("enabling asks permission synchronously from the click and only subscribes after consent",async t=>{
 const descriptors=new Map(["window","Notification","navigator","localStorage","fetch"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 t.after(()=>{for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
 const calls:string[]=[],storage=new Map<string,string>();let permission:NotificationPermission="default",answer:NotificationPermission="granted",subscription:any=null;
 const notification={get permission(){return permission;},requestPermission(){calls.push("permission");permission=answer;return Promise.resolve(answer);}};
 const pushManager={getSubscription:async()=>subscription,subscribe:async()=>{calls.push("subscribe");subscription={endpoint:"https://fcm.googleapis.com/test",options:{},toJSON:()=>({endpoint:"https://fcm.googleapis.com/test",keys:{p256dh:"test",auth:"test"}}),async unsubscribe(){calls.push("unsubscribe");subscription=null;return true;}};return subscription;}};
 const registration={pushManager,active:{postMessage:(value:any)=>{assert.equal(value.userId,"opt-in-user");calls.push("account");}}};
 Object.defineProperties(globalThis,{
  window:{configurable:true,value:{isSecureContext:true,Notification:notification,PushManager:class{},matchMedia:()=>({matches:false}),dispatchEvent:()=>true}},
  Notification:{configurable:true,value:notification},
  navigator:{configurable:true,value:{userAgent:"Chrome",platform:"Linux",maxTouchPoints:0,serviceWorker:{getRegistration:async()=>registration,register:async()=>{calls.push("register");return registration;},ready:Promise.resolve(registration)}}},
  localStorage:{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}},
  fetch:{configurable:true,value:async(path:string)=>{calls.push(path);return Response.json(path.endsWith("config")?{publicKey:"B"+"A".repeat(86)}:{ok:true});}}
 });
 const pending=enableDevicePush("opt-in-user");assert.deepEqual(calls,["permission"],"No async work may consume the permission gesture first");
 assert.equal(await pending,"on");assert(calls.indexOf("permission")<calls.indexOf("subscribe"));assert.equal(storage.get("ih-push-user"),"opt-in-user");
 await disableDevicePush("opt-in-user");assert(calls.includes("unsubscribe"));assert.equal(storage.has("ih-push-user"),false);assert.equal(shouldInvitePush({...eligible,decision:readPushInviteDecision("opt-in-user")}),false);
 permission="default";answer="denied";calls.length=0;assert.equal(await enableDevicePush("opt-in-user"),"denied");assert.deepEqual(calls,["permission"]);
 calls.length=0;assert.equal(await enableDevicePush("opt-in-user"),"denied");assert.deepEqual(calls,[],"A blocked browser must never be prompted again through requestPermission");
});
