import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseConfig } from "../src/server/database";
import { AppError } from "../src/server/errors";

test("database config rejects missing credentials without leaking the connection string", () => {
  for (const value of [undefined, "https://example.com", "postgres://user@host/db", "password-do-not-log"]) {
    assert.throws(() => databaseConfig({ DATABASE_URL: value }), (error: unknown) =>
      error instanceof AppError && error.code === "DATABASE_CONFIG" && !error.message.includes("password-do-not-log"));
  }
});
test("serverless pool enforces verified TLS and ignores URL TLS downgrade options", () => {
  const config = databaseConfig({ DATABASE_URL: "postgres://user:secret@pooler.supabase.com:6543/postgres?sslmode=disable&uselibpqcompat=true", NODE_ENV: "production" });
  assert.equal(config.max, 1);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert(!config.connectionString?.includes("sslmode"));
  assert(!config.connectionString?.includes("uselibpqcompat"));
  assert.equal(config.connectionTimeoutMillis, 5000);
  const ca = databaseConfig({ DATABASE_URL: "postgres://user:secret@db.example.com/db", DATABASE_SSL_CA: "line1\\nline2" });
  assert.deepEqual(ca.ssl, { rejectUnauthorized: true, ca: "line1\nline2" });
});
test("unencrypted connections are limited to local development", () => {
  const DATABASE_URL = "postgres://user:secret@localhost:5432/ideahub";
  assert.equal(databaseConfig({ DATABASE_URL, NODE_ENV: "test" }).ssl, false);
  assert.deepEqual(databaseConfig({ DATABASE_URL, NODE_ENV: "production" }).ssl, { rejectUnauthorized: true });
});
