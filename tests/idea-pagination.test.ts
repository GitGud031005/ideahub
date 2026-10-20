import assert from "node:assert/strict";
import { test } from "node:test";
import type { IdeaQuery, IdeasPage } from "../src/lib/domain";
import { StateIdeaRepository } from "../src/server/repository";
import { MemoryStore } from "../src/server/stores";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { embeddedPool } from "./helpers/postgres";
import { ideaQuerySchema } from "../src/lib/validation";

const actor = { id: "pager", name: "Pager", initial: "P" };
const query: IdeaQuery = { q: "", view: "all", sort: "new", limit: 2, offset: 0 };
const input = { title: "Pagination", description: "Cursor regression", category: "Học tập" as const, tags: [] };

for (const storage of ["memory", "postgres"] as const) {
  test(`${storage}: idea cursors survive inserts and popularity changes without duplicates or missing rows`, async () => {
    const database = storage === "postgres" ? await embeddedPool() : undefined;
    const state = new MemoryStore({ version: 1, ideas: [], comments: [] });
    const repo = database ? new PostgresIdeaRepository(database.pool) : new StateIdeaRepository(state);
    const base = Array.from({ length: 7 }, (_, index) => ({ id: `idea-${index}`, title: `Idea ${index}` }));
    try {
      // Identical timestamps exercise the ID tie-breaker; PostgreSQL precision is
      // deliberately finer than JavaScript Date to catch lossy cursor encoding.
      for (const row of base) {
        if (database) {
          await database.pool.query("INSERT INTO public.users(id,display_name,initial) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [actor.id, actor.name, actor.initial]);
          await database.pool.query(`INSERT INTO public.ideas(id,title,description,category,creator_id,search_text,created_at)
            VALUES ($1,$2,'Cursor regression','Học tập',$3,'idea','2026-01-01T00:00:00.123456Z')`, [row.id, row.title, actor.id]);
          await database.pool.query("INSERT INTO public.memberships(idea_id,user_id,joined_at) VALUES ($1,$2,'2026-01-01')", [row.id, actor.id]);
        } else {
          await state.transact(s => { s.ideas.push({ ...row, ...input, title: row.title, createdAt: "2026-01-01T00:00:00.123Z", creator: actor, members: [actor.id] }); });
        }
      }
      for (const sort of ["new", "popular"] as const) {
        const options = { ...query, sort };
        const expected = (await repo.listIdeas(actor.id, { ...options, limit: 100 })).items.map(i => i.id);
        const first = await repo.listIdeas(actor.id, options);
        assert(first.nextCursor);
        // Ensure writes occur after the snapshot even on the millisecond local adapter.
        while (Date.now() <= Date.parse(JSON.parse(Buffer.from(first.nextCursor, "base64url").toString()).snapshot)) await new Promise(resolve => setTimeout(resolve, 1));
        const inserted = await repo.createIdea(actor, input);
        await repo.joinIdea(expected.at(-1)!, `new-member-${sort}`);
        await repo.joinIdea(first.items[0].id, `new-member-first-${sort}`);
        const received = first.items.map(i => i.id);
        let cursor: string | null = first.nextCursor;
        while (cursor) {
          const page: IdeasPage = await repo.listIdeas(actor.id, { ...options, cursor });
          assert.equal(page.total, expected.length);
          received.push(...page.items.map(i => i.id)); cursor = page.nextCursor;
        }
        assert.deepEqual(received, expected);
        assert(!received.includes(inserted.id));
        assert.equal(new Set(received).size, received.length);
        const refreshed = await repo.listIdeas(actor.id, { ...options, limit: 100 });
        assert(refreshed.items.some(i => i.id === inserted.id));
        for (const changed of [{ q: "different" }, { view: "mine" as const }, { sort: sort === "new" ? "popular" as const : "new" as const }, { offset: 2 }]) {
          await assert.rejects(repo.listIdeas(actor.id, { ...options, cursor: first.nextCursor, ...changed }), { code: "INVALID_CURSOR" });
        }
        await assert.rejects(repo.listIdeas("different-viewer", { ...options, cursor: first.nextCursor }), { code: "INVALID_CURSOR" });
      }
      const empty = await repo.listIdeas(actor.id, { ...query, q: "no-match-unique" });
      assert.equal(empty.total, 0); assert.deepEqual(empty.items, []); assert.equal(empty.nextCursor, null);
      await assert.rejects(repo.listIdeas(actor.id, { ...query, cursor: "garbage" }), { code: "INVALID_CURSOR" });
      const valid = JSON.parse(Buffer.from(firstCursor(await repo.listIdeas(actor.id, query)), "base64url").toString());
      for (const invalid of [{members:2147483648}, {createdAt:"0000-01-01T00:00:00Z"}]) {
        const cursor = Buffer.from(JSON.stringify({...valid,...invalid})).toString("base64url");
        await assert.rejects(repo.listIdeas(actor.id,{...query,cursor}),{code:"INVALID_CURSOR"});
      }
      const all = await repo.listIdeas(actor.id, { ...query, limit: 100 });
      const legacy = await repo.listIdeas(actor.id, { ...query, offset: 2 });
      assert.deepEqual(legacy.items.map(i => i.id), all.items.slice(2, 4).map(i => i.id));

      const member = "joining-viewer";
      for (const row of base.slice(0, 4)) await repo.joinIdea(row.id, member);
      const joined = await repo.listIdeas(member, { ...query, view: "potential" });
      assert(joined.nextCursor);
      while (Date.now() <= Date.parse(JSON.parse(Buffer.from(joined.nextCursor, "base64url").toString()).snapshot)) await new Promise(resolve => setTimeout(resolve, 1));
      await repo.joinIdea(base[4].id, member);
      const next = await repo.listIdeas(member, { ...query, view: "potential", cursor: joined.nextCursor });
      assert.equal(next.total, 4); assert.equal(next.nextCursor, null);
      assert.deepEqual([...joined.items, ...next.items].map(i => i.id).sort(), base.slice(0, 4).map(i => i.id));
    } finally { await database?.close(); }
  });
}

test("idea cursor inputs are bounded before decoding", () => {
  assert(!ideaQuerySchema.safeParse({ cursor: "x".repeat(2001) }).success);
  assert(!ideaQuerySchema.safeParse({ cursor: "" }).success);
});

function firstCursor(page: IdeasPage) { assert(page.nextCursor); return page.nextCursor; }
