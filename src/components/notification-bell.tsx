"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {useInfiniteQuery,useQuery,useQueryClient} from "@tanstack/react-query";
import {Bell,BellOff,CheckCheck,Check,X,RefreshCw,AlertCircle,ArrowUpRight,Inbox} from "lucide-react";
import {createPortal} from "react-dom";
import {browserPushSupport} from "@/lib/push-support";
import {useRouter} from "next/navigation";
import type {NotificationsPage,RoomNotification} from "@/lib/domain";
import {api} from "@/lib/api-client";
import {commentHref} from "@/lib/mentions";
import {relativeTime} from "@/lib/format";
import {useAuth} from "./providers";
import {Avatar} from "./avatar";
import {useSurface} from "./use-surface";
function useInbox(){const {user}=useAuth();return useQuery({queryKey:["notifications",user?.id],queryFn:({signal})=>api<NotificationsPage>("/notifications",{signal}),enabled:!!user,refetchInterval:5000,refetchOnWindowFocus:"always",refetchOnReconnect:"always",staleTime:0});}
function visibleComment(n:RoomNotification){const el=document.getElementById(`comment-${n.commentId}`),root=document.querySelector(".ih-thread-comments"),a=el?.getBoundingClientRect(),b=root?.getBoundingClientRect();return !document.hidden&&document.hasFocus()&&!!el?.getClientRects().length&&!!a&&!!b&&a.bottom>b.top&&a.top<b.bottom;}
function keyBytes(value:string){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
export function NotificationRuntime(){
 const {user,ready}=useAuth(),inbox=useInbox(),router=useRouter(),client=useQueryClient(),seen=useRef<{userId:string;ids:Set<string>}|null>(null),[toast,setToast]=useState<RoomNotification|null>(null);
 useEffect(()=>{if(!ready||!("serviceWorker" in navigator))return;let disposed=false;void navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).then(async()=>{const r=await navigator.serviceWorker.ready;if(disposed)return;r.active?.postMessage({type:"ACCOUNT",userId:user?.id??null});if(user&&"Notification" in window&&Notification.permission==="granted"&&localStorage.getItem("ih-push-user")===user.id){const s=await r.pushManager.getSubscription();if(s)await api("/push/subscribe",{method:"POST",body:JSON.stringify(s.toJSON())});}}).catch(()=>{});return()=>{disposed=true;};},[user?.id,ready]);
 useEffect(()=>{if(!user||!inbox.data){setToast(null);return;}if(seen.current?.userId!==user.id){seen.current={userId:user.id,ids:new Set(inbox.data.items.map(n=>n.id))};return;}let disposed=false;for(const n of [...inbox.data.items].reverse()){if(seen.current.ids.has(n.id))continue;seen.current.ids.add(n.id);if(n.readAt||document.hidden||!document.hasFocus())continue;if(visibleComment(n)){void api("/notifications/read",{method:"POST",body:JSON.stringify({ids:[n.id]})}).then(()=>client.invalidateQueries({queryKey:["notifications"]})).catch(()=>{});continue;}void api<{muted:boolean}>(`/ideas/${encodeURIComponent(n.ideaId)}/notification-settings`).then(settings=>{if(disposed||settings.muted)return;const show=()=>{const key=`ih-notification:${user.id}:${n.id}`;if(localStorage.getItem(key))return;localStorage.setItem(key,"1");setToast(n);};if(navigator.locks)void navigator.locks.request("ih-notification-toast",show);else show();}).catch(()=>{});}return()=>{disposed=true;};},[inbox.data,user,client]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),8000);return()=>clearTimeout(timer);},[toast]);
 return toast?<div className="ih-notification-toast" role="status"><button onClick={()=>{void api("/notifications/read",{method:"POST",body:JSON.stringify({ids:[toast.id]})}).then(()=>client.invalidateQueries({queryKey:["notifications"]})).catch(()=>{});router.push(commentHref(toast.ideaId,toast.commentId));setToast(null);}}><strong>{toast.actor.name} {toast.kind==="mention"?"đã nhắc đến bạn":"đã trả lời bạn"}</strong><span>{toast.ideaTitle}</span></button><button aria-label="Ẩn thông báo" onClick={()=>setToast(null)}><X size={16}/></button></div>:null;
}
export function NotificationBell(){
 const {user}=useAuth(),inbox=useInbox(),client=useQueryClient(),router=useRouter(),[open,setOpen]=useState(false),[unread,setUnread]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),[marking,setMarking]=useState(false),[push,setPush]=useState<"checking"|"install-ios"|"unsupported"|"off"|"on"|"denied">("checking"),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),[position,setPosition]=useState({left:12,top:72});
 const pages=useInfiniteQuery({queryKey:["notification-pages",user?.id,unread],initialPageParam:"0",enabled:!!user&&open,initialData:!unread&&inbox.data?{pages:[inbox.data],pageParams:["0"]}:undefined,initialDataUpdatedAt:inbox.dataUpdatedAt,queryFn:({signal,pageParam})=>api<NotificationsPage>(`/notifications?unread=${unread?1:0}&offset=${pageParam}`,{signal}),getNextPageParam:last=>last.nextCursor??undefined});
 useSurface(open,()=>setOpen(false));
 useEffect(()=>{if(open)void client.invalidateQueries({queryKey:["notification-pages",user?.id]});},[inbox.dataUpdatedAt,open,user?.id,client]);
 useEffect(()=>{
  if(!open)return;
  const el=dialog.current;if(!el)return;
  const place=()=>{const r=trigger.current?.getBoundingClientRect();if(r)setPosition({left:Math.max(12,Math.min(r.right-358,window.innerWidth-370)),top:r.bottom+10});};
  place();el.showModal();
  const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
  window.addEventListener("resize",place);
  return()=>{window.removeEventListener("resize",place);el.close();document.body.style.overflow=overflow;if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});};
 },[open]);
 useEffect(()=>{
  if(!open)return;let disposed=false;
  const support=browserPushSupport();
  if(support!=="available"){setPush(support);return;}
  if(Notification.permission==="denied"){setPush("denied");return;}
  setPush("checking");
  void navigator.serviceWorker.getRegistration().then(async r=>{const subscription=await r?.pushManager?.getSubscription();if(!disposed)setPush(subscription&&localStorage.getItem("ih-push-user")===user?.id?"on":"off");}).catch(()=>{if(!disposed){setPush("off");setError("Chưa kiểm tra được thông báo thiết bị. Bạn có thể thử bật lại");}});
  return()=>{disposed=true;};
 },[open,user?.id]);
 async function read(ids:string[]|"all"){await api("/notifications/read",{method:"POST",body:JSON.stringify({ids})});await client.invalidateQueries({queryKey:["notifications"]});await client.invalidateQueries({queryKey:["notification-pages"]});}
 async function togglePush(){setBusy(true);setError("");try{if(push==="on"){const r=await navigator.serviceWorker.getRegistration(),s=await r?.pushManager?.getSubscription();if(s){await api("/push/unsubscribe",{method:"POST",body:JSON.stringify({endpoint:s.endpoint})});await s.unsubscribe();}localStorage.removeItem("ih-push-user");setPush("off");return;}const permission=await Notification.requestPermission();if(permission!=="granted"){setPush(permission==="denied"?"denied":"off");return;}await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});const r=await navigator.serviceWorker.ready,config=await api<{publicKey:string}>("/push/config");let s=await r.pushManager.getSubscription();if(s&&s.options.applicationServerKey&&btoa(String.fromCharCode(...new Uint8Array(s.options.applicationServerKey))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")!==config.publicKey){await s.unsubscribe();s=null;}s??=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});await api("/push/subscribe",{method:"POST",body:JSON.stringify(s.toJSON())});r.active?.postMessage({type:"ACCOUNT",userId:user!.id});localStorage.setItem("ih-push-user",user!.id);setPush("on");}catch(e){setError(e instanceof Error?e.message:"Chưa bật được thông báo");}finally{setBusy(false);}}
 if(!user)return null;
 const items=[...new Map(pages.data?.pages.flatMap(p=>p.items).map(n=>[n.id,n])??[]).values()];
 return <div className="ih-notifications" onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
  <button type="button" className="ih-notification-trigger ih-about-toggle" ref={trigger} aria-label={`Thông báo${inbox.data?.unread?`, ${inbox.data.unread} chưa đọc`:""}`} aria-expanded={open} aria-haspopup="dialog" aria-controls="notifications-panel" onClick={()=>{setError("");setOpen(!open);}}><Bell size={18}/>{!!inbox.data?.unread&&<span>{inbox.data.unread>99?"99+":inbox.data.unread}</span>}</button>
  {open&&createPortal(<dialog ref={dialog} id="notifications-panel" className="ih-notifications-panel" aria-label="Thông báo" style={{"--notification-left":`${position.left}px`,"--notification-top":`${position.top}px`} as CSSProperties} onCancel={e=>{e.preventDefault();setOpen(false);}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setOpen(false);}}>
   <div className="ih-notification-top"><div><strong>Thông báo</strong>{!!inbox.data?.unread&&<span className="ih-notification-total">{inbox.data.unread} chưa đọc</span>}</div><button type="button" aria-label="Đóng thông báo" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={16}/></button></div>
   <div className="ih-notification-filters"><div className="ih-notification-tabs" role="group" aria-label="Lọc thông báo"><button type="button" aria-pressed={!unread} onClick={()=>setUnread(false)}>Tất cả</button><button type="button" aria-pressed={unread} onClick={()=>setUnread(true)}>Chưa đọc</button></div><button type="button" className="ih-notification-read-all" disabled={!inbox.data?.unread||marking} onClick={()=>{setMarking(true);void read("all").catch(e=>setError(e.message)).finally(()=>setMarking(false));}}><CheckCheck size={14}/><span>{marking?"Đang lưu…":"Đọc tất cả"}</span></button></div>
   <div className="ih-notification-list" aria-busy={pages.isPending}>
    {pages.isPending?<div className="ih-notification-loading" role="status"><span className="ih-sr">Đang tải thông báo</span>{[0,1,2].map(i=><div className="ih-notification-skeleton" key={i}><i/><span><b/><em/></span></div>)}</div>:
     pages.error&&!items.length?<div className="ih-collaboration-state" role="alert"><span className="ih-state-icon"><AlertCircle size={21}/></span><strong>Chưa tải được thông báo</strong><p>{pages.error.message}</p><button type="button" className="ih-quiet-action" onClick={()=>void pages.refetch()}><RefreshCw size={13}/>Thử lại</button></div>:
     !items.length?<div className="ih-collaboration-state"><span className="ih-state-icon">{unread?<Check size={23}/>:<Inbox size={23}/>}</span><strong>{unread?"Bạn đã xem hết thông báo":"Chưa có thông báo"}</strong><p>{unread?"Lời nhắc và trả lời mới sẽ xuất hiện ở đây":"Khi có người nhắc tên hoặc trả lời bạn, mình sẽ báo tại đây"}</p></div>:
     items.map(n=><button type="button" key={n.id} className={`ih-notification-item${!n.readAt?" ih-notification-unread":""}`} onClick={()=>{void read([n.id]).catch(e=>setError(e.message));setOpen(false);router.push(commentHref(n.ideaId,n.commentId));}}><Avatar person={n.actor}/><span><span className="ih-notification-summary"><strong>{n.actor.name}</strong> {n.kind==="mention"?"đã nhắc đến bạn":"đã trả lời bạn"}</span><b>{n.ideaTitle}</b><span className="ih-notification-excerpt">{n.excerpt}</span><time>{relativeTime(n.createdAt)}</time></span>{!n.readAt&&<i aria-label="Chưa đọc"/>}<ArrowUpRight size={14} className="ih-notification-go" aria-hidden="true"/></button>)}
    {pages.hasNextPage&&<button type="button" className="ih-notification-more" disabled={pages.isFetchingNextPage} onClick={()=>void pages.fetchNextPage()}>{pages.isFetchingNextPage?"Đang tải…":"Xem thêm thông báo"}</button>}
    {!!items.length&&pages.error&&<p className="ih-inline-error" role="alert">Chưa cập nhật được thông báo mới</p>}
   </div>
   <div className="ih-push-settings">
    <span className="ih-push-icon" aria-hidden="true">{push==="on"?<Bell size={16}/>:<BellOff size={16}/>}</span>
    <div>{push==="checking"?<><strong>Thông báo trên thiết bị</strong><p role="status">Đang kiểm tra hỗ trợ…</p></>:push==="install-ios"?<><strong>Nhận thông báo trên iPhone/iPad</strong><p>Thêm IdeaHub vào Màn hình chính rồi mở từ biểu tượng để bật thông báo</p><details className="ih-push-install"><summary>Hướng dẫn bật trên iOS</summary><ol><li>Mở IdeaHub bằng Safari, nhấn Chia sẻ và chọn Thêm vào Màn hình chính</li><li>Mở IdeaHub từ biểu tượng vừa thêm và đăng nhập</li><li>Mở chuông → Bật thông báo → Cho phép</li></ol><p>Cần iOS/iPadOS 16.4 trở lên. Thông báo trong IdeaHub vẫn xem được tại đây</p></details></>:push==="unsupported"?<><strong>Thông báo trên thiết bị</strong><p>Trình duyệt này chưa hỗ trợ push. Hãy cập nhật trình duyệt; trên iPhone/iPad cần iOS 16.4 trở lên và mở IdeaHub từ Màn hình chính</p></>:push==="denied"?<><strong>Thông báo trình duyệt đang tắt</strong><p>Bạn có thể bật lại trong cài đặt quyền của trình duyệt</p></>:<><strong>{push==="on"?"Thông báo thiết bị đã bật":"Nhận thông báo trên thiết bị"}</strong><button type="button" disabled={busy} onClick={()=>void togglePush()}>{busy?"Đang cập nhật…":push==="on"?"Tắt trên thiết bị này":"Bật thông báo"}<ArrowUpRight size={12}/></button></>}{error&&<p className="ih-form-error" role="alert">{error}</p>}</div>
   </div>
  </dialog>,document.body)}
 </div>;
}
