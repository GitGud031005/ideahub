import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { AuthService, digest } from "../src/server/auth";
import { PostgresAuthStore } from "../src/server/postgres-auth-store";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { handleApi } from "../src/server/api";
import { SESSION_COOKIE } from "../src/server/session";
import { embeddedPool } from "./helpers/postgres";

test("profile changes only the session owner's display name and keeps Google edits across sign-ins",async()=>{
  const db=await embeddedPool(),store=new PostgresAuthStore(db.pool),auth=new AuthService(store),repo=new PostgresIdeaRepository(db.pool);
  const call=(token:string,body:unknown,origin="https://ideahub.test")=>handleApi(new Request("https://ideahub.test/api/auth/profile",{method:"POST",headers:{origin,"content-type":"application/json",cookie:`${SESSION_COOKIE}=${token}`},body:JSON.stringify(body)}),["auth","profile"],repo,auth);
  try{
    assert.equal((await call("",{name:"Tên mới"})).status,401);
    const first=await auth.register({username:"profile_one",fullName:"Nguyễn An",password:"Test2026"},null);
    const other=await auth.register({username:"profile_other",fullName:"Người khác",password:"Test2026"},null);
    const idea=await repo.createIdea(first.user,{title:"Ý tưởng",description:"Mô tả thử",category:"Công nghệ",tags:[]});
    assert.equal((await call(first.token,{name:"Tấn An"},"https://attacker.test")).status,403);
    assert.equal((await call(first.token,{name:"a"})).status,422);
    assert.equal((await call(first.token,{name:"Tên mới",userId:other.user.id,username:"changed"})).status,422);
    const response=await call(first.token,{name:"  Trần   Minh An  "});assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.user.name,"Trần Minh An");assert.equal(data.user.initial,"TA");assert.equal(data.user.username,"profile_one");
    assert.equal((await auth.user(other.token))!.name,"Người khác");
    assert.equal((await repo.getIdea(idea.id,first.user.id)).creator.name,"Trần Minh An");
    // A write can authenticate before the rename and reach the repository after it.
    const staleComment = await repo.createComment(idea.id, first.user, {text:"Request authenticated before profile edit"});
    assert.equal(staleComment.author.name,"Trần Minh An");
    const staleIdea = await repo.createIdea(first.user,{title:"Late request",description:"Stale account snapshot",category:"Công nghệ",tags:[]});
    assert.equal(staleIdea.creator.name,"Trần Minh An");
    assert.equal((await auth.user(first.token))!.name,"Trần Minh An");
    assert.equal((await auth.user(first.token))!.initial,"TA");
    const google=await auth.google({subject:"profile-google",name:"Tên từ Google",avatarUrl:null});
    const session=await auth.issueSession(google.user,null);
    assert.equal((await call(session.token,{name:"Tên tự chọn"})).status,200);
    const again=await auth.google({subject:"profile-google",name:"Google changed name",avatarUrl:null});
    assert.equal(again.user.name,"Tên tự chọn");assert.equal(again.user.initial,"TC");
  }finally{await db.close();}
});

test("password change verifies the old password, rejects Google accounts, and revokes old sessions atomically",async()=>{
  const db=await embeddedPool(),store=new PostgresAuthStore(db.pool),auth=new AuthService(store);
  const call=(token:string,body:unknown,origin="https://ideahub.test")=>handleApi(new Request("https://ideahub.test/api/auth/password",{method:"POST",headers:{origin,"content-type":"application/json",cookie:`${SESSION_COOKIE}=${token}`},body:JSON.stringify(body)}),["auth","password"],undefined,auth);
  try{
    const input={currentPassword:"Test2026",newPassword:"Newpass8"};
    assert.equal((await call("",input)).status,401);
    const login=await auth.register({username:"password_one",fullName:"Minh An",password:input.currentPassword},null);
    const second=await auth.login({username:login.user.username,password:input.currentPassword},null);
    const other=await auth.register({username:"password_other",fullName:"Khác",password:"Test2026"},null);
    const oldHash=(await store.findAccount(login.user.username))!.passwordHash!;
    assert.equal((await call(login.token,input,"https://attacker.test")).status,403);
    assert.equal((await call(login.token,{...input,newPassword:"short"})).status,422);
    const wrong=await call(login.token,{...input,currentPassword:"incorrect"});assert.equal(wrong.status,422);assert.equal((await wrong.json()).error.code,"CURRENT_PASSWORD");
    assert(await auth.user(login.token));assert(await auth.user(second.token));
    const response=await call(login.token,input);assert.equal(response.status,200);
    const body=await response.json();assert(!JSON.stringify(body).includes(input.newPassword));assert(!JSON.stringify(body).includes("passwordHash"));
    const next=response.headers.get("set-cookie")!.split(";")[0].slice(SESSION_COOKIE.length+1);
    assert.notEqual(next,login.token);assert.equal(await auth.user(login.token),null);assert.equal(await auth.user(second.token),null);assert(await auth.user(next));assert(await auth.user(other.token));
    await assert.rejects(auth.login({username:login.user.username,password:input.currentPassword},null),{code:"INVALID_CREDENTIALS"});
    assert(await auth.login({username:login.user.username,password:input.newPassword},null));
    await assert.rejects(store.saveSession(digest(randomBytes(32).toString("base64url")),login.user.id,new Date(Date.now()+60000),oldHash),{code:"INVALID_CREDENTIALS"});
    assert.equal(await store.changePassword(login.user.id,oldHash,"stale-change"),false);
    const google=await auth.google({subject:"password-google",name:"Google User",avatarUrl:null}),session=await auth.issueSession(google.user,null);
    const blocked=await call(session.token,input);assert.equal(blocked.status,403);assert.equal((await blocked.json()).error.code,"PASSWORD_UNAVAILABLE");
    assert.equal((await store.findAccount(google.user.username))!.passwordHash,null);assert(await auth.user(session.token));
  }finally{await db.close();}
});
