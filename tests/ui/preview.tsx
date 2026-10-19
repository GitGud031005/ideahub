// Isolated responsive fixtures: actual UI components; no production API writes.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Providers } from "../../src/components/providers";
import { Dashboard } from "../../src/components/dashboard";
import { Discussion } from "../../src/components/discussion";
import { Profile } from "../../src/components/profile";
import type { Account, Attachment, Comment, Idea } from "../../src/lib/domain";
import type { Recap } from "../../src/lib/recaps";
declare global { interface Window { __qaScene: string; __qaNavigate: (path: string) => void } }
const person: Account = { id: "qa-person", username: "minhan", name: "Nguyễn Minh An", initial: "NA" };
const tags = ["Công nghệ", "Data engineering", "Python", "Open source", "Thiết kế", "Teamwork", "PostgreSQL", "Tìm đồng đội", "Mobile", "Product", "Frontend", "Backend"];
const ideas: Idea[] = ["Phòng thí nghiệm Data Crawling", "Bản đồ không gian học tập", "Tủ sách trao đổi cộng đồng"].map((title, i) => ({ id: `qa-idea-${i}`, title, description: "Cùng xây một sản phẩm hữu ích, chia sẻ góc nhìn và tìm đồng đội để đưa ý tưởng thành hiện thực", category: "Công nghệ", tags, creator: person, createdAt: new Date().toISOString(), memberCount: 12, commentCount: 13, mine: false, joined: false }));
const comments: Comment[] = Array.from({ length: 13 }, (_, i) => ({ id: `qa-comment-${i}`, ideaId: ideas[0].id, parentId: i ? `qa-comment-${i - 1}` : null, author: i % 2 ? { id: "qa-other", name: "Trần Ngọc Bình", initial: "TB" } : person, text: i ? "Mình đồng ý. Cùng bắt đầu từ một phần nhỏ, rồi xây dựng và hoàn thiện từng bước nhé" : "Mình có thể phụ trách phần thu thập dữ liệu và xây dựng pipeline. Mọi người muốn bắt đầu từ nguồn nào?", createdAt: new Date().toISOString() }));
comments.push(...[
  {id:"qa-sibling-old",parentId:"qa-comment-0",text:"Nhánh cũ: bắt đầu từ nguồn sách",createdAt:"2026-10-15T10:00:00Z"},
  {id:"qa-sibling-new",parentId:"qa-comment-0",text:"Nhánh mới: thêm bước kiểm tra dữ liệu",createdAt:"2026-10-17T10:00:00Z"},
  {id:"qa-nested-old",parentId:"qa-sibling-new",text:"Trả lời cũ trong nhánh",createdAt:"2026-10-16T10:00:00Z"},
  {id:"qa-nested-new",parentId:"qa-sibling-new",text:"Trả lời mới trong nhánh",createdAt:"2026-10-17T11:00:00Z"},
].map(c=>({...comments[0],...c})));
const sampleImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="440"><rect width="700" height="440" fill="#e9e9e4"/><rect x="70" y="50" width="560" height="340" rx="12" fill="#fff" stroke="#aaa"/><text x="100" y="98" font-family="sans-serif" font-size="22" fill="#222">ideahub / shared ideas</text><rect x="100" y="125" width="500" height="35" fill="#efefeb"/><rect x="100" y="185" width="145" height="150" rx="6" fill="#ddd"/><rect x="277" y="185" width="145" height="150" rx="6" fill="#c6c6bf"/><rect x="454" y="185" width="145" height="150" rx="6" fill="#32322d"/></svg>');
const fixtureAttachments:Attachment[]=[{id:"qa-image",name:"phac-thao-giao-dien.png",mime:"image/png",size:245760,kind:"image",url:sampleImage},{id:"qa-file",name:"ke-hoach-san-pham.txt",mime:"text/plain",size:1600,kind:"file",url:'data:text/plain,IdeaHub%20demo%20plan'}];
comments.unshift({id:"qa-share-root",ideaId:ideas[0].id,parentId:null,author:person,text:"Mình gửi phác thảo và kế hoạch sản phẩm để cả nhóm góp ý. Tài liệu tham khảo: https://developer.mozilla.org/",attachments:fixtureAttachments,pinnedAt:new Date().toISOString(),createdAt:new Date().toISOString()});
comments.forEach((c,i)=>{c.readCursor=String(i+1);});
ideas[0].joined=true;ideas[1].joined=true;
const unread:Record<string,number>={[ideas[0].id]:7,[ideas[1].id]:123};
const attempts=new Map<string,number>();let postNumber=0;
const recap: Recap = { id:"qa-recap",ideaId:ideas[0].id,kind:"daily",periodStart:"2026-10-16",periodEnd:"2026-10-17",fileName:"2026-10-16.md",source:"gemini",sourceCount:13,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),model:"gemini-3.8-flash",content:{keyIdeas:[{text:"Cùng xây một pipeline nhỏ, có thể kiểm tra chất lượng dữ liệu trước khi mở rộng phạm vi",commentIds:[comments[0].id]}],decisions:[{text:"Bắt đầu với dữ liệu sách, lưu PostgreSQL và kiểm tra URL trùng",commentIds:[comments[1].id]}],nextSteps:[{text:"Nhóm hoàn thiện parser, viết README và kiểm thử phân trang",commentIds:[comments[2].id]}],openQuestions:[{text:"Cần xác nhận điều kiện dừng ở trang cuối",commentIds:[comments[3].id]}]}};
class MockSource extends EventTarget {
  onopen:((event:Event)=>void)|null=null;onerror:((event:Event)=>void)|null=null;
  constructor(_url:string){super();setTimeout(()=>this.onopen?.(new Event("open")),10);}
  close(){}
}
window.EventSource=MockSource as unknown as typeof EventSource;
let current: Account|null = window.__qaScene === "guest" ? null : { ...person, provider:window.__qaScene === "profile-google"?"google":"password" };
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof Request ? input.url : input.href, "https://fixture.ideahub.test"), path = url.pathname;
  if (!path.startsWith("/api/")) throw new Error("UI fixture blocked a non-mocked request");
  if(path==="/api/unread")return Response.json(unread);
  if(path.endsWith("/read")&&init?.method==="POST"){unread[path.split("/")[3]]=0;return Response.json({ok:true});}
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
  if (path === "/api/ideas") return Response.json({ items: ideas, total: 3, counts: { all: 3, joined: 2, mine: 1 },nextCursor:null });
  if (path.endsWith("/recaps/qa-recap")) return Response.json(recap);
  if (path.endsWith("/recaps")) return Response.json({items:[recap],nextOffset:null,aiConfigured:true});
  if(path.endsWith('/pin')&&init?.method==='POST') {const c=comments.find(c=>c.id===path.split('/').at(-2));if(c)c.pinnedAt=JSON.parse(String(init.body)).pinned?new Date().toISOString():null;return Response.json({ok:true});}
  if(path.endsWith('/attachments')&&init?.method==='POST'){const f=(init.body as FormData).get('file') as File;await new Promise(r=>setTimeout(r,1200));const a:Attachment={id:crypto.randomUUID(),name:f.name,size:f.size,mime:f.type,kind:f.type.startsWith('image/')?'image':'file',url:URL.createObjectURL(f)};fixtureAttachments.push(a);return Response.json(a);}
  if (path.endsWith("/comments") && init?.method === "POST") {
    const input=JSON.parse(String(init.body)),attempt=(attempts.get(input.clientId)||0)+1;attempts.set(input.clientId,attempt);const order=++postNumber;
    await new Promise(resolve=>setTimeout(resolve,window.__qaScene==="discussion-slow"?(order===1?6000:2500):200));
    if(input.text.includes("lỗi thử")&&attempt===1)return Response.json({error:{code:"QA_NETWORK",message:"Mất kết nối thử nghiệm"}},{status:503});
    const existing=comments.find(c=>c.id===input.clientId);if(existing)return Response.json(existing);
    const comment={...comments[0],id:input.clientId,parentId:input.parentId||null,text:input.text,author:person,attachments:(input.attachmentIds??[]).map((id:string)=>fixtureAttachments.find(a=>a.id===id)!),pinnedAt:null,readCursor:String(comments.length+1),createdAt:new Date().toISOString()};comments.push(comment);return Response.json(comment);
  }
  if (path.endsWith("/comments")) return Response.json({ items: comments, total: comments.length, nextCursor: null });
  if (path.endsWith("/join") && init?.method === "POST") return Response.json({ ...ideas[0], joined: true });
  if (path.startsWith("/api/ideas/")) return Response.json(ideas[0]);
  return Response.json({ error: { code: "QA_ONLY", message: "Đây là fixture UI; không gửi dữ liệu thật" } }, { status: 400 });
};
function App() {
  const [route, setRoute] = useState(window.__qaScene.startsWith("discussion") ? `/ideas/${ideas[0].id}` : window.__qaScene.startsWith("profile") ? "/profile" : "/");
  window.__qaNavigate = setRoute;
  return <Providers><div id="ih-app">{route==="/profile" ? <Profile/> : route.startsWith("/ideas/") ? <Discussion id={ideas[0].id}/> : <Dashboard/>}</div></Providers>;
}
createRoot(document.getElementById("root")!).render(<App/>);
