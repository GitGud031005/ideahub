import assert from "node:assert/strict";
import { test } from "node:test";
import { handleApi } from "../src/server/api";
import { createSessionToken, verifySessionToken, SESSION_COOKIE } from "../src/server/session";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { rateLimit } from "../src/server/http";

process.env.SESSION_SECRET = "test-secret-at-least-thirty-two-characters-long";
process.env.IDEAHUB_STORAGE = "memory";
const base = "https://ideahub.test";
function request(path: string, init: RequestInit = {}, cookie = createSessionToken()) {
  return new Request(base + "/api/" + path, { ...init, headers: { cookie: `${SESSION_COOKIE}=${cookie}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
}
const makeRepo = () => new StateIdeaRepository(new MemoryStore());
test("session bootstrap uses signed HttpOnly cookies and verifies tampering and expiry", async () => {
  const response = await handleApi(new Request(base + "/api/session"), ["session"]);
  assert.equal(response.status, 200); assert.match(response.headers.get("set-cookie")!, /HttpOnly/); assert.match(response.headers.get("set-cookie")!, /SameSite=Lax/);
  const token = createSessionToken(); assert(verifySessionToken(token)); assert.equal(verifySessionToken(token + "forged"), null);
  const past = Date.now() - 31 * 86400000; assert.equal(verifySessionToken(createSessionToken(undefined, past)), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("API create/join/reply flow has authoritative server identities", async () => {
  const repository = makeRepo(), token = createSessionToken();
  const created = await handleApi(request("ideas", { method: "POST", body: JSON.stringify({ title: "Hello", description: "An idea", category: "Công nghệ", tags: ["Python"] }) }, token), ["ideas"], repository);
  assert.equal(created.status, 201); const idea = await created.json();
  assert.equal(idea.creator.id, verifySessionToken(token)!.id);
  const join = await handleApi(request(`ideas/${idea.id}/join`, { method: "POST" }, token), ["ideas", idea.id, "join"], repository);
  assert.equal((await join.json()).memberCount, 1);
  const reply = await handleApi(request(`ideas/${idea.id}/comments`, { method: "POST", body: JSON.stringify({ text: "A comment" }) }, token), ["ideas", idea.id, "comments"], repository);
  assert.equal(reply.status, 201); const comment = await reply.json(); assert.equal(comment.author.id, idea.creator.id);
  const invalid = await handleApi(request("ideas/1/comments", { method: "POST", body: JSON.stringify({ text: "Cross-room", parentId: comment.id }) }, token), ["ideas", "1", "comments"], repository); assert.equal(invalid.status, 400);
});
test("API rejects missing sessions, cross-origin writes, invalid JSON and oversized bodies", async () => {
  const repository = makeRepo();
  assert.equal((await handleApi(new Request(base + "/api/ideas"), ["ideas"], repository)).status, 401);
  assert.equal((await handleApi(request("ideas/1/join", { method: "POST", headers: { origin: "https://untrusted.test" } }), ["ideas", "1", "join"], repository)).status, 403);
  assert.equal((await handleApi(request("ideas", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } }), ["ideas"], repository)).status, 415);
  assert.equal((await handleApi(request("ideas", { method: "POST", body: "not json" }), ["ideas"], repository)).status, 400);
  assert.equal((await handleApi(request("ideas", { method: "POST", body: JSON.stringify({ huge: "x".repeat(17000) }) }), ["ideas"], repository)).status, 413);
  const invalid = await handleApi(request("ideas", { method: "POST", body: JSON.stringify({ title: "", description: "", category: "Khác" }) }), ["ideas"], repository);
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).error.code, "VALIDATION");
});
test("missing resources and unsupported methods return expected status codes", async () => {
  const repository = makeRepo();
  assert.equal((await handleApi(request("ideas/missing"), ["ideas", "missing"], repository)).status, 404);
  assert.equal((await handleApi(request("ideas", { method: "DELETE" }), ["ideas"], repository)).status, 405);
  assert.equal((await handleApi(request("ideas/1/join"), ["ideas", "1", "join"], repository)).status, 405);
});
test("best-effort rate limit resets after its window", () => {
  const key = crypto.randomUUID(); rateLimit(key, 2, 100); rateLimit(key, 2, 101);
  assert.throws(() => rateLimit(key, 2, 102), /hơi nhanh/); rateLimit(key, 2, 60200);
});
