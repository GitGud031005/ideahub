import assert from "node:assert/strict";
import { test } from "node:test";
import { RedisCache, redisCommands, redisReadCacheEnabled, type CacheCommands } from "../src/server/redis-cache";
import { CachedIdeaRepository } from "../src/server/cached-repository";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
function fake(){const values=new Map<string,string>();let commands=0;return {values,get calls(){return commands;},async command(args:(string|number)[]){commands++;const [op,key]=args as string[];if(op==="GET")return values.get(key)??null;if(op==="DEL"){for(const k of args.slice(1))values.delete(String(k));return args.length-1;}if(op==="INCR"){const next=Number(values.get(key)??0)+1;values.set(key,String(next));return next;}if(op==="SET"){assert.equal(args[3],"EX");assert(Number(args[4])>0);values.set(key,String(args[2]));return "OK";}throw Error("Unsupported command");}};}
test("read caching is opt-in and disabled reads/writes issue zero Redis commands",async()=>{
  assert.equal(redisReadCacheEnabled({}),false);
  assert.equal(redisReadCacheEnabled({IDEAHUB_REDIS_CACHE:"false"}),false);
  assert.equal(redisReadCacheEnabled({IDEAHUB_REDIS_CACHE:"true"}),true);
  const redis=fake(),cache=new RedisCache(redis,"opt-in-test",false);
  assert.equal(cache.configured,true);assert.equal(cache.enabled,false);
  let loads=0;
  assert.equal(await cache.remember("room",5,async()=>++loads),1);
  assert.equal(await cache.remember("room",5,async()=>++loads),2);
  const repo=new CachedIdeaRepository(new StateIdeaRepository(new MemoryStore()),cache);
  const author={id:"disabled-cache-reader",name:"Reader",initial:"R"};
  const room=await repo.createIdea(author,{title:"Direct reads",description:"Test",category:"Khác",tags:[]});
  await repo.joinIdea(room.id,"other-reader");
  const comment=await repo.createComment(room.id,author,{text:"Fresh without Redis"});
  assert.equal((await repo.listComments(room.id)).items[0].id,comment.id);
  assert.equal((await repo.getActivity(room.id)).commentCount,1);
  assert.equal((await repo.unreadCounts("other-reader"))[room.id],1);
  await cache.invalidate();assert.equal(redis.calls,0);
  // Explicit provider diagnostics remain usable independently of read-cache policy.
  assert.equal((await cache.verify()).status,"ok");
  assert.equal(redis.values.size,0);assert.equal(cache.enabled,false);
});
test("cache health checks real read/write, hits and isolated invalidation, cleans keys and coalesces probes",async()=>{
  const redis=fake(),cache=new RedisCache(redis,"health-test");redis.values.set("health-test:revision","8");
  const results=await Promise.all([cache.verify(),cache.verify()]);
  assert.deepEqual(results[0],{configured:true,status:"ok",readWrite:true,hit:true,invalidation:true});assert.deepEqual(results[0],results[1]);
  assert.deepEqual([...redis.values.entries()],[["health-test:revision","8"]]);
  const calls=redis.calls;assert.deepEqual(await cache.verify(),results[0]);assert.equal(redis.calls,calls);
  assert.equal((await new RedisCache(null).verify()).status,"disabled");
  const unavailable=await new RedisCache({async command(){throw Error("secret-provider-error");}}).verify();
  assert.equal(unavailable.status,"unavailable");assert(!JSON.stringify(unavailable).includes("secret-provider-error"));
  const readonlyRevision=fake();
  const failedInvalidation=await new RedisCache({async command(args){if(args[0]==="INCR")throw Error("denied");return readonlyRevision.command(args);}}).verify();
  assert.equal(failedInvalidation.status,"unavailable");assert.equal(failedInvalidation.invalidation,false);
});
test("cache reuses reads, versions writes, and an old in-flight loader cannot poison a new version",async()=>{
  const redis=fake(),cache=new RedisCache(redis,"test");let loads=0;
  const load=async()=>({value:++loads});assert.deepEqual(await cache.remember("room",5,load),{value:1});assert.deepEqual(await cache.remember("room",5,load),{value:1});assert.equal(loads,1);
  await cache.invalidate();assert.deepEqual(await cache.remember("room",5,load),{value:2});
  let release!:(value:{value:number})=>void;const pending=cache.remember("race",5,()=>new Promise(resolve=>{release=resolve;}));await new Promise(resolve=>setTimeout(resolve,5));
  await cache.invalidate();assert.deepEqual(await cache.remember("race",5,async()=>({value:99})),{value:99});release({value:3});await pending;
  assert.deepEqual(await cache.remember("race",5,load),{value:99});
});
test("Redis errors fail open and back off; database errors still propagate",async()=>{
  let calls=0,loads=0;const broken:CacheCommands={async command(){calls++;throw Error("Unavailable secret URL must not escape");}};
  const cache=new RedisCache(broken);assert.equal(await cache.remember("a",2,async()=>++loads),1);assert.equal(await cache.remember("a",2,async()=>++loads),2);assert.equal(calls,1);
  await cache.invalidate();await assert.rejects(cache.remember("b",2,async()=>{throw Error("DB failure");}),/DB failure/);
  assert.equal(await new RedisCache(null).remember("off",2,async()=>42),42);
});
test("repository cache invalidates committed writes and never shares a personal unread marker",async()=>{
  const cache=new RedisCache(fake()),repo=new CachedIdeaRepository(new StateIdeaRepository(new MemoryStore()),cache);
  const a={id:"cache-a",name:"A",initial:"A"},b={id:"cache-b",name:"B",initial:"B"};
  const idea=await repo.createIdea(a,{title:"Cached room",description:"Test",category:"Khác",tags:[]});await repo.joinIdea(idea.id,b.id);
  assert.equal((await repo.getActivity(idea.id)).commentCount,0);assert.equal((await repo.listComments(idea.id)).items.length,0);
  const comment=await repo.createComment(idea.id,a,{text:"Invalidate"});
  assert.equal((await repo.getActivity(idea.id)).commentCount,1);assert.equal((await repo.listComments(idea.id)).items.length,1);
  assert.equal((await repo.unreadCounts(a.id))[idea.id],0);assert.equal((await repo.unreadCounts(b.id))[idea.id],1);
  await repo.markRead(idea.id,b.id,comment.id);assert.equal((await repo.unreadCounts(b.id))[idea.id],0);
});
test("REST adapter uses server-side HTTPS bearer auth, expiration commands, no redirects, and sanitized failures",async()=>{
  const env={UPSTASH_REDIS_REST_URL:"https://cache.upstash.io",UPSTASH_REDIS_REST_TOKEN:"test-only-token"};
  const redis=redisCommands(env,async(_url,init)=>{assert.equal(init?.redirect,"error");assert.equal(init?.cache,"no-store");assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer test-only-token");assert.deepEqual(JSON.parse(String(init?.body)),["GET","key"]);return Response.json({result:"cached"});});
  assert.equal(await redis!.command(["GET","key"]),"cached");assert.equal(redisCommands({}),null);assert.equal(redisCommands({...env,UPSTASH_REDIS_REST_URL:"http://unsafe.test"}),null);
  await assert.rejects(redisCommands(env,async()=>Response.json({error:"contains-provider-details"}))!.command(["GET","key"]),e=>e instanceof Error&&e.message==="Redis unavailable");
});
