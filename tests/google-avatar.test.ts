import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { AuthService,digest } from "../src/server/auth";
import { PostgresAuthStore } from "../src/server/postgres-auth-store";
import { CloudinaryAvatars,imageMime,isGooglePicture,readAvatar } from "../src/server/cloudinary";
import { GoogleOAuthService,PostgresOAuthFlows,safeReturnTo } from "../src/server/google-oauth";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { handleApi } from "../src/server/api";
import { SESSION_COOKIE } from "../src/server/session";
import { embeddedPool } from "./helpers/postgres";
import { GeminiRecapGenerator,type RecapSource } from "../src/server/gemini-recap";
import { geminiModelOrder } from "../src/lib/gemini-models";

const photo="https://lh3.googleusercontent.com/a/test-photo",cloudPhoto="https://res.cloudinary.com/demo/image/upload/v1/ideahub/avatars/user.webp";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/3fkAAAAASUVORK5CYII=","base64");
test("Google OAuth binds state, nonce and PKCE, burns callbacks once and persists a stable subject",async()=>{
  const db=await embeddedPool(),auth=new AuthService(new PostgresAuthStore(db.pool));
  let nonce="",calls=0,expectedVerifier="";
  const transport:typeof fetch=async(url,init)=>{calls++;assert.equal(url,"https://oauth2.googleapis.com/token");const body=init!.body as URLSearchParams;assert.equal(body.get("code_verifier"),expectedVerifier);assert.equal(body.get("redirect_uri"),"https://ideahub.test/api/auth/google/callback");return Response.json({id_token:"verified-on-server"});};
  const google=new GoogleOAuthService(new PostgresOAuthFlows(db.pool),auth,new CloudinaryAvatars({}),{clientId:"test-client",clientSecret:"test-secret",origin:"https://ideahub.test"},transport,async(token,audience)=>{assert.equal(token,"verified-on-server");assert.equal(audience,"test-client");return {sub:"google-subject-one",name:"Nguyễn An",nonce,picture:photo,email:"same@example.test",email_verified:true};});
  const request=(state:string,cookie=state)=>new Request(`https://ideahub.test/api/auth/google/callback?code=one-use-code&state=${state}`,{headers:{cookie:`ideahub_google_flow=${cookie}`}});
  try{
    const start=await google.start("/ideas/demo-ai-recap"),url=new URL(start.url);nonce=url.searchParams.get("nonce")!;
    const flow=(await db.pool.query<{verifier:string}>("SELECT verifier FROM ideahub_private.oauth_states WHERE state_hash=$1",[digest(start.state)])).rows[0];expectedVerifier=flow.verifier;
    assert.equal(url.searchParams.get("code_challenge"),createHash("sha256").update(expectedVerifier).digest("base64url"));
    await assert.rejects(google.complete(request(start.state,"wrong-cookie"),null),{code:"GOOGLE_STATE"});assert.equal(calls,0);
    const result=await google.complete(request(start.state),null);assert.equal(result.user.name,"Nguyễn An");assert.equal(result.user.avatarUrl,photo);assert.equal(result.user.provider,"google");assert.equal(result.returnTo,"/ideas/demo-ai-recap");
    assert.equal((await auth.user(result.token))?.id,result.user.id);
    await assert.rejects(google.complete(request(start.state),null),{code:"GOOGLE_STATE"});assert.equal(calls,1);
    await auth.setAvatar(result.user.id,cloudPhoto);
    const again=await google.start("//attacker.test"),againUrl=new URL(again.url);nonce=againUrl.searchParams.get("nonce")!;expectedVerifier=(await db.pool.query<{verifier:string}>("SELECT verifier FROM ideahub_private.oauth_states WHERE state_hash=$1",[digest(again.state)])).rows[0].verifier;
    const second=await google.complete(request(again.state),result.token);assert.equal(second.user.id,result.user.id);assert.equal(second.user.avatarUrl,cloudPhoto);assert.equal(second.returnTo,"/");assert.equal(await auth.user(result.token),null);
    const count=(await db.pool.query<{count:string}>("SELECT count(*) FROM ideahub_private.accounts")).rows[0].count;assert.equal(Number(count),1);
    assert.equal((await auth.login({username:result.user.username,password:"some-password"},null).catch(e=>e)).code,"INVALID_CREDENTIALS");
  }finally{await db.close();}
});
test("Google rejects nonce mismatches and does not trust a supplied avatar host",async()=>{
  const db=await embeddedPool(),auth=new AuthService(new PostgresAuthStore(db.pool));
  const flows=new PostgresOAuthFlows(db.pool),google=new GoogleOAuthService(flows,auth,new CloudinaryAvatars({}),{clientId:"test-client",clientSecret:"test-secret",origin:"https://ideahub.test"},async()=>Response.json({id_token:"bad-nonce"}),async()=>({sub:"x",nonce:"wrong",name:"An"}));
  try{const start=await google.start("/");await assert.rejects(google.complete(new Request(`https://ideahub.test/api/auth/google/callback?code=c&state=${start.state}`,{headers:{cookie:`ideahub_google_flow=${start.state}`}}),null),{code:"GOOGLE_VERIFY"});assert.equal(Number((await db.pool.query<{count:string}>("SELECT count(*) FROM ideahub_private.accounts")).rows[0].count),0);
    for(const bad of ["http://lh3.googleusercontent.com/a","https://lh3.googleusercontent.com.attacker.test/a","https://169.254.169.254/a","https://user@lh3.googleusercontent.com/a"])assert.equal(isGooglePicture(bad),false);
    assert.equal(safeReturnTo("/\\evil.test"),"/");assert.equal(safeReturnTo("/?new=1"),"/?new=1");
  }finally{await db.close();}
});
test("Cloudinary avatar uploads use authenticated users, signed fixed transformations and validated image bytes",async()=>{
  const db=await embeddedPool(),auth=new AuthService(new PostgresAuthStore(db.pool));let uploads=0;
  const cloud=new CloudinaryAvatars({cloud:"demo",key:"test-api-key",secret:"test-api-secret"},async(url,init)=>{
    uploads++;assert.equal(url,"https://api.cloudinary.com/v1_1/demo/image/upload");const body=init!.body as FormData;
    const fields=[...body.entries()].filter(([key])=>!["file","api_key","signature"].includes(key)).map(([k,v])=>`${k}=${v}`).sort().join("&");assert.equal(body.get("signature"),createHash("sha256").update(fields+"test-api-secret").digest("hex"));assert.equal(body.get("transformation"),"c_fill,g_auto,h_512,w_512/f_webp,q_auto");assert(!body.has("api_secret"));
    return Response.json({secure_url:cloudPhoto,public_id:body.get("public_id")});
  });
  const req=(body:FormData,token="",origin="https://ideahub.test")=>new Request("https://ideahub.test/api/auth/avatar",{method:"POST",body,headers:{origin,...(token?{cookie:`${SESSION_COOKIE}=${token}`}:{})}});
  const form=()=>{const body=new FormData();body.set("avatar",new Blob([png],{type:"image/png"}),"avatar.png");return body;};
  try{
    assert.equal(imageMime(png),"image/png");assert.throws(()=>imageMime(Buffer.from("<svg></svg>")),{code:"AVATAR_TYPE"});
    const anonymous=await handleApi(req(form()),["auth","avatar"],new PostgresIdeaRepository(db.pool),auth,undefined,cloud);assert.equal(anonymous.status,401);assert.equal(uploads,0);
    const login=await auth.register({username:"photo_user",fullName:"Người dùng",password:"Test2026"},null);
    assert.equal((await handleApi(req(form(),login.token,"https://attacker.test"),["auth","avatar"],undefined,auth,undefined,cloud)).status,403);
    const response=await handleApi(req(form(),login.token),["auth","avatar"],undefined,auth,undefined,cloud);assert.equal(response.status,200);assert.equal((await response.json()).user.avatarUrl,cloudPhoto);assert.equal((await auth.user(login.token))?.avatarUrl,cloudPhoto);assert.equal(uploads,1);
    const invalid=new FormData();invalid.set("avatar",new Blob(["<svg></svg>"],{type:"image/png"}),"fake.png");await assert.rejects(readAvatar(req(invalid)),{code:"AVATAR_TYPE"});
    const huge=new FormData();huge.set("avatar",new Blob([new Uint8Array(2*1024*1024+1)],{type:"image/png"}),"large.png");await assert.rejects(readAvatar(req(huge)),{code:"AVATAR_SIZE"});
  }finally{await db.close();}
});
test("Gemini uses only the supplied catalog and falls back on quota/model errors, never on invalid credentials",async()=>{
  const source:RecapSource={title:"Demo",description:"Test",kind:"daily",start:"2026-10-16",end:"2026-10-17",messages:[{id:"c1",parentId:null,author:"An",text:"Ý tưởng",createdAt:"2026-10-16T02:00:00Z",contextOnly:false}]};
  const content={keyIdeas:[{text:"Ý tưởng",commentIds:["c1"]}],decisions:[],nextSteps:[],openQuestions:[]};
  const calls:string[]=[];let status=429;
  const transport:typeof fetch=async(url)=>{
    if(String(url).includes("?pageSize="))return Response.json({models:["gemini-3.8-flash","gemini-3.7-flash"].map(id=>({name:`models/${id}`,supportedGenerationMethods:["generateContent"]}))});
    calls.push(String(url));return String(url).includes("3.8-flash")?Response.json({error:{message:"private provider details"}},{status}):Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(content)}]}}]});
  };
  const generator=new GeminiRecapGenerator({key:"fallback-unit-key"},transport);assert.equal((await generator.generate(source)).model,"gemini-3.7-flash");assert.equal(calls.length,2);
  calls.length=0;status=401;await assert.rejects(generator.generate(source),{code:"AI_AUTH"});assert.equal(calls.length,1);
  assert.throws(()=>geminiModelOrder("gemini-4-argon"));assert.equal(geminiModelOrder()[0],"gemini-3.8-flash");
});
