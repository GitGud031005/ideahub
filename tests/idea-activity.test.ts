import assert from "node:assert/strict";
import { test } from "node:test";
import { StateIdeaRepository } from "../src/server/repository";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { MemoryStore } from "../src/server/stores";
import { embeddedPool } from "./helpers/postgres";
import { ideaQuerySchema } from "../src/lib/validation";
import { messageTimeAgo } from "../src/lib/format";

for(const storage of ["memory","postgres"] as const){
  test(`${storage}: last message includes nested replies; read/pin/status do not change the order`,async()=>{
    const db=storage==="postgres"?await embeddedPool():undefined;
    const state=new MemoryStore({version:1,ideas:[],comments:[]});
    const repo=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(state);
    const user={id:"activity-user",name:"Activity tester",initial:"A"};
    const query=ideaQuerySchema.parse({limit:100});
    try{
      const a=await repo.createIdea(user,{title:"Old room",description:"Replies keep the room active",tags:[]});
      const b=await repo.createIdea(user,{title:"Another room",description:"Another discussion",tags:[]});
      const empty=await repo.createIdea(user,{title:"Empty room",description:"No activity yet",tags:[]});
      for(const [id,time] of [[a.id,"2026-01-01T00:00:00Z"],[b.id,"2026-01-02T00:00:00Z"],[empty.id,"2026-01-12T00:00:00Z"]]){
        if(db)await db.pool.query("UPDATE public.ideas SET created_at=$2 WHERE id=$1",[id,time]);
        else await state.transact(s=>{s.ideas.find(i=>i.id===id)!.createdAt=time;});
      }
      const root=await repo.createComment(a.id,user,{text:"Root"});
      const other=await repo.createComment(b.id,user,{text:"Other room root"});
      const reply=await repo.createComment(a.id,user,{text:"Nested newest reply",parentId:root.id});
      for(const [id,time] of [[root.id,"2026-01-09T00:00:00Z"],[other.id,"2026-01-10T00:00:00Z"],[reply.id,"2026-01-13T00:00:00Z"]]){
        if(db)await db.pool.query("UPDATE public.comments SET created_at=$2 WHERE id=$1",[id,time]);
        else await state.transact(s=>{s.comments.find(c=>c.id===id)!.createdAt=time;});
      }
      assert.equal(query.sort,"activity");
      let page=await repo.listIdeas(user.id,query);
      assert.deepEqual(page.items.map(i=>i.id),[a.id,empty.id,b.id]);
      assert.equal(new Date(page.items[0].lastCommentAt!).toISOString(),"2026-01-13T00:00:00.000Z");
      assert.equal((await repo.getIdea(empty.id,user.id)).lastCommentAt,null);
      assert.deepEqual((await repo.listIdeas(user.id,{...query,sort:"new"})).items.map(i=>i.id),[empty.id,b.id,a.id]);
      await repo.markRead(a.id,user.id,[root.id,reply.id]);
      await repo.pinComment(b.id,other.id,user.id,true);
      await repo.setIdeaStatus(b.id,user.id,"archived");
      assert.deepEqual((await repo.listIdeas(user.id,query)).items.map(i=>i.id),[a.id,empty.id,b.id]);
      const fresh=await repo.createComment(b.id,user,{text:"Fresh reply",parentId:other.id});
      page=await repo.listIdeas(user.id,query);
      assert.equal(page.items[0].id,b.id);assert.equal(page.items[0].lastCommentAt,fresh.createdAt);
      assert.equal((await repo.listIdeas(user.id,{...query,view:"archived"})).items[0].id,b.id);
      assert.equal((await repo.listIdeas(user.id,{...query,q:"Old room"})).items[0].id,a.id);
    }finally{await db?.close();}
  });
}

test("message age keeps minute/hour/day labels including old conversations",()=>{
  const now=Date.parse("2026-10-20T10:00:00Z");
  for(const [age,label] of [[0,"Vừa xong"],[60000,"1 phút trước"],[7200000,"2 giờ trước"],[86400000,"1 ngày trước"],[30*86400000,"30 ngày trước"]] as const){
    assert.equal(messageTimeAgo(new Date(now-age).toISOString(),now),label);
  }
});
