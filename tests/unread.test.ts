import assert from "node:assert/strict";
import { test } from "node:test";
import { StateIdeaRepository, type IdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { embeddedPool } from "./helpers/postgres";
import { AuthService, MemoryAuthStore } from "../src/server/auth";
import { handleApi } from "../src/server/api";
import { SESSION_COOKIE } from "../src/server/session";

const a={id:"reader-a",name:"A",initial:"A"},b={id:"reader-b",name:"B",initial:"B"},c={id:"reader-c",name:"C",initial:"C"};
async function contract(repo:IdeaRepository){
  const idea=await repo.createIdea(a,{title:"Unread room",description:"Read markers",category:"Công nghệ",tags:[]});
  await repo.createComment(idea.id,a,{text:"Old history"});await repo.joinIdea(idea.id,b.id);
  assert.equal((await repo.unreadCounts(b.id))[idea.id],0);
  const root=await repo.createComment(idea.id,a,{text:"New message"});
  const reply=await repo.createComment(idea.id,b,{text:"Own reply",parentId:root.id});
  assert.equal((await repo.unreadCounts(b.id))[idea.id],1);assert.equal((await repo.unreadCounts(a.id))[idea.id],1);
  assert.equal((await repo.unreadCounts(c.id))[idea.id],undefined);
  await assert.rejects(repo.markRead(idea.id,c.id,root.id),{code:"NOT_JOINED"});
  const other=await repo.createIdea(a,{title:"Other room",description:"Another",category:"Khác",tags:[]});
  await assert.rejects(repo.markRead(other.id,a.id,root.id),{code:"INVALID_COMMENT"});
  await repo.markRead(idea.id,b.id,root.id);assert.equal((await repo.unreadCounts(b.id))[idea.id],0);
  const next=await repo.createComment(idea.id,a,{text:"After the loaded snapshot",clientId:"72fc48c3-2277-412d-a07d-897597516dad"});
  await repo.markRead(idea.id,b.id,reply.id);assert.equal((await repo.unreadCounts(b.id))[idea.id],1);
  await Promise.all([repo.markRead(idea.id,b.id,next.id),repo.markRead(idea.id,b.id,root.id)]);
  assert.equal((await repo.unreadCounts(b.id))[idea.id],0);
  await repo.createComment(idea.id,a,{text:next.text,clientId:next.id});assert.equal((await repo.unreadCounts(b.id))[idea.id],0);
  const loaded=await repo.listComments(idea.id);assert(loaded.items.every(c=>/^\d+$/.test(c.readCursor!)));
  assert(!JSON.stringify(await repo.getIdea(idea.id,b.id)).includes("memberReadCursor"));
}
test("memory unread markers isolate users, skip prior history, count replies and never rewind",async()=>contract(new StateIdeaRepository(new MemoryStore())));
test("PostgreSQL unread markers persist across repository instances and stale concurrent acknowledgements",async()=>{
  const db=await embeddedPool();try{await contract(new PostgresIdeaRepository(db.pool));
    const restarted=new PostgresIdeaRepository(db.pool),counts=await restarted.unreadCounts(b.id);assert(Object.values(counts).every(n=>n===0));
  }finally{await db.close();}
});
test("read API requires session, own membership, same-origin, and rejects caller-supplied identity",async()=>{
  const auth=new AuthService(new MemoryAuthStore()),repo=new StateIdeaRepository(new MemoryStore());
  const login=await auth.register({username:"unread_actor",fullName:"Unread Actor",password:"Test2026"},null);
  const room=await repo.createIdea(login.user,{title:"API room",description:"Testing",category:"Khác",tags:[]});const comment=await repo.createComment(room.id,login.user,{text:"Read me"});
  const call=(path:string,body?:unknown,token="",origin="https://ideahub.test")=>handleApi(new Request(`https://ideahub.test/api/${path}`,{method:body?"POST":"GET",headers:{origin,"content-type":"application/json",cookie:`${SESSION_COOKIE}=${token}`},body:body?JSON.stringify(body):undefined}),path.split("/"),repo,auth);
  assert.equal((await call("unread")).status,401);assert.equal((await call(`ideas/${room.id}/read`,{commentId:comment.id})).status,401);
  assert.equal((await call(`ideas/${room.id}/read`,{commentId:comment.id},login.token,"https://attacker.test")).status,403);
  assert.equal((await call(`ideas/${room.id}/read`,{commentId:comment.id,userId:b.id},login.token)).status,422);
  assert.equal((await call(`ideas/${room.id}/read`,{commentId:comment.id},login.token)).status,200);
  assert.equal((await call(`ideas/${room.id}/read`)).status,401);
  const readState=await call(`ideas/${room.id}/read`,undefined,login.token);
  assert.equal(readState.status,200);assert.deepEqual(await readState.json(),{unreadIds:[]});assert.match(readState.headers.get("cache-control")!,/no-store/);
  assert.equal((await call(`ideas/${room.id}/read`,{commentIds:[]},login.token)).status,422);
  assert.equal((await call(`ideas/${room.id}/read`,{commentIds:Array(201).fill(comment.id)},login.token)).status,422);
  assert.equal((await call(`ideas/${room.id}/read`,{commentIds:[comment.id],userId:b.id},login.token)).status,422);
  assert.equal((await call(`ideas/${room.id}/read`,{commentIds:[comment.id]},login.token)).status,200);
  const response=await call("unread",undefined,login.token);assert.equal(response.status,200);assert.equal((await response.json())[room.id],0);assert.match(response.headers.get("cache-control")!,/no-store/);
});
