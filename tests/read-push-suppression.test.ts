import assert from "node:assert/strict";
import {test} from "node:test";
import {createECDH,randomBytes} from "node:crypto";
import {StateIdeaRepository,type IdeaRepository} from "../src/server/repository";
import {PostgresIdeaRepository} from "../src/server/postgres-repository";
import {MemoryStore} from "../src/server/stores";
import {embeddedPool} from "./helpers/postgres";
import {dispatchPendingPush,pushReceiptDelay} from "../src/server/web-push";
const writer={id:"writer",name:"Writer",initial:"W"},reader={id:"reader",name:"Reader",initial:"R"},other={id:"other",name:"Other",initial:"O"};
for(const kind of ["memory","postgres"] as const)test(`${kind}: visible comment receipts clear only matching inbox entries and cancel their pending push`,async()=>{
 const db=kind==="postgres"?await embeddedPool():null;
 try{
  const repo:IdeaRepository=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(new MemoryStore({version:1,ideas:[],comments:[]}));
  const room=await repo.createIdea(writer,{title:"Reading fixture",description:"Fixture",tags:[]});
  await repo.joinIdea(room.id,reader.id,reader);await repo.joinIdea(room.id,other.id,other);
  const root=await repo.createComment(room.id,writer,{text:"Visible root"});
  const reply=await repo.createComment(room.id,writer,{text:"Collapsed reply",parentId:root.id});
  const inbox=await repo.listNotifications(reader.id,false,0),rootNotice=inbox.items.find(n=>n.commentId===root.id)!,replyNotice=inbox.items.find(n=>n.commentId===reply.id)!;
  await repo.claimPush(); // Receipts can arrive after a dispatcher has claimed its snapshot.
  assert(await repo.pushUnread(rootNotice.id,reader.id));
  const version=await repo.notificationVersion(reader.id);
  await repo.markRead(room.id,reader.id,[root.id]);
  assert.equal(await repo.pushUnread(rootNotice.id,reader.id),false);
  assert.equal(await repo.pushUnread(replyNotice.id,reader.id),true);
  assert.equal((await repo.listNotifications(reader.id,false,0)).unread,1);
  assert.equal((await repo.listNotifications(other.id,false,0)).unread,2);
  assert.notEqual(await repo.notificationVersion(reader.id),version);
  await assert.rejects(repo.markRead(room.id,reader.id,[reply.id,"wrong-room-comment"]));
  assert(await repo.pushUnread(replyNotice.id,reader.id),"invalid receipt rolls back the whole batch");
  assert.equal(await repo.pushUnread(replyNotice.id,other.id),false);
 }finally{await db?.close();}
});
test("dispatcher gives live read receipts a bounded window and rechecks after claiming",async()=>{
 const ec=createECDH("prime256v1");ec.generateKeys();
 const keys={publicKey:ec.getPublicKey().toString("base64url"),privateKey:ec.getPrivateKey().toString("base64url")};
 const subscription={endpoint:"https://web.push.apple.com/test",keys:{p256dh:keys.publicKey,auth:randomBytes(16).toString("base64url")}};
 const jobs=["viewed","background","another-room","collapsed"].map(id=>({id,userId:reader.id,ideaId:"room",commentId:id,kind:"message",ideaTitle:"Room",actor:writer,excerpt:"Hello",createdAt:new Date().toISOString()}));
 const read=new Set<string>(),finished:string[]=[],delays:number[]=[];let calls=0;
 const repo={claimPush:async()=>jobs.splice(0),pushKeys:async()=>keys,roomMuted:async()=>false,subscriptions:async()=>[subscription],pushUnread:async(id:string)=>!read.has(id),finishPush:async(id:string)=>{finished.push(id);}} as unknown as IdeaRepository;
 await dispatchPendingPush(repo,async()=>{calls++;return new Response("",{status:201});},async ms=>{delays.push(ms);read.add("viewed");});
 assert.equal(calls,3);assert.equal(finished.length,4);assert(delays.every(ms=>ms>0&&ms<=3000));
});
test("retrying old push jobs never adds another receipt delay",()=>{
 assert.equal(pushReceiptDelay("2026-01-01T00:00:00Z",Date.parse("2026-01-01T00:00:04Z")),0);
 assert.equal(pushReceiptDelay("invalid"),0);
 assert.equal(pushReceiptDelay("2026-01-01T00:00:01Z",Date.parse("2026-01-01T00:00:00Z")),3000);
});
