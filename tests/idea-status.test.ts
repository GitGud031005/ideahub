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
  test(`${storage}: shared states agree across viewers while new follows membership and discussions are preserved`,async()=>{
    const db=storage==="postgres"?await embeddedPool():undefined;
    const repo=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(new MemoryStore({version:1,ideas:[],comments:[]}));
    try{
      const first=await repo.createIdea(owner,input),second=await repo.createIdea(owner,{...input,title:"Second idea"});
      assert.equal(first.status,"potential");assert.equal((await repo.getIdea(first.id,member.id)).status,"potential");assert.equal((await repo.getIdea(first.id,member.id)).isNew,true);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"new"}))).total,2);
      await assert.rejects(repo.setIdeaStatus(first.id,"","archived"),{code:"AUTH_REQUIRED"});
      await assert.rejects(repo.setIdeaStatus("missing",owner.id,"potential"),{code:"NOT_FOUND"});
      assert.equal((await repo.joinIdea(first.id,member.id)).status,"potential");
      const posted=await repo.createComment(first.id,member,{text:"Keep this discussion"});
      const before=await repo.getActivity(first.id),unreadBefore=await repo.unreadCounts(owner.id);
      const archived=await repo.setIdeaStatus(first.id,member.id,"archived");assert.equal(archived.status,"archived");
      assert.equal((await repo.getIdea(first.id,owner.id)).status,"archived");
      assert.equal((await repo.getIdea(first.id,"stranger")).status,"archived");assert.equal((await repo.getIdea(first.id,"stranger")).isNew,false);
      assert(!("memberArchived" in archived));assert(!("members" in archived));
      const personal=await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"archived"}));
      assert.deepEqual(personal.items.map(i=>i.id),[first.id]);
      assert.deepEqual(personal.counts,{all:1,new:1,potential:1,archived:1,mine:0});
      assert.equal((await repo.listIdeas(owner.id,ideaQuerySchema.parse({view:"archived"}))).total,1);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({}))).total,1); // All excludes archives.
      assert.deepEqual((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"new"}))).items.map(i=>i.id),[second.id]);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"potential"}))).total,1);
      assert.equal((await repo.listIdeas(owner.id,ideaQuerySchema.parse({view:"mine"}))).total,1);
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({q:"missing keyword"}))).total,0);
      assert.equal((await repo.listComments(first.id)).items[0].id,posted.id);
      assert.deepEqual(await repo.getActivity(first.id),before);assert.deepEqual(await repo.unreadCounts(owner.id),unreadBefore);
      assert.equal((await repo.joinIdea(first.id,member.id)).status,"archived"); // Re-entry never restores silently.
      await repo.joinIdea(first.id,"third-person");assert.equal((await repo.getIdea(first.id,member.id)).status,"archived");
      await repo.setIdeaStatus(first.id,member.id,"potential");
      assert.equal((await repo.listIdeas(member.id,ideaQuerySchema.parse({view:"potential"}))).total,2);
      assert.equal((await repo.getIdea(first.id,member.id)).joined,true);
      const outsider={id:"status-outsider",name:"Outsider",initial:"X"};
      if(db)await db.pool.query("INSERT INTO public.users(id,display_name,initial) VALUES($1,$2,$3)",[outsider.id,outsider.name,outsider.initial]);
      const countBefore=(await repo.getIdea(first.id,outsider.id)).memberCount;
      const changed=await repo.setIdeaStatus(first.id,outsider.id,"archived");assert.equal(changed.joined,false);assert.equal(changed.memberCount,countBefore);
      assert.equal((await repo.getIdea(first.id,owner.id)).status,"archived");
      if(db){const row=(await db.pool.query("SELECT status_updated_by,status_updated_at FROM public.ideas WHERE id=$1",[first.id])).rows[0];assert.equal(row.status_updated_by,outsider.id);assert(row.status_updated_at);}
      await repo.setIdeaStatus(first.id,outsider.id,"potential");
      assert.equal((await repo.getIdea(first.id,outsider.id)).isNew,true);
      assert.equal((await repo.getIdea(first.id,owner.id)).isNew,false);
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

test('shared bootstrap uses only the selected source, preserves memberships and never overwrites later edits',async()=>{
 const db=await embeddedPool(),repo=new PostgresIdeaRepository(db.pool);
 try{
  const a=await repo.createIdea(owner,input),b=await repo.createIdea(member,{...input,title:'Other owner'}),c=await repo.createIdea(member,{...input,title:'Source never joined'});
  await repo.joinIdea(a.id,member.id);await repo.joinIdea(b.id,owner.id);
  await db.pool.query('UPDATE public.memberships SET archived=true WHERE idea_id=$1 AND user_id=$2',[a.id,owner.id]);
  await db.pool.query('UPDATE public.memberships SET archived=true WHERE user_id=$1',[member.id]);
  const before=(await db.pool.query('SELECT * FROM public.memberships ORDER BY idea_id,user_id')).rows;
  const {readFile}=await import('node:fs/promises');const sql=await readFile(new URL('../scripts/shared-classification-bootstrap.sql',import.meta.url),'utf8');
  assert.equal((await db.pool.query(sql,['unknown-source'])).rows[0].migrated,0);
  assert.deepEqual((await db.pool.query(sql,[owner.id])).rows[0],{migrated:3,potential:2,archived:1});
  assert.equal((await repo.getIdea(a.id,member.id)).status,'archived');
  assert.equal((await repo.getIdea(b.id,member.id)).status,'potential');
  assert.equal((await repo.getIdea(c.id,owner.id)).isNew,true);
  assert.deepEqual((await db.pool.query('SELECT * FROM public.memberships ORDER BY idea_id,user_id')).rows,before);
  await repo.setIdeaStatus(a.id,member.id,'potential');
  assert.equal((await db.pool.query(sql,[owner.id])).rows[0].migrated,0);
  assert.equal((await repo.getIdea(a.id,owner.id)).status,'potential');
 }finally{await db.close();}
});
