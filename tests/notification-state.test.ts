import assert from "node:assert/strict";
import { test } from "node:test";
import { StateIdeaRepository, type IdeaRepository } from "../src/server/repository";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { MemoryStore } from "../src/server/stores";
import { embeddedPool } from "./helpers/postgres";

for (const kind of ["memory", "postgres"] as const) {
  test(`${kind}: dashboard notification state defaults on and stays private to each member`, async () => {
    const db = kind === "postgres" ? await embeddedPool() : null;
    try {
      const repo: IdeaRepository = db ? new PostgresIdeaRepository(db.pool) : new StateIdeaRepository(new MemoryStore({ version: 1, ideas: [], comments: [] }));
      const a = { id: "notification-a", name: "An", initial: "A" }, b = { id: "notification-b", name: "Bình", initial: "B" };
      const room = await repo.createIdea(a, { title: "Thông báo", description: "Personal preferences", tags: [] });
      const other = await repo.createIdea(a, { title: "Phòng khác", description: "Keep enabled", tags: [] });
      const query = { q: "", view: "all" as const, sort: "activity" as const, limit: 24, offset: 0 };
      const listed = async (viewer: string, id = room.id) => (await repo.listIdeas(viewer, query)).items.find(i => i.id === id)!;
      assert.equal(room.notificationsMuted, false);
      assert.equal((await listed("guest")).notificationsMuted, false);
      assert.equal((await repo.joinIdea(room.id, b.id, b)).notificationsMuted, false);

      await repo.muteRoom(room.id, a.id, true);
      assert.equal((await listed(a.id)).notificationsMuted, true);
      assert.equal((await repo.getIdea(room.id, a.id)).notificationsMuted, true);
      assert.equal((await listed(b.id)).notificationsMuted, false);
      assert.equal((await listed("guest")).notificationsMuted, false);
      assert.equal((await listed(a.id, other.id)).notificationsMuted, false);
      await repo.joinIdea(room.id, a.id, a);
      assert.equal((await listed(a.id)).notificationsMuted, true, "Reopening a room must preserve an explicit mute");

      await repo.muteRoom(room.id, a.id, false);
      assert.equal((await listed(a.id)).notificationsMuted, false);
      await assert.rejects(repo.muteRoom(other.id, b.id, true), { code: "NOT_JOINED" });
    } finally { await db?.close(); }
  });
}
