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

  // Authentication runs before room lookup: no production account or writes are needed.
  // Old builds return 404 here, so this also verifies that the SSE route was shipped.
  const live = await request("/api/ideas/__deployment_probe__/comments/stream");
  assert.equal(live.status, 401, "Live comments endpoint must exist and reject anonymous access");
  assert.match(live.headers.get("content-type") ?? "", /application\/json/);
  assert.equal((await live.json()).error?.code, "AUTH_REQUIRED");
}

for (let attempt = 1; ; attempt++) {
  try {
    await verify();
    console.log(`Deployment verified: ${base.origin} (homepage, PostgreSQL and live endpoint)`);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.warn(`Deployment check ${attempt}/6 failed: ${error.message}; retrying`);
    await delay(3000);
  }
}
