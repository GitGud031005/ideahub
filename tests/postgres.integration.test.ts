import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { databaseConfig } from "../src/server/database";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { AppError } from "../src/server/errors";

// Explicit opt-in; never fall back to the application's production DATABASE_URL.
test("Postgres adapter persists and enforces the repository contract", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool(databaseConfig({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }));
  const repository = new PostgresIdeaRepository(pool);
  const user = { id: `test-${randomUUID()}`, name: "Integration A", initial: "A" };
  const other = { id: `test-${randomUUID()}`, name: "Integration B", initial: "B" };
  const failed = { id: `test-${randomUUID()}`, name: "Rollback", initial: "R" };
  const input = { title: "Bản đồ thư viện", description: "Cùng tìm nơi học", category: "Học tập" as const, tags: ["Bản đồ", "Bản đồ"] };
  const query = { q: "", view: "all" as const, sort: "new" as const, limit: 24, offset: 0 };
  try {
    const idea = await repository.createIdea(user, input);
    const second = await repository.createIdea(user, { ...input, title: "Phòng khác" });
    assert.equal(idea.memberCount, 1); assert.equal(idea.joined, true); assert.equal(idea.mine, true);
    assert.deepEqual(idea.tags, ["Học tập", "Bản đồ"]); assert(!("members" in idea));
    const search = await repository.listIdeas(user.id, { ...query, q: "ban do thu vien", view: "mine" });
    assert(search.items.some(i => i.id === idea.id));
    assert.equal((await repository.listIdeas(user.id, { ...query, q: "%' OR 1=1 --", view: "mine" })).total, 0);
    assert.equal((await repository.getIdea(idea.id, other.id)).mine, false);
    await Promise.all(Array.from({ length: 10 }, () => repository.joinIdea(idea.id, other.id)));
    // A fresh repository/pool must see the same persisted membership.
    const freshPool = new Pool(databaseConfig({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }));
    try { assert.equal((await new PostgresIdeaRepository(freshPool).getIdea(idea.id, other.id)).memberCount, 2); }
    finally { await freshPool.end(); }
    const root = await repository.createComment(idea.id, other, { text: "<script>literal</script>" });
    assert.equal((await repository.getIdea(idea.id, other.id)).joined, true);
    await assert.rejects(repository.createComment(second.id, other, { text: "Wrong room", parentId: root.id }), (e: unknown) => e instanceof AppError && e.code === "INVALID_PARENT");
    let parentId = root.id;
    for (let i = 1; i <= 12; i++) parentId = (await repository.createComment(idea.id, user, { text: `Reply ${i}`, parentId })).id;
    await assert.rejects(repository.createComment(idea.id, user, { text: "Too deep", parentId }), (e: unknown) => e instanceof AppError && e.code === "MAX_DEPTH");
    const ids = new Set<string>(); let cursor: string | undefined;
    do {
      const page = await repository.listComments(idea.id, cursor, 2);
      for (const c of page.items) { assert(!ids.has(c.id)); ids.add(c.id); }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(ids.size, 13);
    await assert.rejects(repository.listComments(second.id, root.id, 2), (e: unknown) => e instanceof AppError && e.code === "INVALID_CURSOR");
    await assert.rejects(repository.createIdea(failed, { ...input, title: "" }));
    assert.equal((await pool.query("SELECT id FROM public.users WHERE id = $1", [failed.id])).rowCount, 0, "failed idea creation rolls back the user upsert");
    const health = await pool.query("SELECT id FROM public.ideas LIMIT 0"); assert.equal(health.rowCount, 0);
  } finally {
    // Only remove this run's unique fixture identities and their own ideas.
    try {
      await pool.query("DELETE FROM public.comments WHERE idea_id IN (SELECT id FROM public.ideas WHERE creator_id = $1)", [user.id]);
      await pool.query("DELETE FROM public.ideas WHERE creator_id = $1", [user.id]);
      await pool.query("DELETE FROM public.users WHERE id = ANY($1::text[])", [[user.id, other.id, failed.id]]);
    } finally { await pool.end(); }
  }
});
