import { createHash } from "node:crypto";

export interface CacheCommands { command(args:(string|number)[]):Promise<unknown> }
/** Small REST adapter: no connection pool, secrets stay on the server, errors never block DB reads. */
export function redisCommands(env:Record<string,string|undefined>=process.env,transport:typeof fetch=fetch):CacheCommands|null {
  if(!env.UPSTASH_REDIS_REST_URL||!env.UPSTASH_REDIS_REST_TOKEN)return null;
  let url:URL;try{url=new URL(env.UPSTASH_REDIS_REST_URL);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)return null;}catch{return null;}
  return {async command(args){
    const response=await transport(url,{method:"POST",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json",Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`},body:JSON.stringify(args),signal:AbortSignal.timeout(1200)});
    if(!response.ok)throw new Error("Redis unavailable");
    const body=await response.json();if(!body||body.error)throw new Error("Redis unavailable");return body.result;
  }};
}

export class RedisCache {
  private unavailableUntil=0;
  private pending=new Map<string,Promise<unknown>>();
  constructor(private redis:CacheCommands|null=redisCommands(),private prefix="ideahub:cache:v1"){}
  private async command(args:(string|number)[]){
    if(!this.redis||Date.now()<this.unavailableUntil)throw new Error("Cache disabled");
    try{return await this.redis.command(args);}catch{this.unavailableUntil=Date.now()+30000;throw new Error("Cache unavailable");}
  }
  async invalidate(){if(this.redis)try{await this.command(["INCR",`${this.prefix}:revision`]);}catch{/* DB remains authoritative; short TTL bounds stale data. */}}
  async remember<T>(logicalKey:string,seconds:number,load:()=>Promise<T>):Promise<T>{
    if(!this.redis||Date.now()<this.unavailableUntil)return load();
    let key:string;
    try{
      const revision=await this.command(["GET",`${this.prefix}:revision`]);
      key=`${this.prefix}:${revision??0}:${createHash("sha256").update(logicalKey).digest("hex")}`;
      const value=await this.command(["GET",key]);
      if(typeof value==="string")try{return JSON.parse(value) as T;}catch{/* Invalid cache entries are misses. */}
    }catch{return load();}
    const existing=this.pending.get(key);if(existing)return existing as Promise<T>;
    const work=(async()=>{const result=await load();try{await this.command(["SET",key,JSON.stringify(result),"EX",seconds]);}catch{}return result;})();
    this.pending.set(key,work);try{return await work;}finally{this.pending.delete(key);}
  }
}
export const applicationCache=new RedisCache();
