import assert from "node:assert/strict";
import { test } from "node:test";
import { ideaQuerySchema, updateIdeaStatusSchema } from "../src/lib/validation";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { embeddedPool } from "./helpers/postgres";
const owner={id:"status-owner",name:"Owner",initial:"O"},member={id:"status-member",name:"Member",initial:"M"};
const input={title:"Shared classification",description:"Discuss the next step",category:"Thiết kế" as const,tags:["Teamwork"]};

for(const storage of ["memory","postgres"] as const){
  test(`${storage}: shared idea status enforces membership, archives reversibly and preserves discussion`,async()=>{
    const db=storage==="postgres"?await embeddedPool():undefined;
    const repo=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(new MemoryStore({version:1,ideas:[],comments:[]}));
    try{
      const first=await repo.createIdea(owner,input),second=await repo.createIdea(owner,{...input,title:"Second idea"});
      assert.equal(first.status,"new");
      await assert.rejects(repo.setIdeaStatus(first.id,"stranger","archived"),{code:"NOT_JOINED"});
      await assert.rejects(repo.setIdeaStatus("missing",owner.id,"potential"),{code:"NOT_FOUND"});
      await repo.joinIdea(first.id,member.id);
      const posted=await repo.createComment(first.id,member,{text:"Keep this discussion"});
      const before=await repo.getActivity(first.id);
      const updated=await repo.setIdeaStatus(first.id,member.id,"potential");
      assert.equal(updated.status,"potential");assert.equal((await repo.getIdea(first.id,owner.id)).status,"potential");
      await repo.setIdeaStatus(first.id,member.id,"archived");
      const active=await repo.listIdeas(owner.id,ideaQuerySchema.parse({}));
      assert.deepEqual(active.items.map(i=>i.id),[second.id]);assert.equal(active.counts.mine,1);
      assert.deepEqual(active.statusCounts,{all:2,active:1,new:1,potential:0,archived:1});
      const archived=await repo.listIdeas(member.id,ideaQuerySchema.parse({status:"archived",view:"joined"}));
      assert.deepEqual(archived.items.map(i=>i.id),[first.id]);assert.equal(archived.counts.joined,1);
      assert.equal(archived.statusCounts.all,1);
      const all=await repo.listIdeas(owner.id,ideaQuerySchema.parse({status:"all"}));assert.equal(all.total,2);
      const noMatch=await repo.listIdeas(owner.id,ideaQuerySchema.parse({status:"all",q:"missing keyword"}));
      assert.equal(noMatch.total,0);assert.equal(noMatch.statusCounts.all,0);
      assert.equal((await repo.listComments(first.id)).items[0].id,posted.id);
      assert.deepEqual(await repo.getActivity(first.id),before); // Classification never creates unread messages.
      assert.equal((await repo.getIdea(first.id,member.id)).joined,true);
      await repo.setIdeaStatus(first.id,owner.id,"potential");
      assert.equal((await repo.listIdeas(owner.id,ideaQuerySchema.parse({}))).total,2);
      const firstPage=await repo.listIdeas(owner.id,ideaQuerySchema.parse({status:"all",limit:1}));assert(firstPage.nextCursor);
      await assert.rejects(repo.listIdeas(owner.id,ideaQuerySchema.parse({status:"new",cursor:firstPage.nextCursor})),{code:"INVALID_CURSOR"});
      const next=await repo.listIdeas(owner.id,ideaQuerySchema.parse({status:"all",limit:1,cursor:firstPage.nextCursor}));
      assert.equal(new Set([...firstPage.items,...next.items].map(i=>i.id)).size,2);
    }finally{await db?.close();}
  });
}

test("status inputs are strict and archived is never the default dashboard filter",()=>{
  assert.equal(ideaQuerySchema.parse({}).status,"active");
  for(const value of [{status:"deleted"},{status:"new",creatorId:"forged"},{status:null}])assert(!updateIdeaStatusSchema.safeParse(value).success);
  assert(!ideaQuerySchema.safeParse({status:"other"}).success);
});
