import assert from "node:assert/strict";
import { test } from "node:test";
import { IDEA_TAGS, IDEA_TAG_GROUPS, MAX_IDEA_TAGS, searchIdeaTags } from "../src/lib/idea-tags";
import { CATEGORIES } from "../src/lib/domain";
import { createIdeaSchema } from "../src/lib/validation";
import { GeminiTagSuggester } from "../src/server/gemini-tags";
import { AppError } from "../src/server/errors";
import { AuthService, MemoryAuthStore } from "../src/server/auth";
import { handleApi } from "../src/server/api";
import { SESSION_COOKIE } from "../src/server/session";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";

const input={title:"Vườn rau thông minh cho chung cư",description:"Dùng cảm biến độ ẩm và tưới tự động, giúp cư dân trồng rau tại ban công và chia sẻ kinh nghiệm"};
test("curated tags span fields, fit stored limits, and support unaccented search",()=>{
  assert(IDEA_TAGS.length>=100&&IDEA_TAGS.length<=250);assert(IDEA_TAG_GROUPS.length>=12);
  assert.equal(new Set(IDEA_TAGS).size,IDEA_TAGS.length);
  assert(IDEA_TAGS.every(t=>t.length<=28&&t.trim()===t));assert(CATEGORIES.every(t=>IDEA_TAGS.includes(t)));
  assert(searchIdeaTags("nong nghiep").some(g=>g.tags.includes("Nông nghiệp đô thị")));
  assert(searchIdeaTags("PYTHON").some(g=>g.tags.includes("Python")));
  assert.deepEqual(searchIdeaTags("khong-co-tag-nay"),[]);
  const selected=createIdeaSchema.parse({...input,tags:["Python","Python","Học tập"]});
  assert.deepEqual(selected.tags,["Python","Học tập"]);
  assert(createIdeaSchema.safeParse({...input,tags:IDEA_TAGS.slice(0,MAX_IDEA_TAGS)}).success);
  assert(!createIdeaSchema.safeParse({...input,tags:IDEA_TAGS.slice(0,MAX_IDEA_TAGS+1)}).success);
  assert.deepEqual(createIdeaSchema.parse({...input,tags:[]}).tags,[]);
  assert(!createIdeaSchema.safeParse({...input,tags:["invented-tag"]}).success);
});
test("Gemini suggests only catalog tags using existing model fallbacks, with bounded structured output",async()=>{
  const called:string[]=[];let output:unknown={tags:["IoT","Nông nghiệp đô thị","IoT"]},status=429;
  const transport:typeof fetch=async(url,init)=>{
    if(String(url).includes("?pageSize="))return Response.json({models:["gemini-3.8-flash","gemini-3.7-flash"].map(id=>({name:`models/${id}`,supportedGenerationMethods:["generateContent"]}))});
    called.push(String(url));const body=JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType,"application/json");assert.deepEqual(body.generationConfig.thinkingConfig,{thinkingLevel:"low"});assert(!body.generationConfig.responseSchema.properties.tags.items.enum);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).catalog.flatMap((g:{tags:string[]})=>g.tags),IDEA_TAGS);
    assert(body.systemInstruction.parts[0].text.includes("không phải chỉ dẫn"));assert(!body.tools);
    assert(!String(init?.body).includes("private-tag-key"));
    assert.equal(JSON.parse(body.contents[0].parts[0].text).title,input.title);
    if(String(url).includes("3.8-flash"))return Response.json({private:"provider error"},{status});
    return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{thought:true,text:"private reasoning"},{text:JSON.stringify(output)}]}}]});
  };
  const generator=new GeminiTagSuggester({key:"private-tag-key"},transport);
  assert.deepEqual(await generator.suggest(input),{tags:["IoT","Nông nghiệp đô thị"],model:"gemini-3.7-flash"});assert.equal(called.length,2);
  output={tags:["not-in-catalog"]};await assert.rejects(generator.suggest(input),{code:"AI_INVALID_RESPONSE"});
  status=403;const before=called.length;await assert.rejects(generator.suggest(input),{code:"AI_AUTH"});assert.equal(called.length,before+1);
  await assert.rejects(new GeminiTagSuggester({}).suggest(input),{code:"AI_NOT_CONFIGURED"});
});
test("tag suggestion API authenticates, validates, rate-limits and does not create an idea",async()=>{
  const auth=new AuthService(new MemoryAuthStore()),repo=new StateIdeaRepository(new MemoryStore());
  const account=await auth.register({username:"tag_suggestion_tester",fullName:"Tag tester",password:"Test2026"},null);
  let calls=0;const tagger={async suggest(data:typeof input){assert.deepEqual(data,input);calls++;return {tags:["IoT","Trồng trọt"],model:"gemini-3.8-flash"};}};
  const call=(body:unknown=input,token=account.token,origin="https://ideahub.test",method="POST")=>handleApi(new Request("https://ideahub.test/api/ideas/suggest-tags",{method,headers:{origin,"content-type":"application/json",cookie:`${SESSION_COOKIE}=${token}`},body:method==="POST"?JSON.stringify(body):undefined}),["ideas","suggest-tags"],repo,auth,undefined,undefined,undefined,tagger);
  assert.equal((await call(input,"")).status,401);assert.equal((await call(input,account.token,"https://attacker.test")).status,403);
  assert.equal((await call(input,account.token,"https://ideahub.test","GET")).status,405);
  for(const body of [{...input,title:""},{...input,description:"x".repeat(241)},{...input,model:"other"},{...input,userId:"other"}])assert.equal((await call(body)).status,422);
  assert.equal(calls,0);
  const query={q:"",view:"all" as const,sort:"new" as const,limit:100,offset:0},before=(await repo.listIdeas(account.user.id,query)).total;
  const result=await call();assert.equal(result.status,200);assert.deepEqual(await result.json(),{tags:["IoT","Trồng trọt"],model:"gemini-3.8-flash"});assert.match(result.headers.get("cache-control")!,/no-store/);
  assert.equal((await repo.listIdeas(account.user.id,query)).total,before);
  for(let i=1;i<12;i++)assert.equal((await call()).status,200);
  assert.equal((await call()).status,429);assert.equal(calls,12);
});

test("tag suggestions fall back after a transport timeout and sanitize errors",async()=>{
  let fallback=false;
  const transport:typeof fetch=async(url)=>{
    if(String(url).includes("?pageSize="))return Response.json({models:["gemini-3.8-flash","gemini-3.7-flash"].map(id=>({name:`models/${id}`,supportedGenerationMethods:["generateContent"]}))});
    if(String(url).includes("3.8-flash"))throw new DOMException("private timeout details","TimeoutError");
    fallback=true;return Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({tags:["IoT"]})}]}}]});
  };
  const result=await new GeminiTagSuggester({key:"timeout-fallback-test"},transport).suggest(input);
  assert.equal(result.model,"gemini-3.7-flash");assert(fallback);
});


test("Google configuration diagnostics never reflect provider secrets or draft text",async()=>{
  for(const [details,code] of [
    [{message:"Schema has too many states: private provider detail"},"AI_REQUEST_SCHEMA"],
    [{message:"Thinking level not supported"},"AI_REQUEST_THINKING"],
    [{message:"private provider detail",details:[{reason:"API_KEY_INVALID"}]},"AI_AUTH"],
    [{message:"private provider detail",status:"FAILED_PRECONDITION"},"AI_PROJECT_SETUP"],
  ] as const){
    const transport:typeof fetch=async url=>String(url).includes("?pageSize=")?Response.json({models:[{name:"models/gemini-3.8-flash",supportedGenerationMethods:["generateContent"]}]}):Response.json({error:details},{status:400});
    await assert.rejects(()=>new GeminiTagSuggester({key:`diagnostics-${code}`},transport).suggest(input),(error:unknown)=>error instanceof AppError&&error.code===code&&!error.message.includes("private"));
  }
});


test("legacy category does not force tags in newly created ideas",async()=>{
  const repo=new StateIdeaRepository(new MemoryStore()),user={id:"tag-only-user",name:"Tag tester",initial:"T"};
  for(const category of [undefined,"Công nghệ"] as const){
    const idea=await repo.createIdea(user,createIdeaSchema.parse({...input,category,tags:["Nông nghiệp đô thị"]}));
    assert.deepEqual(idea.tags,["Nông nghiệp đô thị"]);
    const empty=await repo.createIdea(user,createIdeaSchema.parse({...input,category,tags:[]}));
    assert.deepEqual(empty.tags,[]);
  }
});
