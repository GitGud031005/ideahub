import assert from "node:assert/strict";
import { test } from "node:test";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { embeddedPool } from "./helpers/postgres";
import { AppError } from "../src/server/errors";


test("PostgreSQL SQL contract: search, counts, joins, nested cursor replies and rollback", async () => {
  const embedded = await embeddedPool(), repository = new PostgresIdeaRepository(embedded.pool);
  const user = { id: "actor-a", name: "Người A", initial: "A" }, other = { id: "actor-b", name: "Người B", initial: "B" };
  const input = { title: "Bản đồ thư viện", description: "Cùng tìm nơi học", category: "Học tập" as const, tags: ["Bản đồ", "Bản đồ"] };
  const query = { q: "", view: "all" as const, sort: "new" as const, limit: 24, offset: 0 };
  try {
    // Real sessions already have a profile before joining; repository writes must
    // preserve that profile rather than replacing it with the request snapshot.
    await embedded.pool.query("INSERT INTO public.users(id,display_name,initial) VALUES ($1,$2,$3)", [other.id, other.name, other.initial]);
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
    const clientId="72fc48c3-2277-412d-a07d-897597516dad";
    const repeated=await Promise.all(Array.from({length:5},()=>repository.createComment(idea.id,other,{text:"Optimistic retry",clientId,parentId:root.id})));
    assert(repeated.every(c=>c.id===clientId));assert.equal((await repository.getIdea(idea.id,user.id)).commentCount,14);
    for(const [room,actor,text,parentId] of [[idea.id,other,"Changed",root.id],[second.id,other,"Optimistic retry",null],[idea.id,user,"Optimistic retry",root.id],[idea.id,other,"Optimistic retry",null]] as const)await assert.rejects(repository.createComment(room,actor,{text,parentId,clientId}),{code:"COMMENT_CONFLICT"});
    assert.equal((await repository.getIdea(idea.id,user.id)).commentCount,14);
    await assert.rejects(repository.listComments(second.id, root.id), (e: unknown) => e instanceof AppError && e.code === "INVALID_CURSOR");
    await assert.rejects(repository.createIdea({ id: "must-rollback", name: "Rollback", initial: "R" }, { ...input, title: "" }));
    assert.equal((await embedded.pool.query("SELECT id FROM public.users WHERE id = 'must-rollback'")).rowCount, 0);
    assert.equal((await repository.listIdeas(user.id, query)).total, 2);
  } finally { await embedded.close(); }
});
