import { Pool, type PoolConfig } from "pg";
import { AppError } from "./errors";

export function databaseConfig(env: { DATABASE_URL?: string; DATABASE_SSL_CA?: string; NODE_ENV?: string } = process.env): PoolConfig {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL || "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password) throw new Error("Invalid database URL");
  } catch {
    throw new AppError(503, "DATABASE_CONFIG", "Máy chủ cần DATABASE_URL PostgreSQL hợp lệ");
  }
  const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // pg URL SSL options replace the ssl object. Keep one explicit, verified TLS policy.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "sslnegotiation"]) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}) },
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    maxLifetimeSeconds: 300,
    allowExitOnIdle: true,
  };
}

const runtime = globalThis as typeof globalThis & { __ideahubPool?: Pool };
export function getDatabasePool(): Pool {
  if (!runtime.__ideahubPool) {
    const pool = new Pool(databaseConfig());
    pool.on("error", () => console.error("IdeaHub database idle connection failed"));
    runtime.__ideahubPool = pool;
  }
  return runtime.__ideahubPool;
}
