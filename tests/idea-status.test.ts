import assert from "node:assert/strict";
import { test } from "node:test";
import { ideaQuerySchema, updateIdeaStatusSchema } from "../src/lib/validation";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { embeddedPool } from "./helpers/postgres";
const owner={id:"status-owner",name:"Owner",initial:"O"},member={id:"status-member",name:"Member",initial:"M"};
const input={title:"Personal classification",description:"Discuss the next step",category:"Thiết kế" as const,tags:["Teamwork"]};

for(const storage of ["memory","postgres"] as const){
  test(`${storage}: new follows membership, archives isolate viewers and preserve discussion`,async()=>{
    const db=storage==="postgres"?await embeddedPool():undefined;
    const repo=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(new MemoryStore({version:1,ideas:[],comments:[]}));
    try{
      const first=await repo.createIdea(owner,input),second=await repo.createIdea(owner,{...input,title:"Second idea"});
      assert.equal(first.status,"potential");assert.equal((await repo.getIdea(first.id,member.id)).status,"new");
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"new"}))).total,2);
      await assert.rejects(repo.setIdeaStatus(first.id,"stranger","archived"),{code:"NOT_JOINED"});
      await assert.rejects(repo.setIdeaStatus("missing",owner.id,"potential"),{code:"NOT_FOUND"});
      assert.equal((await repo.joinIdea(first.id,member.id)).status,"potential");
      const posted=await repo.createComment(first.id,member,{text:"Keep this discussion"});
      const before=await repo.getActivity(first.id),unreadBefore=await repo.unreadCounts(owner.id);
      const archived=await repo.setIdeaStatus(first.id,member.id,"archived");assert.equal(archived.status,"archived");
      assert.equal((await repo.getIdea(first.id,owner.id)).status,"potential");
      assert.equal((await repo.getIdea(first.id,"stranger")).status,"new");
      assert(!("memberArchived" in archived));assert(!("members" in archived));
      const personal=await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"archived"}));
      assert.deepEqual(personal.items.map(i=>i.id),[first.id]);
      assert.deepEqual(personal.counts,{all:2,new:1,potential:0,archived:1,mine:0});
      assert.equal((await repo.listIdeas(owner.id,ideaQuerySchema.parse({view:"archived"}))).total,0);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({}))).total,2); // All includes archives.
      assert.deepEqual((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"new"}))).items.map(i=>i.id),[second.id]);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"potential"}))).total,0);
      assert.equal((await repo.listIdeas(owner.id,ideaQuerySchema.parse({view:"mine"}))).total,2);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({q:"missing keyword"}))).total,0);
      assert.equal((await repo.listComments(first.id)).items[0].id,posted.id);
      assert.deepEqual(await repo.getActivity(first.id),before);assert.deepEqual(await repo.unreadCounts(owner.id),unreadBefore);
      assert.equal((await repo.joinIdea(first.id,member.id)).status,"archived"); // Re-entry never restores silently.
      await repo.joinIdea(first.id,"third-person");assert.equal((await repo.getIdea(first.id,member.id)).status,"archived");
      await repo.setIdeaStatus(first.id,member.id,"potential");
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"potential"}))).total,1);
      assert.equal((await repo.getIdea(first.id,member.id)).joined,true);
      const firstPage=await repo.listIdeas(member.id,ideaQuerySchema.parse({limit:1}));assert(firstPage.nextCursor);
      await assert.rejects(repo.listIdeas(member.id,ideaQuerySchema.parse({view:"new",cursor:firstPage.nextCursor})),{code:"INVALID_CURSOR"});
      const next=await repo.listIdeas(member.id,ideaQuerySchema.parse({limit:1,cursor:firstPage.nextCursor}));
      assert.equal(new Set([...firstPage.items,...next.items].map(i=>i.id)).size,2);
    }finally{await db?.close();}
  });
}

test("only potential/archive are writable; the five views have one default",()=>{
  assert.equal(ideaQuerySchema.parse({}).view,"all");
  for(const value of [{status:"new"},{status:"deleted"},{status:"potential",creatorId:"forged"},{status:null}])assert(!updateIdeaStatusSchema.safeParse(value).success);
  for(const view of ["all","new","potential","archived","mine"])assert(ideaQuerySchema.safeParse({view}).success);
  assert(!ideaQuerySchema.safeParse({view:"joined"}).success);
});
