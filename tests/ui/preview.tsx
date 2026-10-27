// Isolated responsive fixtures: actual UI components; no production API writes.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Providers } from "../../src/components/providers";
import { Dashboard } from "../../src/components/dashboard";
import { Discussion } from "../../src/components/discussion";
import BusinessHome from "../../src/app/business-for-startup/page";
import {StartupShell} from "../../src/components/business-for-startup/shell";
import {StartupLessonView} from "../../src/components/business-for-startup/lesson";
import {lessonCatalog,lessonGroups,searchEntries,getStartupLesson} from "../../src/content/business-for-startup";
import NotFound from "../../src/app/not-found";
import ErrorPage from "../../src/app/error";
import {SiteFooter} from "../../src/components/site-footer";
import { Profile } from "../../src/components/profile";
import type { Account, Attachment, Comment, Idea, RoomNotification } from "../../src/lib/domain";
import type { Recap } from "../../src/lib/recaps";
declare global { interface Window { __qaScene: string; __qaNavigate: (path: string) => void; __qaPath: string } }
const person: Account = { id: "qa-person", username: "minhan", name: "Nguyễn Minh An", initial: "NA" };
const tags = ["Công nghệ", "Data engineering", "Python", "Open source", "Thiết kế", "Teamwork", "PostgreSQL", "Tìm đồng đội", "Mobile", "Product", "Frontend", "Backend"];
const ideas: Idea[] = ["Phòng thí nghiệm Data Crawling", "Bản đồ không gian học tập", "Tủ sách trao đổi cộng đồng"].map((title, i) => ({ id: `qa-idea-${i}`, title, description: "Cùng xây một sản phẩm hữu ích, chia sẻ góc nhìn và tìm đồng đội để đưa ý tưởng thành hiện thực", status: i === 0 ? "potential" : i === 1 ? "new" : "archived", category: "Công nghệ", tags, creator: person, createdAt: new Date().toISOString(), memberCount: 12, commentCount: 13, lastCommentAt:new Date(Date.now()-(i+1)*3600000).toISOString(), mine: i === 0, joined: i !== 1, notificationsMuted:i===2 }));
const comments: Comment[] = Array.from({ length: 13 }, (_, i) => ({ id: `qa-comment-${i}`, ideaId: ideas[0].id, parentId: i ? `qa-comment-${i - 1}` : null, author: i % 2 ? { id: "qa-other", name: "Trần Ngọc Bình", initial: "TB" } : person, text: i ? "Mình đồng ý. Cùng bắt đầu từ một phần nhỏ, rồi xây dựng và hoàn thiện từng bước nhé" : "Mình có thể phụ trách phần thu thập dữ liệu và xây dựng pipeline. Mọi người muốn bắt đầu từ nguồn nào?", createdAt: new Date().toISOString() }));
comments.push(...[
  {id:"qa-sibling-old",parentId:"qa-comment-0",text:"Nhánh cũ: bắt đầu từ nguồn sách",createdAt:"2026-10-15T10:00:00Z"},
  {id:"qa-sibling-new",parentId:"qa-comment-0",text:"Nhánh mới: thêm bước kiểm tra dữ liệu",createdAt:"2026-10-17T10:00:00Z"},
  {id:"qa-nested-old",parentId:"qa-sibling-new",text:"Trả lời cũ trong nhánh",createdAt:"2026-10-16T10:00:00Z"},
  {id:"qa-nested-new",parentId:"qa-sibling-new",text:"Trả lời mới trong nhánh",createdAt:"2026-10-17T11:00:00Z"},
].map(c=>({...comments[0],...c})));
const sampleImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="440"><rect width="700" height="440" fill="#e9e9e4"/><rect x="70" y="50" width="560" height="340" rx="12" fill="#fff" stroke="#aaa"/><text x="100" y="98" font-family="sans-serif" font-size="22" fill="#222">ideahub / shared ideas</text><rect x="100" y="125" width="500" height="35" fill="#efefeb"/><rect x="100" y="185" width="145" height="150" rx="6" fill="#ddd"/><rect x="277" y="185" width="145" height="150" rx="6" fill="#c6c6bf"/><rect x="454" y="185" width="145" height="150" rx="6" fill="#32322d"/></svg>');
const fixtureAttachments:Attachment[]=[{id:"qa-image",name:"phac-thao-giao-dien.png",mime:"image/png",size:245760,kind:"image",url:sampleImage},{id:"qa-file",name:"ke-hoach-san-pham.txt",mime:"text/plain",size:1600,kind:"file",url:'data:text/plain,IdeaHub%20demo%20plan'}];
comments.unshift({id:"qa-share-root",ideaId:ideas[0].id,parentId:null,author:person,text:"Mình gửi phác thảo và kế hoạch sản phẩm để cả nhóm góp ý. Tài liệu tham khảo: https://developer.mozilla.org/",attachments:[...fixtureAttachments],pinnedAt:new Date().toISOString(),createdAt:new Date().toISOString()});
comments.forEach((c,i)=>{c.readCursor=String(i+1);});

// A mixed six-reply branch verifies the real components and acknowledgement hook.
if(window.__qaScene.startsWith("discussion-unread")){
  ideas[0].title="Kiểm thử tin chưa đọc";ideas[0].description="Dữ liệu thử độc lập, không ghi vào tài khoản thật";
  const base={ideaId:ideas[0].id,author:{id:"qa-other",name:"Trần Ngọc Bình",initial:"TB"},createdAt:"2026-10-20T00:00:00Z"};
  comments.splice(0,comments.length,...[
    {id:"qa-root",parentId:null,text:"Một nhánh có 6 trả lời, gồm 4 tin chưa đọc",author:person},
    {id:"qa-a",parentId:"qa-root",text:"Trả lời cấp 1: bên trong còn nhánh chưa đọc"},
    {id:"qa-b",parentId:"qa-root",text:"Trả lời cấp 1: bên trong chỉ có tin đã đọc"},
    {id:"qa-c",parentId:"qa-a",text:"Trả lời cấp 2: bên trong còn 1 tin chưa đọc"},
    {id:"qa-d",parentId:"qa-a",text:"Trả lời cấp 2 đã đọc từ trước"},
    {id:"qa-e",parentId:"qa-c",text:"Tin chưa đọc ở cấp 3"},
    {id:"qa-f",parentId:"qa-b",text:"Tin đã đọc trong nhánh khác"},
  ].map(c=>({...base,...c})));
}
const unread:Record<string,number>={[ideas[0].id]:7,[ideas[1].id]:123};
const unreadCommentIds=new Set(window.__qaScene.startsWith("discussion-unread")?["qa-a","qa-b","qa-c","qa-e"]:comments.filter(c=>c.author.id!==person.id).map(c=>c.id));
const roomMembers=[person,{id:"qa-other",name:"Trần Ngọc Bình",initial:"TB"},{id:"qa-third",name:"Lê Minh Phúc",initial:"LP"}];
const notifications:RoomNotification[]=[{id:"qa-notification-1",userId:person.id,ideaId:ideas[0].id,ideaTitle:ideas[0].title,commentId:"qa-comment-0",actor:roomMembers[1],kind:"mention",excerpt:"@Nguyễn Minh An bạn xem giúp hướng tiếp cận này nhé",createdAt:new Date(Date.now()-240000).toISOString(),readAt:null},{id:"qa-notification-2",userId:person.id,ideaId:ideas[0].id,ideaTitle:ideas[0].title,commentId:"qa-comment-1",actor:roomMembers[2],kind:"reply",excerpt:"Mình có thể góp sức ở bước kiểm tra dữ liệu đầu vào",createdAt:new Date(Date.now()-3600000).toISOString(),readAt:null},{id:"qa-notification-3",userId:person.id,ideaId:ideas[0].id,ideaTitle:ideas[0].title,commentId:"qa-share-root",actor:roomMembers[1],kind:"reply",excerpt:"Nhóm đã xem phác thảo, cùng thống nhất phần còn bỏ ngỏ nhé",createdAt:new Date(Date.now()-86400000).toISOString(),readAt:new Date().toISOString()}];
if(window.__qaScene.includes("empty"))notifications.splice(0);
if(window.__qaScene==="discussion-long")for(let n=0;n<25;n++)comments.push({...comments[0],id:`qa-long-${n}`,parentId:null,attachments:[],pinnedAt:null,text:`Góc nhìn số ${n+1}: cùng xác định vấn đề và kiểm chứng nhu cầu trước khi xây sản phẩm. Mình muốn nghe thêm trải nghiệm của mọi người.`,createdAt:new Date(Date.now()-(30-n)*60000).toISOString()});
const ios=window.__qaScene.includes("ios"),installed=window.__qaScene.includes("pwa"),allowPush=installed||window.__qaScene.includes("android-push")||["invite-desktop","invite-android","invite-error","invite-google-return"].includes(window.__qaScene);
if(ios){Object.defineProperty(navigator,"userAgent",{configurable:true,value:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"});Object.defineProperty(navigator,"platform",{configurable:true,value:"iPhone"});Object.defineProperty(navigator,"standalone",{configurable:true,value:installed});}
let fixtureSubscription:any=null;
const pushManager={getSubscription:async()=>fixtureSubscription,subscribe:async()=>{fixtureSubscription={endpoint:"https://web.push.apple.com/qa-only",keys:{p256dh:"qa",auth:"qa"},options:{},toJSON(){return {endpoint:this.endpoint,keys:this.keys};},async unsubscribe(){fixtureSubscription=null;return true;}};return fixtureSubscription;}};
const registration={active:{postMessage:()=>{}},pushManager};
const qaWorker=Object.assign(new EventTarget(),{register:async()=>registration,getRegistration:async()=>registration,ready:Promise.resolve(registration)});
Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:qaWorker});
let fixturePermission=allowPush||window.__qaScene.includes("push-off")||ios||window.__qaScene.startsWith("invite-")?"default":"denied";if(window.__qaScene==="invite-blocked")fixturePermission="denied";
Object.defineProperty(window,"Notification",{configurable:true,value:{get permission(){return fixturePermission;},requestPermission:async()=>{fixturePermission=allowPush?"granted":"denied";return fixturePermission;}}});
Object.defineProperty(window,"PushManager",{configurable:true,value:class {}});
try{localStorage.removeItem("ih-push-user");for(const scope of ["push","install"]){const key=`ih-push-invite:${person.id}:${scope}`;if(window.__qaScene.startsWith("invite-")&&window.__qaScene!=="invite-later")localStorage.removeItem(key);else if(!window.__qaScene.startsWith("invite-"))localStorage.setItem(key,JSON.stringify({until:Date.now()+86400000}));}}catch{}
const sources=new Set<EventTarget>();let qaVersion=0;
window.addEventListener("message",event=>{if(event.data!=="QA_ADD_COMMENT")return;comments.push({...comments[0],id:crypto.randomUUID(),author:roomMembers[1],parentId:null,text:"Tin mới: mình vừa bổ sung một góc nhìn để mọi người cùng thảo luận",attachments:[],pinnedAt:null,createdAt:new Date().toISOString()});qaVersion++;for(const source of sources)source.dispatchEvent(new MessageEvent("comments-changed",{data:JSON.stringify({commentCount:comments.length,memberCount:3,version:String(qaVersion)})}));});
const attempts=new Map<string,number>();let postNumber=0,pushAttempts=0;
const recap: Recap = { id:"qa-recap",ideaId:ideas[0].id,kind:"daily",periodStart:"2026-10-16",periodEnd:"2026-10-17",fileName:"2026-10-16.md",source:"gemini",sourceCount:13,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),model:"gemini-3.8-flash",content:{keyIdeas:[{text:"Cùng xây một pipeline nhỏ, có thể kiểm tra chất lượng dữ liệu trước khi mở rộng phạm vi",commentIds:[comments[0].id]}],decisions:[{text:"Bắt đầu với dữ liệu sách, lưu PostgreSQL và kiểm tra URL trùng",commentIds:[comments[1].id]}],nextSteps:[{text:"Nhóm hoàn thiện parser, viết README và kiểm thử phân trang",commentIds:[comments[2].id]}],openQuestions:[{text:"Cần xác nhận điều kiện dừng ở trang cuối",commentIds:[comments[3].id]}]}};
class MockSource extends EventTarget {
  onopen:((event:Event)=>void)|null=null;onerror:((event:Event)=>void)|null=null;
  constructor(_url:string){super();sources.add(this);setTimeout(()=>this.onopen?.(new Event("open")),10);}
  close(){sources.delete(this);}
}
window.EventSource=MockSource as unknown as typeof EventSource;
let current: Account|null = window.__qaScene === "guest" ? null : { ...person, provider:["profile-google","invite-google-return"].includes(window.__qaScene)?"google":"password" };
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href, "https://fixture.ideahub.test"), path = url.pathname;
  if (!path.startsWith("/api/")) throw new Error("UI fixture blocked a non-mocked request");
  if(path==="/api/push/config")return Response.json({publicKey:"B"+"A".repeat(86)});
  if(path==="/api/push/subscribe"||path==="/api/push/unsubscribe"){if(path.endsWith("subscribe")&&!path.endsWith("unsubscribe")&&window.__qaScene==="invite-error"&&++pushAttempts===1)return Response.json({error:{message:"Kết nối thử nghiệm bị gián đoạn"}},{status:503});return Response.json({ok:true});}
  if(path==="/api/notifications"){
    if(window.__qaScene.includes("loading"))await new Promise(r=>setTimeout(r,20000));
    if(window.__qaScene.includes("error"))return Response.json({error:{code:"QA_NETWORK",message:"Kết nối đang gián đoạn. Hãy thử lại sau ít phút"}},{status:503});
    const filtered=notifications.filter(n=>url.searchParams.get("unread")!=="1"||!n.readAt);return Response.json({items:filtered,unread:notifications.filter(n=>!n.readAt).length,nextCursor:null});
  }
  if(path==="/api/notifications/read"){const body=JSON.parse(String(init?.body));for(const n of notifications)if(body.ids==="all"||body.ids.includes(n.id))n.readAt=new Date().toISOString();return Response.json({ok:true});}
  if(path.endsWith("/members"))return Response.json(roomMembers);
  if(path.endsWith("/notification-settings")){const idea=ideas.find(i=>i.id===path.split("/")[3])??ideas[0];if(init?.method==="POST")idea.notificationsMuted=JSON.parse(String(init.body)).muted;return Response.json({muted:idea.notificationsMuted??false});}
  if(path.endsWith("/search")){await new Promise(r=>setTimeout(r,350));const q=(url.searchParams.get("q")||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d"),author=url.searchParams.get("author"),items=comments.filter(c=>(!author||c.author.id===author)&&c.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").includes(q));return Response.json({items,total:items.length,nextCursor:null});}
  if(path.endsWith("/edit")&&init?.method==="POST"){const body=JSON.parse(String(init.body)),c=comments.find(c=>c.id===path.split("/").at(-2))!;await new Promise(r=>setTimeout(r,900));if(body.text.includes("lỗi sửa"))return Response.json({error:{code:"QA_CONFLICT",message:"Chưa lưu được thay đổi. Nội dung đang sửa vẫn được giữ lại"}},{status:409});Object.assign(c,{text:body.text,mentions:body.mentions,editedAt:new Date().toISOString(),revision:(c.revision??0)+1});return Response.json(c);}
  if(path==="/api/unread")return Response.json(unread);
  if(path.endsWith("/read")){
    if(init?.method==="POST"){const body=JSON.parse(String(init.body));for(const id of body.commentIds??[body.commentId])unreadCommentIds.delete(id);unread[path.split("/")[3]]=unreadCommentIds.size;return Response.json({ok:true});}
    return Response.json({unreadIds:[...unreadCommentIds]});
  }
  if (path === "/api/session") return Response.json({ user: current, storage: "postgres" });
  if (path === "/api/auth/config") return Response.json({google:true,avatarUpload:true});
  if (path === "/api/auth/register" || path === "/api/auth/login") { current=person;return Response.json({user:current,storage:"postgres"}); }
  if (path === "/api/auth/profile") {current={...current!,name:JSON.parse(String(init?.body)).name};return Response.json({user:current,storage:"postgres"});}
  if (path === "/api/auth/avatar") {
    const file=(init!.body as FormData).get("avatar") as File,bitmap=await createImageBitmap(file);
    if(bitmap.width!==512||bitmap.height!==512)return Response.json({error:{message:"Crop phải là 512x512"}},{status:422});bitmap.close();
    current={...current!,avatarUrl:URL.createObjectURL(file)};return Response.json({user:current,storage:"postgres"});
  }
  if (path === "/api/auth/logout") { current = null; return Response.json({ user: null, storage: "postgres" }); }
  const project = (idea:Idea):Idea => ({...idea,joined:!!current&&idea.joined,mine:!!current&&idea.mine,status:!current||!idea.joined?"new":idea.status==="archived"?"archived":"potential"});
  if(path==="/api/ideas/suggest-tags"&&init?.method==="POST"){await new Promise(resolve=>setTimeout(resolve,1200));return Response.json({tags:["Nông nghiệp đô thị","IoT","Cộng đồng"],model:"gemini-3.8-flash"});}
  if (path === "/api/ideas") {
    const view=url.searchParams.get("view")??"all",q=(url.searchParams.get("q")??"").toLowerCase(),all=ideas.map(project);
    const sort=url.searchParams.get("sort")??"activity";
    all.sort((a,b)=>sort==="popular"?b.memberCount-a.memberCount:Date.parse(sort==="activity"?(b.lastCommentAt??b.createdAt):b.createdAt)-Date.parse(sort==="activity"?(a.lastCommentAt??a.createdAt):a.createdAt));
    const items=all.filter(i=>(view==="all"||(view==="mine"?i.mine:i.status===view))&&i.title.toLowerCase().includes(q));
    return Response.json({items,total:items.length,counts:{all:all.length,new:all.filter(i=>i.status==="new").length,potential:all.filter(i=>i.status==="potential").length,archived:all.filter(i=>i.status==="archived").length,mine:all.filter(i=>i.mine).length},nextCursor:null});
  }
  if (path.endsWith("/status")&&init?.method==="POST") {const idea=ideas.find(i=>i.id===path.split("/")[3])!;idea.status=JSON.parse(String(init.body)).status;return Response.json(project(idea));}
  if (path.endsWith("/recaps/qa-recap")) return Response.json(recap);
  if (path.endsWith("/recaps")) return Response.json({items:[recap],nextOffset:null,aiConfigured:true});
  if(path.endsWith('/pin')&&init?.method==='POST') {const c=comments.find(c=>c.id===path.split('/').at(-2));if(c)c.pinnedAt=JSON.parse(String(init.body)).pinned?new Date().toISOString():null;return Response.json({ok:true});}
  if(path.endsWith('/attachments')&&init?.method==='POST'){const f=(init.body as FormData).get('file') as File;await new Promise(r=>setTimeout(r,1200));const a:Attachment={id:crypto.randomUUID(),name:f.name,size:f.size,mime:f.type,kind:f.type.startsWith('image/')?'image':'file',url:URL.createObjectURL(f)};fixtureAttachments.push(a);return Response.json(a);}
  if (path.endsWith("/comments") && init?.method === "POST") {
    const input=JSON.parse(String(init.body)),attempt=(attempts.get(input.clientId)||0)+1;attempts.set(input.clientId,attempt);const order=++postNumber;
    await new Promise(resolve=>setTimeout(resolve,window.__qaScene==="discussion-slow"?(order===1?6000:2500):200));
    if(input.text.includes("lỗi thử")&&attempt===1)return Response.json({error:{code:"QA_NETWORK",message:"Mất kết nối thử nghiệm"}},{status:503});
    const existing=comments.find(c=>c.id===input.clientId);if(existing)return Response.json(existing);
    const comment={...comments[0],id:input.clientId,parentId:input.parentId||null,text:input.text,mentions:input.mentions,author:person,attachments:(input.attachmentIds??[]).map((id:string)=>fixtureAttachments.find(a=>a.id===id)!),pinnedAt:null,readCursor:String(comments.length+1),createdAt:new Date().toISOString()};comments.push(comment);ideas.find(i=>i.id===path.split("/")[3])!.lastCommentAt=comment.createdAt;return Response.json(comment);
  }
  if (path.endsWith("/comments")) return Response.json({ items: comments, total: comments.length, nextCursor: null });
  if (path.endsWith("/join") && init?.method === "POST") {const idea=ideas.find(i=>i.id===path.split("/")[3])!;if(!idea.joined){idea.joined=true;idea.status="potential";}return Response.json(project(idea));}
  if (path.startsWith("/api/ideas/")) return Response.json(project(ideas.find(i=>i.id===path.split("/")[3])??ideas[0]));
  return Response.json({ error: { code: "QA_ONLY", message: "Đây là fixture UI; không gửi dữ liệu thật" } }, { status: 400 });
};
function App() {
  const [route, setRoute] = useState(window.__qaScene.startsWith("discussion") ? `/ideas/${ideas[0].id}` : window.__qaScene.startsWith("profile") ? "/profile" : window.__qaScene.startsWith("startup:") ? `/business-for-startup/${window.__qaScene.slice(8)}` : window.__qaScene==="startup" ? "/business-for-startup" : window.__qaScene==="not-found" ? "/missing" : window.__qaScene==="page-error" ? "/error" : "/");
  window.__qaPath=route;
  window.__qaNavigate = setRoute;
  const startup=route.startsWith("/business-for-startup"),lesson=getStartupLesson(route.split("/")[2]);
  return <Providers><div id="ih-app">{startup?<><StartupShell catalog={lessonCatalog} groups={lessonGroups} entries={searchEntries}>{lesson?<StartupLessonView lesson={lesson} catalog={lessonCatalog}/>:<BusinessHome/>}</StartupShell><SiteFooter/></>:route==="/missing"?<NotFound/>:route==="/error"?<ErrorPage error={new Error("QA")} reset={()=>setRoute("/")}/>:route==="/profile" ? <Profile/> : route.startsWith("/ideas/") ? <Discussion id={route.split("/")[2]}/> : <Dashboard/>}</div></Providers>;
}
createRoot(document.getElementById("root")!).render(<App/>);
