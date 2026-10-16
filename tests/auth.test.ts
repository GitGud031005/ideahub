import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { AuthService, digest } from "../src/server/auth";
import { PostgresAuthStore } from "../src/server/postgres-auth-store";
import { hashPassword, verifyPassword } from "../src/server/password";
import { embeddedPool } from "./helpers/postgres";
import { initials } from "../src/lib/format";

test("scrypt uses individual salts, verifies passwords and rejects malformed hashes", async () => {
  const password = "A long test passphrase 2026";
  const one = await hashPassword(password), two = await hashPassword(password);
  assert.notEqual(one, two); assert(!one.includes(password));
  assert.equal(await verifyPassword(password, one), true); assert.equal(await verifyPassword("wrong", one), false);
  assert.equal(await verifyPassword(password, "bad"), false);
  assert.equal(initials("  Nguyễn   Minh An "), "NA"); assert.equal(initials("An"), "A");
});
test("PostgreSQL auth: atomic username uniqueness, persistence, expiry, revocation and shared limits", async () => {
  const db = await embeddedPool(), store = new PostgresAuthStore(db.pool), service = new AuthService(store);
  try {
    const user = { id: randomUUID(), username: "minhan", name: "Nguyễn Minh An", initial: "NA" };
    assert(await store.createAccount(user, "test-hash"));
    assert.equal(await store.createAccount({ ...user, id: randomUUID() }, "different-hash"), false);
    assert.equal(Number((await db.pool.query<{ count: string }>("SELECT count(*) FROM public.users")).rows[0].count), 1);
    assert.equal((await store.findAccount("minhan"))!.user.name, user.name);
    const token = randomBytes(32).toString("base64url");
    await store.saveSession(digest(token), user.id, new Date(Date.now() + 60000));
    assert.deepEqual(await service.user(token), user);
    assert.deepEqual(await new AuthService(new PostgresAuthStore(db.pool)).user(token), user);
    assert.equal(await service.user(token, new Date(Date.now() + 120000)), null);
    assert.equal(await service.user(randomBytes(32).toString("base64url")), null);
    await service.logout(token); assert.equal(await service.user(token), null);
    const now = new Date(); assert.equal(await store.consume("key", 60, now), 1);
    assert.equal(await new PostgresAuthStore(db.pool).consume("key", 60, now), 2);
    assert.equal(await store.consume("key", 60, new Date(+now + 61000)), 1);
    await service.limit("limit", 1); await assert.rejects(new AuthService(new PostgresAuthStore(db.pool)).limit("limit", 1), /quá nhiều/);
    const permissions = (await db.pool.query<{ schema: boolean; table: boolean }>("SELECT has_schema_privilege('anon','ideahub_private','USAGE') AS schema, has_table_privilege('anon','ideahub_private.accounts','SELECT') AS table")).rows[0];
    assert.equal(permissions.schema, false); assert.equal(permissions.table, false);
  } finally { await db.close(); }
});
