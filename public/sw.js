/* Notifications only: authenticated pages and API responses are never cached. */
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
function account(value){return new Promise((resolve,reject)=>{const request=indexedDB.open("ideahub-notification-account",1);request.onupgradeneeded=()=>request.result.createObjectStore("settings");request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction("settings",value===undefined?"readonly":"readwrite"),s=tx.objectStore("settings"),op=value===undefined?s.get("account"):s.put(value,"account");let result;op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
self.addEventListener("message",e=>{if(e.data?.type==="ACCOUNT")e.waitUntil(account(e.data.userId).then(async()=>{for(const n of await self.registration.getNotifications())if(n.data?.userId!==e.data.userId)n.close();}));});
// A delivered Web Push must always result in a visible notification (including Safari/iOS).
// If an account changed while the push was in flight, expose no message or recipient data.
async function genericNotification(){await self.registration.showNotification("IdeaHub",{body:"Mở IdeaHub để xem thông báo mới",icon:"/icon-192.png",tag:"ideahub:account",data:{url:"/"}});}
self.addEventListener("push",event=>event.waitUntil((async()=>{
 let data,current;try{data=event.data?.json();current=await account();}catch{await genericNotification();return;}
 if(!data?.userId||current!==data.userId){await genericNotification();return;}
 await self.registration.showNotification(data.title||"IdeaHub",{body:data.body||"Bạn có thông báo mới",icon:"/icon-192.png",badge:"/icon-192.png",tag:`ideahub:${data.id}`,renotify:false,data});
})()));
self.addEventListener("notificationclick",event=>{const data=event.notification.data;event.notification.close();event.waitUntil((async()=>{
 let current;try{current=await account();}catch{}let url=new URL("/",self.location.origin);
 if(data?.userId&&current===data.userId){const target=new URL(data.url,self.location.origin);if(target.origin!==url.origin||!target.pathname.startsWith("/ideas/"))return;url=target;try{await fetch("/api/notifications/read",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:[data.id]})});}catch{}}
 const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true}),existing=windows.find(w=>new URL(w.url).origin===url.origin);
 if(existing){await existing.navigate(url.href);await existing.focus();}else await self.clients.openWindow(url.href);
})());});
