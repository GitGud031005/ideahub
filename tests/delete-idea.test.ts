import assert from "node:assert/strict";
import {test} from "node:test";
import {StateIdeaRepository,type IdeaRepository} from "../src/server/repository";
import {MemoryStore} from "../src/server/stores";
import {PostgresIdeaRepository} from "../src/server/postgres-repository";
import {embeddedPool} from "./helpers/postgres";
import {AuthService,MemoryAuthStore} from "../src/server/auth";
import {handleApi} from "../src/server/api";
import {SESSION_COOKIE} from "../src/server/session";
const owner={id:"delete-owner",name:"Owner",initial:"O"},member={id:"delete-member",name:"Member",initial:"M"};
async function contract(repo:IdeaRepository,before?:(id:string)=>Promise<void>){
 const room=await repo.createIdea(owner,{title:"Delete this idea",description:"Owner only",tags:[]});
 const other=await repo.createIdea(member,{title:"Keep this idea",description:"Unrelated",tags:[]});
 await repo.joinIdea(room.id,member.id,member);
 const root=await repo.createComment(room.id,owner,{text:"Root"});
 const child=await repo.createComment(room.id,member,{text:"Reply",parentId:root.id});
 await repo.createComment(room.id,owner,{text:"Nested",parentId:child.id});
 await repo.markRead(room.id,owner.id,child.id);
 await repo.saveAttachment({id:"delete-file",ideaId:room.id,ownerId:owner.id,assetId:"qa/asset",commentId:null,name:"qa.txt",mime:"text/plain",size:1,kind:"file",url:"https://example.test/file",createdAt:new Date().toISOString()});
 await repo.muteRoom(room.id,member.id,true);
 await assert.rejects(repo.deleteIdea(room.id,member.id),{code:"NOT_OWNER"});
 assert.equal((await repo.getIdea(room.id,owner.id)).commentCount,3);
 await before?.(room.id);
 await repo.deleteIdea(room.id,owner.id);
 await assert.rejects(repo.getIdea(room.id,owner.id),{status:404});
 await assert.rejects(repo.getAttachment(room.id,"delete-file",owner.id),{status:404});
 assert(!(await repo.listNotifications(member.id,false,0)).items.some(n=>n.ideaId===room.id));
 assert(!(room.id in await repo.unreadCounts(member.id)));
 assert.equal((await repo.getIdea(other.id,member.id)).title,"Keep this idea");
 await assert.rejects(repo.deleteIdea(room.id,owner.id),{status:404});
 return room.id;
}
test("only owner deletes a memory idea and related room state",async()=>{const store=new MemoryStore();const id=await contract(new StateIdeaRepository(store));assert.equal(await store.read(s=>s.comments.filter(c=>c.ideaId===id).length),0);});
test("PostgreSQL owner deletion cascades comments, memberships, receipts, attachments, notifications and recaps",async()=>{
 const db=await embeddedPool();try{const id=await contract(new PostgresIdeaRepository(db.pool),async id=>{await db.pool.query("INSERT INTO ideahub_private.recaps(id,idea_id,kind,period_start,period_end,source,content) VALUES('delete-recap',$1,'daily','2026-10-28','2026-10-29','sample','{}')",[id]);});
 for(const table of ["public.comments","public.memberships","public.comment_read_receipts","public.discussion_attachments","ideahub_private.notifications","ideahub_private.recaps"]){assert.equal(Number((await db.pool.query(`SELECT count(*) AS n FROM ${table} WHERE idea_id=$1`,[id])).rows[0].n),0,table);}
 }finally{await db.close();}
});
test("delete API rejects guests, nonowners, cross-origin and identity spoofing; GET never deletes",async()=>{
 const repo=new StateIdeaRepository(new MemoryStore()),auth=new AuthService(new MemoryAuthStore());
 const a=await auth.register({username:"delete_actor_a",fullName:"Owner",password:"Test2026"},null),b=await auth.register({username:"delete_actor_b",fullName:"Other",password:"Test2026"},null);
 const room=await repo.createIdea(a.user,{title:"Delete API test",description:"Testing",tags:[]});
 const call=(token:string,body:unknown={},origin="https://ideahub.test",method="POST")=>handleApi(new Request(`https://ideahub.test/api/ideas/${room.id}/delete`,{method,headers:{origin,"content-type":"application/json",cookie:`${SESSION_COOKIE}=${token}`},body:method==="GET"?undefined:JSON.stringify(body)}),["ideas",room.id,"delete"],repo,auth);
 assert.equal((await call("")).status,401);assert.equal((await call(b.token)).status,403);
 assert.equal((await call(a.token,{},"https://attacker.test")).status,403);
 assert.equal((await call(b.token,{userId:a.user.id})).status,422);
 assert.equal((await call(a.token,{},"https://ideahub.test","GET")).status,405);
 assert.equal((await repo.getIdea(room.id,a.user.id)).mine,true);
 assert.equal((await call(a.token)).status,200);assert.equal((await call(a.token)).status,404);
});
