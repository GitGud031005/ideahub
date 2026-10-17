import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { handleApi } from "../src/server/api";
import { SESSION_COOKIE, getSessionToken, sessionCookie } from "../src/server/session";
import { AuthService, MemoryAuthStore } from "../src/server/auth";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { rateLimit } from "../src/server/http";
process.env.IDEAHUB_STORAGE = "memory";
const base = "https://ideahub.test";
const payload = { username: "minhan", fullName: "Nguyễn Minh An", password: "Test2026" };
function request(path: string, init: RequestInit = {}, token = "") {
  return new Request(base + "/api/" + path, { ...init, headers: { ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
}
function fixture() {
  const repo = new StateIdeaRepository(new MemoryStore()), auth = new AuthService(new MemoryAuthStore());
  return { auth, repo, call: (path: string, init: RequestInit = {}, token = "") => handleApi(request(path, init, token), path.split("/"), repo, auth) };
}
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const cookie = (r: Response) => r.headers.get("set-cookie")!.split(";")[0].slice(SESSION_COOKIE.length + 1);
const ideaInput = { title: "Hello", description: "An idea", category: "Công nghệ", tags: ["Python"] };

test("anonymous sessions cannot mint identities; public browsing works and all mutations require login", async () => {
  const { call } = fixture();
  const session = await call("session"); assert.equal((await session.json()).user, null); assert.equal(session.headers.get("set-cookie"), null);
  assert.equal((await call("ideas")).status, 200);
  for (const path of ["ideas", "ideas/1/join", "ideas/1/comments"]) assert.equal((await call(path, post({}))).status, 401);
  assert.equal((await call("ideas/1/comments")).status, 401);
  const legacy = await call("ideas", { ...post(ideaInput), headers: { cookie: "ideahub_session=legacy-signed-guest" } }); assert.equal(legacy.status, 401);
});
test("register/login/logout use real identities, rotate sessions and revoke old cookies", async () => {
  const { call } = fixture();
  const register = await call("auth/register", post({ ...payload, username: " MinhAn " }));
  assert.equal(register.status, 201); const first = cookie(register), data = await register.json();
  assert.equal(data.user.username, "minhan"); assert.equal(data.user.name, payload.fullName); assert.equal(data.user.initial, "NA");
  assert(!JSON.stringify(data).includes("password")); assert(!JSON.stringify(data).includes(first));
  assert.match(register.headers.get("set-cookie")!, /HttpOnly/); assert.match(register.headers.get("set-cookie")!, /SameSite=Lax/);
  assert.equal((await call("session", {}, first)).status, 200);
  assert.equal((await (await call("auth/register", post(payload))).json()).error.code, "USERNAME_TAKEN");
  const created = await call("ideas", post(ideaInput), first); assert.equal(created.status, 201); const idea = await created.json(); assert.equal(idea.creator.id, data.user.id);
  const reply = await call(`ideas/${idea.id}/comments`, post({ text: "A comment" }), first); assert.equal(reply.status, 201); assert.equal((await reply.json()).author.name, payload.fullName);
  const join = await call(`ideas/${idea.id}/join`, { method: "POST" }, first); assert.equal((await join.json()).memberCount, 1);
  const login = await call("auth/login", post({ username: "MINHAN", password: payload.password }), first); assert.equal(login.status, 200); const second = cookie(login); assert.notEqual(first, second);
  assert.equal((await (await call("session", {}, first)).json()).user, null);
  assert.equal((await call("ideas", post(ideaInput), first)).status, 401);
  const logout = await call("auth/logout", { method: "POST" }, second); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal((await (await call("session", {}, second)).json()).user, null);
  assert.equal((await call("ideas", post(ideaInput), second)).status, 401);
});
test("failed login is generic, payloads are strict, and cross-origin auth writes are rejected", async () => {
  const { call } = fixture();
  assert.equal((await call("auth/register", post({ ...payload, password: "1234567" }))).status, 422);
  assert.equal((await call("auth/register", post({ ...payload, role: "admin" }))).status, 422);
  await call("auth/register", post(payload));
  const wrong = await call("auth/login", post({ username: payload.username, password: "wrong" }));
  const unknown = await call("auth/login", post({ username: "unknown", password: "wrong" }));
  assert.equal(wrong.status, 401); assert.deepEqual(await wrong.json(), await unknown.json());
  for (const path of ["auth/login", "auth/register", "auth/logout"]) assert.equal((await call(path, { ...post(payload), headers: { origin: "https://untrusted.test" } })).status, 403);
  assert.equal((await call("auth/register", { method: "POST", body: "no json", headers: { "content-type": "application/json" } })).status, 400);
  assert.equal((await call("auth/register", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call("auth/register", post({ huge: "x".repeat(17000) }))).status, 413);
});
test("cookie parsing rejects forged/malformed tokens and production cookies are secure", () => {
  for (const token of ["forged", "a".repeat(1000), "../bad", "<script>"]) assert.equal(getSessionToken(request("session", {}, token)), null);
  const env = process.env as Record<string, string | undefined>; const previous = env.NODE_ENV; env.NODE_ENV = "production";
  try { assert.match(sessionCookie("x"), /; Secure/); } finally { if (previous === undefined) delete env.NODE_ENV; else env.NODE_ENV = previous; }
});
test("missing resources/methods and per-instance write limiter retain their contract", async () => {
  const { call } = fixture();
  assert.equal((await call("ideas/missing")).status, 404);
  assert.equal((await call("ideas", { method: "DELETE" })).status, 405);
  assert.equal((await call("ideas/1/join")).status, 405);
  const key = randomUUID(); rateLimit(key, 2, 100); rateLimit(key, 2, 101); assert.throws(() => rateLimit(key, 2, 102)); rateLimit(key, 2, 60200);
});
