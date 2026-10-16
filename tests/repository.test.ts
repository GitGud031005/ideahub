import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, JsonStore } from "../src/server/stores";
import { StateIdeaRepository } from "../src/server/repository";
import { createSeed } from "../src/server/seed";
import { AppError } from "../src/server/errors";
import { createIdeaSchema, createCommentSchema } from "../src/lib/validation";
import { buildCommentForest } from "../src/lib/format";

const user = { id: "user-a", name: "Bạn A", initial: "A" }, other = { id: "user-b", name: "Bạn B", initial: "B" };
const input = { title: "Bản đồ thư viện", description: "Cùng tìm nơi học", category: "Học tập" as const, tags: ["Bản đồ", "Bản đồ"] };
const query = { q: "", view: "all" as const, sort: "new" as const, limit: 24, offset: 0 };
function repo() { return new StateIdeaRepository(new MemoryStore(createSeed())); }

test("idea creation, accent-insensitive search, ownership and private membership projection", async () => {
  const repository = repo(), idea = await repository.createIdea(user, createIdeaSchema.parse(input));
  assert.equal(idea.memberCount, 1); assert.equal(idea.mine, true); assert.equal(idea.joined, true);
  assert.deepEqual(idea.tags, ["Học tập", "Bản đồ"]); assert(!("members" in idea));
  const found = await repository.listIdeas(user.id, { ...query, q: "ban do thu vien", view: "mine" });
  assert.equal(found.total, 1); assert.equal(found.items[0].id, idea.id);
  assert.equal((await repository.getIdea(idea.id, other.id)).mine, false);
  assert.equal((await repository.listIdeas(other.id, { ...query, view: "mine" })).total, 0);
});
test("concurrent joins are atomic and idempotent", async () => {
  const repository = repo(), before = await repository.getIdea("1", user.id);
  await Promise.all(Array.from({ length: 30 }, () => repository.joinIdea("1", user.id)));
  assert.equal((await repository.getIdea("1", user.id)).memberCount, before.memberCount + 1);
});
test("nested replies validate room ownership, cap depth and join on comment", async () => {
  const repository = repo();
  await assert.rejects(repository.createComment("2", user, { text: "wrong room", parentId: "m-1-0" }), (error: unknown) => error instanceof AppError && error.code === "INVALID_PARENT");
  const root = await repository.createComment("1", user, { text: "<script>literal text</script>" });
  let parent = root.id;
  for (let depth = 1; depth <= 12; depth++) parent = (await repository.createComment("1", other, { text: `Depth ${depth}`, parentId: parent })).id;
  await assert.rejects(repository.createComment("1", other, { text: "too deep", parentId: parent }), (error: unknown) => error instanceof AppError && error.code === "MAX_DEPTH");
  const page = await repository.listComments("1");
  assert(page.items.some(c => c.text === "<script>literal text</script>"));
  assert.equal((await repository.getIdea("1", user.id)).joined, true);
  const tree = buildCommentForest(page.items, "new");
  assert.equal(tree.get(root.id)?.[0].parentId, root.id);
});
test("comment pagination is complete, stable and scoped to a room", async () => {
  const repository = repo(), ids = new Set<string>(); let cursor: string | undefined;
  do { const page = await repository.listComments("1", cursor, 2); for (const c of page.items) { assert.equal(c.ideaId, "1"); assert(!ids.has(c.id)); ids.add(c.id); } cursor = page.nextCursor ?? undefined; } while (cursor);
  assert.equal(ids.size, 5);
  await assert.rejects(repository.listComments("2", "m-1-0", 2), (error: unknown) => error instanceof AppError && error.code === "INVALID_CURSOR");
});
test("memory transactions roll back on failures", async () => {
  const store = new MemoryStore();
  await assert.rejects(store.transact(state => { state.ideas = []; throw new Error("abort"); }));
  assert.equal(await store.read(state => state.ideas.length), 6);
});
test("JSON adapter persists across instances and refuses to silently reset corrupt data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ideahub-")), file = join(directory, "state.json");
  try {
    const first = new StateIdeaRepository(new JsonStore(file));
    const idea = await first.createIdea(user, createIdeaSchema.parse(input));
    const second = new StateIdeaRepository(new JsonStore(file));
    assert.equal((await second.getIdea(idea.id, user.id)).title, input.title);
    const saved = await readFile(file, "utf8"); await writeFile(file, "broken-json");
    await assert.rejects(second.getIdea(idea.id, user.id)); assert.equal(await readFile(file, "utf8"), "broken-json");
    await writeFile(file, saved);
    const store = new JsonStore(file); await assert.rejects(store.transact(state => { state.ideas = []; throw new Error("rollback"); }));
    assert.equal((await second.getIdea(idea.id, user.id)).title, input.title);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("validation rejects empty, oversized and mass-assigned fields", () => {
  assert(!createIdeaSchema.safeParse({ ...input, creator: user }).success);
  assert(!createIdeaSchema.safeParse({ ...input, title: " ", tags: [] }).success);
  assert(!createIdeaSchema.safeParse({ ...input, tags: Array(13).fill("tag") }).success);
  assert(!createCommentSchema.safeParse({ text: "x".repeat(2001) }).success);
  assert(!createCommentSchema.safeParse({ text: "hello", author: user }).success);
});
