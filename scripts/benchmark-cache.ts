import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { getDatabasePool } from "../src/server/database";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { RedisCache, redisCommands } from "../src/server/redis-cache";

// Run with server credentials supplied via environment; prints aggregate timings only.
async function measure() {
  const redis = redisCommands();
  if (!redis) throw new Error("Redis is not configured");
  const pool = getDatabasePool(), repo = new PostgresIdeaRepository(pool);
  const id = (await pool.query<{id:string}>("SELECT id FROM public.ideas ORDER BY created_at LIMIT 1")).rows[0]?.id;
  if (!id) throw new Error("No room is available for measurement");
  const prefix = `ideahub:benchmark:${randomUUID()}`;
  const cache = new RedisCache(redis, prefix);
  const results: Record<string, unknown> = {};
  const summaries = (values:number[]) => {
    const sorted = [...values].sort((a,b)=>a-b);
    return { samples:values.length, medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(1), minMs:+sorted[0].toFixed(1), maxMs:+sorted.at(-1)!.toFixed(1) };
  };
  const deadline = performance.now()+35000;
  const keys:string[]=[];
  try {
    for (const kind of ["activity", "comments"] as const) {
      const load:()=>Promise<unknown> = kind === "activity" ? () => repo.getActivity(id) : () => repo.listComments(id,undefined,100);
      await load(); // Warm DB connection; exclude initial TLS/connection overhead.
      const direct:number[]=[],hit:number[]=[],miss:number[]=[];
      for(let i=0;i<7&&(i===0||performance.now()<deadline);i++) {
        const key=`${kind}:${i}`; keys.push(key);
        // Alternate order to reduce systematic connection-warming bias.
        const tasks = [
          async()=>{const t=performance.now();await load();direct.push(performance.now()-t);},
          async()=>{
            let loads=0;
            const loader=()=>{loads++;return load();};
            const t=performance.now();await cache.remember(key,60,loader);miss.push(performance.now()-t);
            const h=performance.now();await cache.remember(key,60,loader);hit.push(performance.now()-h);
            if(loads!==1)throw new Error("Redis hit could not be verified");
          },
        ];
        for(const task of i%2?tasks.reverse():tasks) await task();
      }
      results[kind] = { direct:summaries(direct),redisHit:summaries(hit),redisMiss:summaries(miss) };
    }
    return { available:true, environment:process.env.VERCEL?"Vercel production, warm connection":"CLI runtime, warm connection",region:process.env.VERCEL_REGION??"local",results };
  } finally {
    // Bounded synthetic cache keys expire in 60s even when cleanup fails.
    const {createHash}=await import("node:crypto");
    try { await redis.command(["DEL",...keys.map(k=>`${prefix}:0:${createHash('sha256').update(k).digest('hex')}`)]); } catch {}
  }
}

async function main() {
  try {console.log(JSON.stringify(await measure(),null,2));}
  catch {console.error("Cache benchmark failed; check server-side database and Redis configuration");process.exitCode=1;}
  finally {try {await getDatabasePool().end();}catch {}}
}
void main();
