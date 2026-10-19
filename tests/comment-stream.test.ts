import assert from "node:assert/strict";
import { test } from "node:test";
import { commentStream } from "../src/server/comment-stream";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { AuthService, MemoryAuthStore } from "../src/server/auth";
import { handleApi } from "../src/server/api";
import { SESSION_COOKIE } from "../src/server/session";
import type { Idea } from "../src/lib/domain";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { embeddedPool } from "./helpers/postgres";

const actor = { id: "live-reader", username: "live_reader", name: "Reader", initial: "R" };
const writer = { id: "live-writer", name: "Writer", initial: "W" };
function readEvents(response: Response) {
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  let pending = "";
  return {
    reader,
    async next() {
      while (true) {
        const end = pending.indexOf("\n\n");
        if (end >= 0) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          const event = frame.match(/^event: (.+)$/m)?.[1];
          if (event) return event;
          continue;
        }
        const { done, value } = await reader.read();
        if (done) return null;
        pending += decoder.decode(value, { stream: true });
      }
    },
  };
}

test("pin-only changes trigger live refresh without changing message count",async()=>{
  const repo=new StateIdeaRepository(new MemoryStore());
  const initial=await repo.getActivity("1"),comment=(await repo.listComments("1")).items[0];
  await repo.joinIdea("1",actor.id);
  const before=await repo.getActivity("1");
  const events=readEvents(commentStream(new Request("https://ideahub.test"),before,()=>repo.getActivity("1"),{interval:5,duration:200}));
  try{
    assert.equal(await events.next(),"comments-changed");
    await repo.pinComment("1",comment.id,actor.id,true);
    assert.equal(await events.next(),"comments-changed");
    assert.equal((await repo.getActivity("1")).commentCount,initial.commentCount);
    await repo.pinComment("1",comment.id,actor.id,false);
    assert.equal(await events.next(),"comments-changed");
  }finally{await events.reader.cancel();}
});

test("stream detects another user's root and nested reply in shared storage without a page reload", { timeout: 5000 }, async () => {
  const repository = new StateIdeaRepository(new MemoryStore());
  const response = commentStream(new Request("https://ideahub.test"), await repository.getIdea("1", actor.id), () => repository.getIdea("1", actor.id), { interval: 10, duration: 600 });
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const events = readEvents(response);
  try {
    assert.equal(await events.next(), "comments-changed");
    const root = await repository.createComment("1", writer, { text: "Live root" });
    assert.equal(await events.next(), "comments-changed");
    const reply = await repository.createComment("1", writer, { text: "Live reply", parentId: root.id });
    assert.equal(await events.next(), "comments-changed");
    assert((await repository.listComments("1")).items.some(c => c.id === reply.id && c.parentId === root.id));
    // Changes in a different room do not cause a refresh here.
    await repository.createComment("2", writer, { text: "Other room" });
    assert.equal(await events.next(), null);
  } finally { await events.reader.cancel(); }
});

test("stream closes on revoked auth, abort, cancellation, and its serverless deadline", { timeout: 5000 }, async () => {
  const repository = new StateIdeaRepository(new MemoryStore()), initial = await repository.getIdea("1", actor.id);
  const expired = readEvents(commentStream(new Request("https://ideahub.test"), initial, async () => null, { interval: 5 }));
  assert.equal(await expired.next(), "comments-changed");
  assert.equal(await expired.next(), "auth-required");
  assert.equal(await expired.next(), null);
  for (const mode of ["abort", "cancel", "deadline"] as const) {
    const controller = new AbortController(); let calls = 0;
    const stream = readEvents(commentStream(new Request("https://ideahub.test", { signal: controller.signal }), initial, async () => { calls++; return initial; }, { interval: 10, duration: 40 }));
    assert.equal(await stream.next(), "comments-changed");
    if (mode === "abort") controller.abort();
    if (mode === "cancel") await stream.reader.cancel();
    assert.equal(await stream.next(), null);
    const stoppedAt = calls;
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, stoppedAt);
  }
});

test("storage failure closes the stream so the client can retry with HTTP fallback", async () => {
  const initial = await new StateIdeaRepository(new MemoryStore()).getIdea("1", actor.id);
  const stream = readEvents(commentStream(new Request("https://ideahub.test"), initial, async (): Promise<Idea> => { throw new Error("unavailable"); }, { interval: 5 }));
  assert.equal(await stream.next(), "comments-changed");
  assert.equal(await stream.next(), "stream-error");
  assert.equal(await stream.next(), null);
});

test("SSE endpoint requires a real session, validates room and origin, and is read-only", async () => {
  const repository = new StateIdeaRepository(new MemoryStore()), auth = new AuthService(new MemoryAuthStore());
  const { user } = await auth.google({ subject: "live-test", name: "Reader", avatarUrl: null });
  const { token } = await auth.issueSession(user, null);
  const call = (id: string, init: RequestInit = {}, session = token) => handleApi(new Request(`https://ideahub.test/api/ideas/${id}/comments/stream`, { ...init, headers: { cookie: `${SESSION_COOKIE}=${session}`, ...init.headers } }), ["ideas", id, "comments", "stream"], repository, auth);
  assert.equal((await call("1", {}, "")).status, 401);
  assert.equal((await call("missing")).status, 404);
  assert.equal((await call("bad.id")).status, 400);
  assert.equal((await call("1", { headers: { origin: "https://other.test" } })).status, 403);
  assert.equal((await call("1", { method: "POST" })).status, 405);
  const response = await call("1"), events = readEvents(response);
  assert.equal(response.status, 200);
  assert.equal(await events.next(), "comments-changed");
  await auth.logout(token);
  assert.equal(await events.next(), "auth-required");
  assert.equal(await events.next(), null);
});

test("separate PostgreSQL repository instances observe each other's committed comments", async () => {
  const database = await embeddedPool();
  const readerRepo = new PostgresIdeaRepository(database.pool), writerRepo = new PostgresIdeaRepository(database.pool);
  try {
    const idea = await writerRepo.createIdea(writer, { title: "Live PostgreSQL", description: "Shared room", category: "Công nghệ", tags: [] });
    const events = readEvents(commentStream(new Request("https://ideahub.test"), idea, () => readerRepo.getIdea(idea.id, actor.id), { interval: 20, duration: 5000 }));
    try {
      assert.equal(await events.next(), "comments-changed");
      const root = await writerRepo.createComment(idea.id, writer, { text: "Across instances" });
      assert.equal(await events.next(), "comments-changed");
      await writerRepo.createComment(idea.id, writer, { text: "Nested across instances", parentId: root.id });
      assert.equal(await events.next(), "comments-changed");
      assert.equal((await readerRepo.listComments(idea.id)).total, 2);
    } finally { await events.reader.cancel(); }
  } finally { await database.close(); }
});
