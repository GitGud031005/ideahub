import {api} from "./api-client";
import {browserPushSupport} from "./push-support";

export const PUSH_INVITE_DELAY = 7 * 24 * 60 * 60 * 1000;
export interface PushInviteDecision { until: number }
const decisions=new Map<string,PushInviteDecision>();
type InviteScope="push"|"install";
const inviteKey=(userId:string,scope:InviteScope)=>`ih-push-invite:${userId}:${scope}`;
export function readPushInviteDecision(userId:string,scope:InviteScope="push"):PushInviteDecision|null {
  try {const raw=localStorage.getItem(inviteKey(userId,scope));if(raw){const value=JSON.parse(raw);if(typeof value.until==="number"&&Number.isFinite(value.until))return value;}}catch{}
  return decisions.get(inviteKey(userId,scope))??null;
}
export function deferPushInvite(userId:string,{permanently=false,now=Date.now(),scope="push"}:{permanently?:boolean;now?:number;scope?:InviteScope}={}) {
  const decision={until:permanently?Number.MAX_SAFE_INTEGER:now+PUSH_INVITE_DELAY};decisions.set(inviteKey(userId,scope),decision);
  try{localStorage.setItem(inviteKey(userId,scope),JSON.stringify(decision));}catch{}
}
export function clearPushInviteDecision(userId:string){decisions.delete(inviteKey(userId,"push"));try{localStorage.removeItem(inviteKey(userId,"push"));}catch{}}
export function shouldInvitePush({support,permission,subscribed,decision,now=Date.now()}:{support:ReturnType<typeof browserPushSupport>;permission:NotificationPermission;subscribed:boolean;decision:PushInviteDecision|null;now?:number}) {
  return support!=="unsupported"&&permission!=="denied"&&!subscribed&&(!decision||decision.until<=now);
}
function keyBytes(value:string){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
export function pushOwner(){try{return localStorage.getItem("ih-push-user");}catch{return null;}}
export async function hasDevicePush(userId:string){const registration=await navigator.serviceWorker.getRegistration();return !!await registration?.pushManager?.getSubscription()&&pushOwner()===userId;}
/** Called directly from a click so Safari/Firefox retain the permission user gesture. */
export async function enableDevicePush(userId:string):Promise<"on"|"off"|"denied"> {
  if(browserPushSupport()!=="available")throw new Error("Thiết bị này chưa sẵn sàng nhận push");
  const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(permission!=="granted")return permission==="denied"?"denied":"off";
  await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});
  const registration=await navigator.serviceWorker.ready,config=await api<{publicKey:string}>("/push/config");
  let subscription=await registration.pushManager.getSubscription();
  if(subscription?.options.applicationServerKey&&btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")!==config.publicKey){await subscription.unsubscribe();subscription=null;}
  subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
  await api("/push/subscribe",{method:"POST",body:JSON.stringify(subscription.toJSON())});
  registration.active?.postMessage({type:"ACCOUNT",userId});
  try{localStorage.setItem("ih-push-user",userId);}catch{}
  clearPushInviteDecision(userId);window.dispatchEvent(new Event("ideahub:push-changed"));return "on";
}
export async function disableDevicePush(userId:string) {
  const registration=await navigator.serviceWorker.getRegistration(),subscription=await registration?.pushManager?.getSubscription();
  if(subscription){await api("/push/unsubscribe",{method:"POST",body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe();}
  try{localStorage.removeItem("ih-push-user");}catch{}
  deferPushInvite(userId,{permanently:true});window.dispatchEvent(new Event("ideahub:push-changed"));
}
