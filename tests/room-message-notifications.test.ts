import assert from "node:assert/strict";
import {test} from "node:test";
import {StateIdeaRepository,type IdeaRepository} from "../src/server/repository";
import {PostgresIdeaRepository} from "../src/server/postgres-repository";
import {MemoryStore} from "../src/server/stores";
import {embeddedPool} from "./helpers/postgres";
import {handleApi} from "../src/server/api";
import {AuthService,MemoryAuthStore} from "../src/server/auth";
import {SESSION_COOKIE} from "../src/server/session";
import {dispatchPendingPush} from "../src/server/web-push";
const people=["An","Bình","Chi","Dũng"].map((name,i)=>({id:`member-${i}`,name,initial:name[0]}));
for(const kind of ["memory","postgres"] as const)test(`${kind}: every message reaches every other member, including self-replies and bursts`,async()=>{
 const db=kind==="postgres"?await embeddedPool():null;
 try{
  const repo:IdeaRepository=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(new MemoryStore({version:1,ideas:[],comments:[]}));
  const [a,b,c,d]=people,room=await repo.createIdea(a,{title:"Room messages",description:"Fixture",tags:[]});
  for(const person of [b,c,d])await repo.joinIdea(room.id,person.id,person);
  await repo.muteRoom(room.id,d.id,true);
  const root=await repo.createComment(room.id,b,{clientId:"burst-root",text:"Root without mentions"});
  const replies=[];
  for(let i=0;i<8;i++)replies.push(await repo.createComment(room.id,b,{clientId:`burst-${i}`,text:`Self reply ${i}`,parentId:root.id}));
  const other=await repo.createComment(room.id,c,{text:"Reply to someone else",parentId:replies[0].id});
  await repo.createComment(room.id,b,{clientId:"burst-0",text:"Self reply 0",parentId:root.id});
  assert.equal((await repo.listNotifications(a.id,false,0)).items.length,10);
  assert.equal((await repo.listNotifications(c.id,false,0)).items.length,9);
  assert.equal((await repo.listNotifications(d.id,false,0)).items.length,10,"Muted rooms retain inbox history");
  const ownInbox=await repo.listNotifications(b.id,false,0);assert.equal(ownInbox.items.length,1);assert.equal(ownInbox.items[0].commentId,other.id);
  assert.equal((await repo.listNotifications(a.id,false,0)).items.find(n=>n.commentId===root.id)?.kind,"message");
  assert.equal(ownInbox.items[0].kind,"reply");
  const jobs=await repo.claimPush();assert(jobs.every(n=>n.userId!==d.id));
  const version=await repo.notificationVersion(a.id);await repo.readNotifications(a.id,"all");assert.notEqual(await repo.notificationVersion(a.id),version);
  const before=await repo.notificationVersion(a.id);await repo.editComment(room.id,root.id,b,{text:"Edited without new message",revision:0});assert.equal(await repo.notificationVersion(a.id),before);
  const nested=await repo.createComment(room.id,c,{text:"Nested target",parentId:replies[0].id});
  const context=await repo.getCommentContext(room.id,nested.id);assert.deepEqual(new Set(context.map(c=>c.id)),new Set([nested.id,replies[0].id,root.id]));
  const wrongRoom=await repo.createIdea(a,{title:"Other room",description:"Fixture",tags:[]});await assert.rejects(repo.getCommentContext(wrongRoom.id,nested.id),{status:404});
 }finally{await db?.close();}
});
test("inbox SSE is scoped to the authenticated account and missing context returns an actual 404",async()=>{
 const repo=new StateIdeaRepository(new MemoryStore({version:1,ideas:[],comments:[]})),auth=new AuthService(new MemoryAuthStore());
 const {user}=await auth.google({subject:"inbox-stream",name:"Reader",avatarUrl:null}),{token}=await auth.issueSession(user,null);
 const call=(path:string,session=token)=>handleApi(new Request(`https://ideahub.test/api/${path}`,{headers:{cookie:`${SESSION_COOKIE}=${session}`}}),path.split("/"),repo,auth);
 assert.equal((await call("notifications/stream","")).status,401);
 const stream=await call("notifications/stream"),reader=stream.body!.getReader();assert.equal(stream.headers.get("content-type"),"text/event-stream; charset=utf-8");assert.match(new TextDecoder().decode((await reader.read()).value),/retry/);assert.match(new TextDecoder().decode((await reader.read()).value),/notifications-changed/);await reader.cancel();
 const room=await repo.createIdea(user,{title:"API",description:"Fixture",tags:[]});assert.equal((await call(`ideas/${room.id}/comments/missing/context`)).status,404);
});
test("push drains over 20 recipients and does not suppress jobs merely because the inbox was read",async()=>{
 const jobs=Array.from({length:25},(_,i)=>({id:String(i),ideaId:"room",userId:"other",commentId:String(i),readAt:new Date().toISOString()}));
 let finished=0,claimed=0;
 const repo={claimPush:async()=>jobs.splice(0,20),pushKeys:async()=>({}),roomMuted:async()=>false,subscriptions:async()=>{claimed++;return [];},finishPush:async()=>{finished++;}} as unknown as IdeaRepository;
 await dispatchPendingPush(repo);assert.equal(finished,25);assert.equal(claimed,25);
});
