import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { QueryResultRow } from "pg";
import { PostgresIdeaRepository, type DatabasePool } from "../src/server/postgres-repository";
import { AppError } from "../src/server/errors";

// Embedded PostgreSQL exercises the actual SQL without network credentials.
// The lease serializes transactions like the production one-connection pg pool.
async function embeddedPool() {
  const db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await db.exec(await readFile(new URL("../supabase/migrations/20261016082442_initial_ideahub.sql", import.meta.url), "utf8"));
  let tail: Promise<void> = Promise.resolve();
  async function acquire() {
    const prior = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await prior;
    return release;
  }
  const query = async <Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) => {
    const result = await db.query<Row>(sql, values);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  const pool: DatabasePool = {
    async connect() { const release = await acquire(); return { query, release }; },
    async query(sql, values) { const release = await acquire(); try { return await query(sql, values); } finally { release(); } },
  };
  return { pool, close: () => db.close() };
}

test("PostgreSQL SQL contract: search, counts, joins, nested cursor replies and rollback", async () => {
  const embedded = await embeddedPool(), repository = new PostgresIdeaRepository(embedded.pool);
  const user = { id: "actor-a", name: "Người A", initial: "A" }, other = { id: "actor-b", name: "Người B", initial: "B" };
  const input = { title: "Bản đồ thư viện", description: "Cùng tìm nơi học", category: "Học tập" as const, tags: ["Bản đồ", "Bản đồ"] };
  const query = { q: "", view: "all" as const, sort: "new" as const, limit: 24, offset: 0 };
  try {
    const idea = await repository.createIdea(user, input);
    const second = await repository.createIdea(user, { ...input, title: "Phòng khác" });
    assert.equal(idea.memberCount, 1); assert.equal(idea.mine, true); assert.equal(idea.joined, true);
    assert.deepEqual(idea.tags, ["Học tập", "Bản đồ"]); assert(!("members" in idea));
    const result = await repository.listIdeas(user.id, { ...query, q: "ban do thu vien", view: "mine" });
    assert.equal(result.total, 1); assert.equal(result.items[0].id, idea.id);
    assert.deepEqual(result.counts, { all: 2, joined: 2, mine: 2 });
    assert.equal((await repository.listIdeas(user.id, { ...query, q: "%' OR 1=1 --" })).total, 0);
    await Promise.all(Array.from({ length: 10 }, () => repository.joinIdea(idea.id, other.id)));
    assert.equal((await repository.getIdea(idea.id, other.id)).memberCount, 2);
    const popular = await repository.listIdeas(other.id, { ...query, sort: "popular", view: "joined" });
    assert.equal(popular.items[0].id, idea.id); assert.equal(popular.counts.mine, 0);
    const root = await repository.createComment(idea.id, other, { text: "<script>literal</script>" });
    assert.equal(root.author.name, other.name);
    await assert.rejects(repository.createComment(second.id, user, { text: "Other room", parentId: root.id }), (e: unknown) => e instanceof AppError && e.code === "INVALID_PARENT");
    let parentId = root.id;
    for (let i = 1; i <= 12; i++) parentId = (await repository.createComment(idea.id, user, { text: `Reply ${i}`, parentId })).id;
    await assert.rejects(repository.createComment(idea.id, user, { text: "Too deep", parentId }), (e: unknown) => e instanceof AppError && e.code === "MAX_DEPTH");
    const ids = new Set<string>(); let cursor: string | undefined;
    do {
      const page = await repository.listComments(idea.id, cursor, 2);
      assert.equal(page.total, 13);
      for (const c of page.items) { assert(!ids.has(c.id)); ids.add(c.id); }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(ids.size, 13);
    assert.equal((await repository.getIdea(idea.id, user.id)).commentCount, 13);
    await assert.rejects(repository.listComments(second.id, root.id), (e: unknown) => e instanceof AppError && e.code === "INVALID_CURSOR");
    await assert.rejects(repository.createIdea({ id: "must-rollback", name: "Rollback", initial: "R" }, { ...input, title: "" }));
    assert.equal((await embedded.pool.query("SELECT id FROM public.users WHERE id = 'must-rollback'")).rowCount, 0);
    assert.equal((await repository.listIdeas(user.id, query)).total, 2);
  } finally { await embedded.close(); }
});
