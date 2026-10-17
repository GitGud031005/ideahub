import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCommentForest } from "../src/lib/format";
import { avatarCrop } from "../src/lib/avatar-crop";
import { mergeComments, type PendingComment } from "../src/lib/comment-outbox";
import type { Comment } from "../src/lib/domain";

test("sort applies to roots, siblings and nested siblings while preserving parents",()=>{
  const items=[{id:"root",parentId:null,createdAt:"2026-10-01"},{id:"other",parentId:null,createdAt:"2026-10-02"},{id:"a",parentId:"root",createdAt:"2026-10-03"},{id:"b",parentId:"root",createdAt:"2026-10-04"},{id:"c",parentId:"a",createdAt:"2026-10-05"},{id:"d",parentId:"a",createdAt:"2026-10-06"}];
  const old=buildCommentForest(items,"old"),recent=buildCommentForest(items,"new");
  for(const parent of [null,"root","a"]){assert.deepEqual(recent.get(parent)?.map(c=>c.id),old.get(parent)?.map(c=>c.id).reverse());}
  assert.equal(recent.get("a")?.[0].id,"d");assert.equal(recent.get("root")?.[0].id,"b");assert.equal(items[0].id,"root");
});
test("outbox merges out-of-order acknowledgements without losing another pending message",()=>{
  const base:Comment={id:"one",ideaId:"idea",parentId:null,text:"First",author:{id:"me",name:"Me",initial:"M"},createdAt:"2026-10-17"};
  const first:PendingComment={...base,delivery:"sending"},second:PendingComment={...base,id:"two",text:"Second",delivery:"failed"};
  const result=mergeComments([{...base,id:"two",text:"Second"}],[first,second]);
  assert.equal(result.length,2);assert.equal(result.find(c=>c.id==="one")?.delivery,"sending");assert.equal(result.find(c=>c.id==="two")?.delivery,undefined);
  assert.equal(mergeComments([base],[first]).length,1);
});
test("avatar crop remains within portrait and landscape bounds at every pan limit",()=>{
  for(const [w,h] of [[1200,600],[600,1200],[800,800]])for(const zoom of [1,2,4])for(const x of [-2,-1,0,1,2])for(const y of [-2,-1,0,1,2]){
    const crop=avatarCrop(w,h,zoom,{x,y});assert(crop.x>=0&&crop.y>=0);assert(crop.x+crop.side<=w);assert(crop.y+crop.side<=h);assert.equal(crop.side,Math.min(w,h)/zoom);
  }
  assert.deepEqual(avatarCrop(1200,600,1,{x:0,y:0}),{x:300,y:0,side:600});
  assert.deepEqual(avatarCrop(1200,600,2,{x:1,y:-1}),{x:0,y:300,side:300});
  for(const args of [[0,1,1],[1,NaN,1],[1,1,0],[1,1,5]])assert.throws(()=>avatarCrop(args[0],args[1],args[2],{x:0,y:0}));
});
