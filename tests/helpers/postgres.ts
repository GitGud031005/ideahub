import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { QueryResultRow } from "pg";
import type { DatabasePool } from "../../src/server/postgres-repository";
// Embedded PostgreSQL exercises the actual SQL without network credentials.
// The lease serializes transactions like the production one-connection pg pool.
export async function embeddedPool() {
  const db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const folder = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(folder)).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, folder), "utf8"));
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

