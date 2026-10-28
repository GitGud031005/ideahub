import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const target = process.env.DEPLOYMENT_URL;
assert(target, "Set DEPLOYMENT_URL to the deployment to verify");
const base = new URL(target);
assert(base.protocol === "https:" || ["localhost", "127.0.0.1"].includes(base.hostname), "Deployment must use HTTPS");
assert(!base.username && !base.password, "Do not include credentials in DEPLOYMENT_URL");

async function verify() {
  const request = path => fetch(new URL(path, base), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const health = await request("/api/health");
  assert.equal(health.status, 200, "Database health endpoint must return 200");
  assert.match(health.headers.get("content-type") ?? "", /application\/json/, "Health endpoint must return JSON, not a hosting login page; use the public production domain");
  const data = await health.json();
  assert.equal(data.status, "ok");
  assert.equal(data.storage, "postgres", "Production must use PostgreSQL");
  assert.equal(data.persistent, true);

  const page = await request("/");
  assert.equal(page.status, 200, "Homepage must return 200");
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  await page.body?.cancel();

  // Exercise the dashboard SQL on the actual production database without writes.
  const ideas = await request("/api/ideas?limit=1");
  assert.equal(ideas.status, 200, "Idea listing must return 200");
  assert.match(ideas.headers.get("content-type") ?? "", /application\/json/);
  const first = await ideas.json();
  assert(Array.isArray(first.items) && first.items.length <= 1);
  assert(Number.isInteger(first.total) && first.total >= first.items.length);
  assert(first.nextCursor === null || typeof first.nextCursor === "string", "Dashboard must ship the cursor pagination contract");
  if (first.nextCursor) {
    const next = await request(`/api/ideas?${new URLSearchParams({ limit:"1", cursor:first.nextCursor })}`);
    assert.equal(next.status, 200, "Cursor continuation must work on PostgreSQL");
    const second = await next.json();
    assert(Array.isArray(second.items) && second.items.length === 1);
    assert.notEqual(second.items[0].id, first.items[0].id, "Consecutive pages must not repeat an idea");
  }

  // Authentication runs before room lookup: no production account or writes are needed.
  // Old builds return 404 here, so this also verifies that the SSE route was shipped.
  const live = await request("/api/ideas/__deployment_probe__/comments/stream");
  assert.equal(live.status, 401, "Live comments endpoint must exist and reject anonymous access");
  assert.match(live.headers.get("content-type") ?? "", /application\/json/);
  assert.equal((await live.json()).error?.code, "AUTH_REQUIRED");

  for(const path of ["/api/notifications/stream","/api/ideas/__deployment_probe__/comments/__message_probe__/context"]){
    const response=await request(path);assert.equal(response.status,401,`${path} must reject anonymous access`);assert.equal((await response.json()).error?.code,"AUTH_REQUIRED");
  }
  const worker=await request("/sw.js");assert.equal(worker.status,200);
  const source=await worker.text();assert(source.includes('type:"OPEN_COMMENT"'),"Worker must reuse ready app navigation");assert(source.includes('type:"NOTIFICATIONS_CHANGED"'),"Push delivery must refresh the inbox");
  for(const path of ["/__qa_mobile.html","/__qa_bundle.js"]){const response=await request(path);assert.equal(response.status,404,"QA assets must not be served in production");await response.body?.cancel();}

}

for (let attempt = 1; ; attempt++) {
  try {
    await verify();
    console.log(`Deployment verified: ${base.origin} (homepage, PostgreSQL, cursors, authenticated chat/inbox routes, push navigation and QA isolation)`);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.warn(`Deployment check ${attempt}/6 failed: ${error.message}; retrying`);
    await delay(3000);
  }
}
