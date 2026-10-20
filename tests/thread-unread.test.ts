import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { branchCommentCounts, visibleCommentIds } from "../src/lib/comment-unread";
import { buildCommentForest } from "../src/lib/format";
import type { Comment } from "../src/lib/domain";
import { CommentTree } from "../src/components/comment-tree";
import { StateIdeaRepository, type IdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { embeddedPool } from "./helpers/postgres";
import { CachedIdeaRepository } from "../src/server/cached-repository";
import { RedisCache } from "../src/server/redis-cache";

const reader={id:"thread-reader",name:"Reader",initial:"R"},writer={id:"thread-writer",name:"Writer",initial:"W"};
const comment=(id:string,parentId:string|null):Comment=>({id,parentId,ideaId:"room",author:writer,text:id,createdAt:"2026-10-20T00:00:00Z"});
const fixture=[comment("root",null),comment("a","root"),comment("b","root"),comment("c","a"),comment("d","a"),comment("e","c"),comment("f","b")];

test("six replies mix read/unread and opening one level retains nested leaves in ancestor totals",()=>{
  const tree=buildCommentForest(fixture,"old"),unread=new Set(["a","b","c","e"]);
  assert.deepEqual(branchCommentCounts(tree,unread).get("root"),{total:6,unread:4});
  assert.deepEqual(visibleCommentIds(fixture,new Set()),["root"]);
  const openRoot=new Set(["root"]),shown=visibleCommentIds(fixture,openRoot);
  assert.deepEqual(shown,["root","a","b"]);
  shown.forEach(id=>unread.delete(id));
  let counts=branchCommentCounts(tree,unread);
  assert.deepEqual(counts.get("root"),{total:6,unread:2});
  assert.deepEqual(counts.get("a"),{total:3,unread:2});
  assert.deepEqual(counts.get("b"),{total:1,unread:0});
  visibleCommentIds(fixture,new Set(["root","a"])).forEach(id=>unread.delete(id));
  counts=branchCommentCounts(tree,unread);
  assert.equal(counts.get("root")?.unread,1);assert.equal(counts.get("a")?.unread,1);assert.equal(counts.get("c")?.unread,1);
  visibleCommentIds(fixture,new Set(["root","a","c"])).forEach(id=>unread.delete(id));
  assert.equal(branchCommentCounts(tree,unread).get("root")?.unread,0);
  // Re-collapsing the ancestor hides rendered descendants without undoing receipts.
  assert.deepEqual(visibleCommentIds(fixture,new Set(["a","c"])),["root"]);
  assert.deepEqual(branchCommentCounts(buildCommentForest(fixture,"new"),unread).get("root"),{total:6,unread:0});
});

test("reply buttons render descendant unread totals on closed and open levels and omit zero badges",()=>{
  const render=(unread:Set<string>,expanded=new Set<string>())=>renderToStaticMarkup(createElement(CommentTree,{
    children:buildCommentForest(fixture,"old"),unread,expanded,ideaId:"room",creatorId:writer.id,userId:reader.id,
    toggle:()=>{},target:null,setTarget:()=>{},retry:()=>{},dismiss:()=>{},submit:()=>{},
  }));
  const closed=render(new Set(["a","b","c","e"]));
  assert.match(closed,/Xem 6 trả lời/);assert.match(closed,/4 tin chưa đọc/);assert(!closed.includes('id="comment-a"'));
  const open=render(new Set(["c","e"]),new Set(["root"]));
  assert.match(open,/Ẩn trả lời/);assert.equal((open.match(/2 tin chưa đọc/g)??[]).length,2);
  assert.match(open,/Xem 3 trả lời/);assert(!open.includes('id="comment-c"'));
  assert(!render(new Set()).includes("tin chưa đọc"));
});

async function exactReadContract(repo:IdeaRepository){
  const room=await repo.createIdea(writer,{title:"Thread reads",description:"Exact branch receipts",category:"Khác",tags:[]});
  const history=await repo.createComment(room.id,writer,{text:"Prior history"});
  await repo.joinIdea(room.id,reader.id);
  assert.deepEqual(await repo.unreadCommentIds(room.id,reader.id),[history.id]);
  await repo.markRead(room.id,reader.id,history.id);
  const root=await repo.createComment(room.id,writer,{text:"Root"});
  const left=await repo.createComment(room.id,writer,{text:"Left",parentId:root.id});
  const right=await repo.createComment(room.id,writer,{text:"Right",parentId:root.id});
  const leaf=await repo.createComment(room.id,writer,{text:"Hidden leaf",parentId:left.id});
  const own=await repo.createComment(room.id,reader,{text:"Own message",parentId:right.id});
  assert.deepEqual(new Set(await repo.unreadCommentIds(room.id,reader.id)),new Set([root.id,left.id,right.id,leaf.id]));
  // A later visible root must not swallow earlier replies in a closed branch.
  const latest=await repo.createComment(room.id,writer,{text:"Another root"});
  await repo.markRead(room.id,reader.id,[root.id,latest.id]);
  assert.equal((await repo.unreadCounts(reader.id))[room.id],3);
  await repo.markRead(room.id,reader.id,[left.id,right.id,own.id,history.id]);
  assert.deepEqual(await repo.unreadCommentIds(room.id,reader.id),[leaf.id]);
  // Concurrent repeated receipts are idempotent and isolated between readers.
  await repo.markRead(room.id,writer.id,own.id);
  assert.equal((await repo.unreadCounts(reader.id))[room.id],1);
  await Promise.all([repo.markRead(room.id,reader.id,[left.id,right.id]),repo.markRead(room.id,reader.id,root.id)]);
  assert.deepEqual(await repo.unreadCommentIds(room.id,reader.id),[leaf.id]);
  const other=await repo.createIdea(writer,{title:"Other",description:"Other",category:"Khác",tags:[]});
  const foreign=await repo.createComment(other.id,writer,{text:"Wrong room"});
  await assert.rejects(repo.markRead(room.id,reader.id,[leaf.id,foreign.id]),{code:"INVALID_COMMENT"});
  assert.deepEqual(await repo.unreadCommentIds(room.id,reader.id),[leaf.id]);
  await assert.rejects(repo.unreadCommentIds(room.id,"outsider"),{code:"NOT_JOINED"});
  await assert.rejects(repo.markRead(room.id,"outsider",leaf.id),{code:"NOT_JOINED"});
  assert(!JSON.stringify(await repo.getIdea(room.id,reader.id)).includes("memberReadComments"));
  return {room,leaf};
}
test("memory exact receipts preserve hidden branches and viewer isolation",async()=>{
  await exactReadContract(new StateIdeaRepository(new MemoryStore()));
});
test("PostgreSQL exact receipts survive restart, reject mixed-room batches atomically, and preserve join baseline",async()=>{
  const db=await embeddedPool();try{
    const {room,leaf}=await exactReadContract(new PostgresIdeaRepository(db.pool));
    const restarted=new PostgresIdeaRepository(db.pool);
    assert.deepEqual(await restarted.unreadCommentIds(room.id,reader.id),[leaf.id]);
    await restarted.markRead(room.id,reader.id,[leaf.id,leaf.id]);
    assert.equal((await restarted.unreadCounts(reader.id))[room.id],0);
  }finally{await db.close();}
});
test("personal branch read state bypasses shared Redis cache",async()=>{
  let calls=0;
  const inner=new StateIdeaRepository(new MemoryStore());
  const {room,leaf}=await exactReadContract(inner);
  const cache=new RedisCache({async command(){calls++;throw Error("Unexpected Redis call");}},"thread-read-test");
  const cached=new CachedIdeaRepository(inner,cache);
  assert.deepEqual(await cached.unreadCommentIds(room.id,reader.id),[leaf.id]);
  await cached.markRead(room.id,reader.id,[leaf.id]);
  assert.equal((await cached.unreadCounts(reader.id))[room.id],0);
  assert.equal(calls,0);
});

async function newMemberHistoryContract(repo:IdeaRepository){
  const room=await repo.createIdea(writer,{title:"Existing conversation",description:"Existing replies must stay unread for a new member",category:"Khác",tags:[]});
  const saved=new Map<string,Comment>();
  for(const c of fixture){saved.set(c.id,await repo.createComment(room.id,writer,{text:c.text,parentId:c.parentId?saved.get(c.parentId)!.id:null}));}
  // All seven comments already exist before this account joins.
  await repo.joinIdea(room.id,reader.id);
  assert.equal((await repo.unreadCounts(reader.id))[room.id],7);
  const readVisible=async(expanded:Set<string>)=>{
    const data=[...saved.values()],actual=new Set([...expanded].map(id=>saved.get(id)!.id));
    await repo.markRead(room.id,reader.id,visibleCommentIds(data,actual));
    return branchCommentCounts(buildCommentForest(data,"old"),new Set(await repo.unreadCommentIds(room.id,reader.id)));
  };
  assert.equal((await readVisible(new Set())).get(saved.get("root")!.id)?.unread,6);
  assert.equal((await readVisible(new Set(["root"]))).get(saved.get("root")!.id)?.unread,4);
  assert.equal((await readVisible(new Set(["root","a"]))).get(saved.get("root")!.id)?.unread,2);
  await repo.joinIdea(room.id,reader.id); // Re-entry must not change read state.
  assert.equal((await repo.unreadCounts(reader.id))[room.id],2);
  // Posting from another account must not consume its room history either.
  await repo.createComment(room.id,{id:"implicit-new-reader",name:"Implicit",initial:"I"},{text:"A first reply",parentId:saved.get("root")!.id});
  assert.equal((await repo.unreadCounts("implicit-new-reader"))[room.id],7);
}
test("brand-new member sees existing collapsed replies unread and consumes one level at a time (memory)",async()=>{
  await newMemberHistoryContract(new StateIdeaRepository(new MemoryStore()));
});
test("brand-new member and implicit join preserve unread history across PostgreSQL joins",async()=>{
  const db=await embeddedPool();try{await newMemberHistoryContract(new PostgresIdeaRepository(db.pool));}finally{await db.close();}
});

test("join repair preserves legacy markers and exact receipts while restoring affected new members",async()=>{
  const db=await embeddedPool();try{
    const repo=new PostgresIdeaRepository(db.pool),old={id:"legacy-reader",name:"Legacy",initial:"L"};
    const room=await repo.createIdea(writer,{title:"Repair history",description:"Migration repair",category:"Khác",tags:[]});
    const root=await repo.createComment(room.id,writer,{text:"Root before joins"});
    const leaf=await repo.createComment(room.id,writer,{text:"Unread leaf",parentId:root.id});
    await repo.joinIdea(room.id,reader.id);await repo.joinIdea(room.id,old.id);
    await repo.markRead(room.id,reader.id,root.id);
    await db.pool.query("UPDATE public.memberships SET last_read_sequence=(SELECT max(read_sequence) FROM public.comments WHERE idea_id=$1),joined_at=CASE WHEN user_id=$2 THEN '2026-10-19'::timestamptz ELSE '2026-10-20 04:26:33+00'::timestamptz END WHERE idea_id=$1",[room.id,old.id]);
    assert.equal((await repo.unreadCounts(reader.id))[room.id],0);
    const repair=await readFile(new URL("../supabase/migrations/20261020043248_preserve_unread_history_on_join.sql",import.meta.url),"utf8");
    await db.pool.query(repair);
    assert.deepEqual(await repo.unreadCommentIds(room.id,reader.id),[leaf.id]);
    assert.equal((await repo.unreadCounts(old.id))[room.id],0);
    assert.equal((await db.pool.query("SELECT count(*)::int AS total FROM public.comment_read_receipts WHERE idea_id=$1 AND user_id=$2",[room.id,reader.id])).rows[0].total,1);
    await db.pool.query(repair); // Idempotent: receipts and older members survive re-run.
    assert.deepEqual(await repo.unreadCommentIds(room.id,reader.id),[leaf.id]);
  }finally{await db.close();}
});
