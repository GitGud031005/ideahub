"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Bell,Check,X} from "lucide-react";
import {browserPushSupport,type PushSupport} from "@/lib/push-support";
import {deferPushInvite,enableDevicePush,hasDevicePush,readPushInviteDecision,shouldInvitePush} from "@/lib/device-push";
import {useAuth} from "./providers";
import {useSurface} from "./use-surface";

export function PushOptIn(){
 const {user,ready}=useAuth(),[open,setOpen]=useState(false),[support,setSupport]=useState<PushSupport>("unsupported"),[guide,setGuide]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),currentUser=useRef(user?.id),handled=useRef<string|null>(null);currentUser.current=user?.id;
 useSurface(open,()=>{if(!busy)setOpen(false);});
 useEffect(()=>{
  setOpen(false);setGuide(false);setDone(false);setError("");setBusy(false);
  if(!ready||!user||handled.current===user.id)return;
  const userId=user.id;let disposed=false,timer:ReturnType<typeof setTimeout>;
  const scope=browserPushSupport()==="install-ios"?"install":"push";
  const schedule=()=>{timer=setTimeout(async()=>{
   if(disposed)return;
   if(document.hidden||document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){schedule();return;}
   const state=browserPushSupport(),permission=typeof Notification==="undefined"?"default":Notification.permission;
   if(!shouldInvitePush({support:state,permission,subscribed:false,decision:readPushInviteDecision(userId,scope)}))return;
   try{if(state==="available"&&await hasDevicePush(userId))return;}catch{}
   if(disposed)return;
   if(document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]')){schedule();return;}
   handled.current=userId;setOpen(true);
  },1800);};
  const state=browserPushSupport(),permission=typeof Notification==="undefined"?"default":Notification.permission;
  if(!shouldInvitePush({support:state,permission,subscribed:false,decision:readPushInviteDecision(userId,scope)}))return;
  setSupport(state);
  void (state==="available"?hasDevicePush(userId):Promise.resolve(false)).then(subscribed=>{if(!disposed&&!subscribed)schedule();}).catch(()=>{if(!disposed)schedule();});
  return()=>{disposed=true;clearTimeout(timer);};
 },[user?.id,ready]);
 useEffect(()=>{
  if(!open)return;const el=dialog.current;if(!el)return;
  const opener=document.activeElement as HTMLElement|null,previous=document.body.style.overflow;
  el.showModal();document.body.style.overflow="hidden";
  return()=>{el.close();document.body.style.overflow=previous;if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[open]);
 function later(){if(busy)return;if(user)deferPushInvite(user.id,{scope:support==="install-ios"?"install":"push"});setOpen(false);}
 async function enable(){
  if(!user||busy)return;
  if(support==="install-ios"){if(guide)later();else setGuide(true);return;}
  const userId=user.id;setBusy(true);setError("");
  try{const result=await enableDevicePush(userId);if(currentUser.current!==userId)return;if(result==="on")setDone(true);else if(result==="denied"){setError("Bạn đã chọn không cho phép. IdeaHub sẽ không hỏi lại quyền trên trình duyệt này");deferPushInvite(userId);setDone(true);}else setError("Bạn chưa chọn quyền thông báo. Có thể thử lại hoặc chọn Để sau");}
  catch(e){if(currentUser.current===userId)setError(e instanceof Error?e.message:"Chưa bật được thông báo. Bạn có thể thử lại");}
  finally{if(currentUser.current===userId)setBusy(false);}
 }
 if(!open||!user)return null;
 return createPortal(<dialog ref={dialog} className="ih-push-invite" aria-labelledby="push-invite-title" aria-describedby="push-invite-copy" aria-busy={busy} onCancel={e=>{e.preventDefault();later();}}>
  <button type="button" className="ih-icon-button ih-push-invite-close" aria-label="Để sau và đóng lời mời thông báo" disabled={busy} onClick={later}><X size={18}/></button>
  <span className="ih-push-invite-icon" aria-hidden="true">{done&&!error?<Check size={26}/>:<Bell size={25}/>}</span>
  <h2 id="push-invite-title">{done&&!error?"Đã bật thông báo":done?"Đã ghi nhận lựa chọn":"Không bỏ lỡ góc nhìn mới"}</h2>
  <p id="push-invite-copy">{done&&!error?"Bạn sẽ nhận lời nhắc khi có người nhắc tên hoặc trả lời bạn trên thiết bị này":done?"Bạn vẫn có thể xem mọi thông báo bằng biểu tượng chuông trong IdeaHub":"Nhận thông báo khi có người nhắc tên hoặc trả lời bạn, kể cả lúc chưa mở IdeaHub"}</p>
  {support==="install-ios"&&!done&&<p className="ih-push-invite-note">Trên iPhone/iPad, cần mở IdeaHub từ biểu tượng đã thêm vào Màn hình chính</p>}
  {guide&&<ol className="ih-push-invite-steps"><li>Trong Safari, nhấn Chia sẻ → Thêm vào Màn hình chính</li><li>Mở IdeaHub từ biểu tượng vừa thêm và đăng nhập</li><li>Chọn Bật thông báo tại popup rồi nhấn Cho phép</li></ol>}
  {error&&<p className="ih-form-error" role="alert">{error}</p>}
  <div className="ih-push-invite-actions">{done?<button type="button" className="ih-primary" onClick={()=>setOpen(false)}>Xong</button>:<><button type="button" className="ih-secondary" disabled={busy} onClick={later}>Để sau</button><button type="button" className="ih-primary" disabled={busy} onClick={()=>void enable()}>{busy?"Đang bật…":support==="install-ios"?guide?"Đã hiểu":"Cách bật trên iPhone":"Bật thông báo"}</button></>}</div>
  {!done&&<small>Có thể thay đổi lựa chọn bằng biểu tượng chuông bất cứ lúc nào</small>}
 </dialog>,document.body);
}
