import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { getDatabasePool } from "./database";
import { PostgresIdeaRepository } from "./postgres-repository";
import { RedisCache, redisCommands } from "./redis-cache";

// Temporary production diagnostic. Returns timings only; removed after measurement.
let pending: Promise<unknown> | undefined;
export function benchmarkCache() {
  return pending ??= measure();
}
async function measure() {
  const redis = redisCommands();
  if (!redis) return { available: false };
  const pool = getDatabasePool(), repo = new PostgresIdeaRepository(pool);
  const id = (await pool.query<{id:string}>("SELECT id FROM public.ideas ORDER BY created_at LIMIT 1")).rows[0]?.id;
  if (!id) return { available: false };
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
          async()=>{const t=performance.now();await cache.remember(key,60,load);miss.push(performance.now()-t);const h=performance.now();await cache.remember(key,60,load);hit.push(performance.now()-h);},
        ];
        for(const task of i%2?tasks.reverse():tasks) await task();
      }
      results[kind] = { direct:summaries(direct),redisHit:summaries(hit),redisMiss:summaries(miss) };
    }
    return { available:true, environment:"Vercel production, warm connection",results };
  } finally {
    // Bounded synthetic cache keys expire in 60s even when cleanup fails.
    const {createHash}=await import("node:crypto");
    try { await redis.command(["DEL",...keys.map(k=>`${prefix}:0:${createHash('sha256').update(k).digest('hex')}`)]); } catch {}
  }
}
