import assert from "node:assert/strict";
import {test} from "node:test";
import {createHash,randomUUID} from "node:crypto";
import {StateIdeaRepository,type IdeaRepository} from "../src/server/repository";
import {MemoryStore} from "../src/server/stores";
import {PostgresIdeaRepository} from "../src/server/postgres-repository";
import {embeddedPool} from "./helpers/postgres";
import type {StoredAttachment} from "../src/server/attachment-record";
import {CloudinaryDiscussionFiles,readDiscussionFile} from "../src/server/discussion-uploads";
import {sharedContent,sharedLinks} from "../src/lib/shared-content";
import {createCommentSchema} from "../src/lib/validation";
import {handleApi} from "../src/server/api";
import {AuthService,MemoryAuthStore} from "../src/server/auth";
import {SESSION_COOKIE} from "../src/server/session";

for(const mode of ["memory","postgres"] as const)test(`${mode}: attachment ownership/binding and pin changes preserve retries, privacy and unread counts`,async()=>{
  const db=mode==="postgres"?await embeddedPool():null;
  const repo:IdeaRepository=db?new PostgresIdeaRepository(db.pool):new StateIdeaRepository(new MemoryStore());
  const a={id:"share-a",name:"A",initial:"A"},b={id:"share-b",name:"B",initial:"B"};
  try{
    const room=await repo.createIdea(a,{title:"Shared files",description:"Test",category:"Khác",tags:[]});
    const other=await repo.createIdea(a,{title:"Other room",description:"Test",category:"Khác",tags:[]});
    await repo.joinIdea(room.id,b.id);
    const receipt:StoredAttachment={id:randomUUID(),ideaId:room.id,ownerId:a.id,name:"notes.txt",mime:"text/plain",size:10,kind:"file",assetId:"server-only-asset",url:`/api/ideas/${room.id}/attachments/test`,commentId:null,createdAt:new Date().toISOString()};
    await repo.saveAttachment(receipt);
    assert.equal((await repo.getAttachment(room.id,receipt.id,a.id)).assetId,receipt.assetId);
    await assert.rejects(repo.getAttachment(room.id,receipt.id,b.id),{code:"NOT_FOUND"});
    await assert.rejects(repo.createComment(room.id,b,{text:"Stolen",attachmentIds:[receipt.id]}),{code:"INVALID_ATTACHMENT"});
    await assert.rejects(repo.createComment(other.id,a,{text:"Wrong room",attachmentIds:[receipt.id]}),{code:"INVALID_ATTACHMENT"});
    const input={text:"",clientId:randomUUID(),attachmentIds:[receipt.id]};
    const first=await repo.createComment(room.id,a,input);
    assert.equal(first.attachments?.[0].name,"notes.txt");
    assert(!JSON.stringify(first).includes("server-only-asset"));
    assert.equal((await repo.createComment(room.id,a,input)).id,first.id);
    await assert.rejects(repo.createComment(room.id,a,{...input,clientId:randomUUID()}),{code:"INVALID_ATTACHMENT"});
    await assert.rejects(repo.createComment(room.id,a,{...input,attachmentIds:[]}),/./);
    assert.equal((await repo.getAttachment(room.id,receipt.id,b.id)).commentId,first.id);
    const before=await repo.getActivity(room.id),unread=await repo.unreadCounts(b.id);
    await assert.rejects(repo.pinComment(room.id,first.id,"outsider",true),{code:"NOT_JOINED"});
    await assert.rejects(repo.pinComment(other.id,first.id,a.id,true),{code:"NOT_FOUND"});
    await repo.pinComment(room.id,first.id,b.id,true);
    const after=await repo.getActivity(room.id);assert.notEqual(after.version,before.version);assert.equal(after.commentCount,before.commentCount);
    assert.deepEqual(await repo.unreadCounts(b.id),unread);
    assert((await repo.listComments(room.id)).items[0].pinnedAt);
    await repo.pinComment(room.id,first.id,b.id,true);assert.deepEqual(await repo.getActivity(room.id),after);
    await repo.pinComment(room.id,first.id,a.id,false);assert(!(await repo.listComments(room.id)).items[0].pinnedAt);
  }finally{await db?.close();}
});

function requestFile(name:string,contents:BlobPart,type="text/plain"){
  const form=new FormData();form.set("file",new Blob([contents],{type}),name);
  return new Request("https://ideahub.test/api/files",{method:"POST",body:form});
}
test("uploads validate bytes, type, size and multipart shape; signed private delivery never exposes credentials",async()=>{
  const file=await readDiscussionFile(requestFile("notes.txt","Meeting notes"));assert.equal(file.kind,"file");
  for(const [name,bytes,type] of [["script.svg","<svg/>","image/svg+xml"],["fake.png","not a PNG","image/png"],["bad.txt",new Uint8Array([0,255]),"text/plain"]] as const)await assert.rejects(readDiscussionFile(requestFile(name,bytes,type)),{code:"FILE_TYPE"});
  await assert.rejects(readDiscussionFile(requestFile("large.txt","x".repeat(3*1024*1024+1))),{code:"FILE_SIZE"});
  let uploadCalls=0,downloadCalls=0;
  const provider=new CloudinaryDiscussionFiles({cloud:"unit-test",key:"test-key",secret:"test-secret"},async(url,init)=>{
    if(String(url).endsWith("/raw/upload")){
      uploadCalls++;const body=init!.body as FormData;
      assert.equal(body.get("type"),"authenticated");assert.equal(body.get("overwrite"),"false");
      const keys=["overwrite","public_id","timestamp","type"];
      assert.equal(body.get("signature"),createHash("sha256").update(keys.map(k=>`${k}=${body.get(k)}`).join('&')+"test-secret").digest("hex"));
      return Response.json({public_id:body.get("public_id"),asset_id:"test-asset",resource_type:"raw",type:"authenticated"});
    }
    downloadCalls++;const u=new URL(String(url));assert(u.pathname.endsWith("/asset/download"));assert.equal(u.searchParams.get("asset_id"),"test-asset");assert(Number(u.searchParams.get("expires_at"))>Date.now()/1000);assert.equal(init?.redirect,"error");
    return new Response("Meeting notes");
  });
  assert.equal(await provider.upload(file),"test-asset");
  const response=await provider.download({id:"x",ideaId:"r",ownerId:"u",assetId:"test-asset",name:"notes.txt",mime:"text/plain",size:13,kind:"file",url:"/api/file",commentId:"c",createdAt:new Date().toISOString()},false);
  assert.equal(response.headers.get("content-type"),"text/plain");assert.match(response.headers.get("content-disposition")!,/^attachment/);assert.match(response.headers.get("cache-control")!,/no-store/);assert.equal(await response.text(),"Meeting notes");assert.equal(uploadCalls,1);assert.equal(downloadCalls,1);
  const broken=new CloudinaryDiscussionFiles({cloud:"unit-test",key:"test-key",secret:"test-secret"},async()=>{throw Error("secret-provider-details");});
  await assert.rejects(broken.upload(file),e=>e instanceof Error&&!e.message.includes("secret-provider"));
});

test("sharing APIs require session/membership and same-origin; clients cannot assign attachment metadata",async()=>{
  const auth=new AuthService(new MemoryAuthStore()),repo=new StateIdeaRepository(new MemoryStore());
  const {user}=await auth.google({subject:"sharing-api",name:"Reader",avatarUrl:null});const {token}=await auth.issueSession(user,null);
  const room=await repo.createIdea(user,{title:"API sharing",description:"Test",category:"Khác",tags:[]});
  const comment=await repo.createComment(room.id,user,{text:"Pin this"});
  const call=(tail:string,body:unknown,session=token,origin="https://ideahub.test")=>handleApi(new Request(`https://ideahub.test/api/ideas/${room.id}/${tail}`,{method:"POST",headers:{"content-type":"application/json",origin,cookie:`${SESSION_COOKIE}=${session}`},body:JSON.stringify(body)}),["ideas",room.id,...tail.split('/')],repo,auth);
  assert.equal((await call(`comments/${comment.id}/pin`,{pinned:true},"")).status,401);
  assert.equal((await call(`comments/${comment.id}/pin`,{pinned:true},token,"https://evil.test")).status,403);
  assert.equal((await call(`comments/${comment.id}/pin`,{pinned:true,userId:"other"})).status,422);
  assert.equal((await call(`comments/${comment.id}/pin`,{pinned:true})).status,200);
  assert.equal((await call("comments",{text:"File",attachments:[{url:"https://evil.test"}]})).status,422);
  const anon=await handleApi(new Request(`https://ideahub.test/api/ideas/${room.id}/attachments/any`),["ideas",room.id,"attachments","any"],repo,auth);assert.equal(anon.status,401);
});

test("shared links use only HTTP(S), exclude credentials, preserve deduped source messages, and empty posts require files",()=>{
  assert.deepEqual(sharedLinks("https://example.com/a, https://example.com/a javascript:alert(1) https://user:pass@example.com/x"),["https://example.com/a"]);
  assert(!createCommentSchema.safeParse({text:"  "}).success);
  assert(createCommentSchema.safeParse({text:"",attachmentIds:[randomUUID()]}).success);
  assert(!createCommentSchema.safeParse({text:"",attachmentIds:["fake"]}).success);
  const c={id:"c",ideaId:"r",parentId:null,author:{id:"a",name:"A",initial:"A"},text:"https://example.com",createdAt:new Date().toISOString(),pinnedAt:new Date().toISOString()};
  const content=sharedContent([c]);assert.equal(content.links[0].comment.id,"c");assert.equal(content.pins[0].id,"c");
});
