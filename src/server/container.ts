import { CachedIdeaRepository } from "./cached-repository";
import { applicationCache } from "./redis-cache";
import { resolve } from "node:path";
import type { StorageMode } from "@/lib/domain";
import { JsonStore, MemoryStore } from "./stores";
import { StateIdeaRepository, type IdeaRepository } from "./repository";
import { AppError } from "./errors";
import { getDatabasePool } from "./database";
import { PostgresIdeaRepository } from "./postgres-repository";

export function storageMode(): StorageMode {
  const mode = process.env.IDEAHUB_STORAGE || (process.env.VERCEL ? "memory" : "json");
  if (mode !== "json" && mode !== "memory" && mode !== "postgres") throw new AppError(503, "STORAGE_CONFIG", "Cấu hình lưu trữ chưa hợp lệ");
  if (mode === "json" && process.env.VERCEL) throw new AppError(503, "STORAGE_CONFIG", "Vercel cần dùng memory cho bản thử nghiệm hoặc kết nối database");
  return mode;
}
const globalContainer = globalThis as typeof globalThis & { __ideahubRepository?: IdeaRepository };
export function getRepository(): IdeaRepository {
  const mode = storageMode();
  return globalContainer.__ideahubRepository ??= mode === "postgres"
    ? new CachedIdeaRepository(new PostgresIdeaRepository(getDatabasePool()),applicationCache)
    : new StateIdeaRepository(mode === "memory" ? new MemoryStore() : new JsonStore(resolve(process.env.IDEAHUB_DATA_FILE || "./data/ideahub.json")));
}
