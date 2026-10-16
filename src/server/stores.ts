import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { DataState, StateStore } from "./state";
import { createSeed } from "./seed";

/** A single-process queue. JSON is for one local server, not multi-instance hosting. */
class Queue {
  private pending: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation, operation);
    this.pending = next.catch(() => undefined);
    return next;
  }
}
export class MemoryStore implements StateStore {
  private state: DataState;
  private queue = new Queue();
  constructor(seed: DataState = createSeed()) { this.state = structuredClone(seed); }
  read<T>(reader: (state: DataState) => T) { return this.queue.run(async () => structuredClone(reader(structuredClone(this.state)))); }
  transact<T>(operation: (state: DataState) => T) {
    return this.queue.run(async () => {
      const draft = structuredClone(this.state), result = operation(draft);
      this.state = draft; return structuredClone(result);
    });
  }
}
export class JsonStore implements StateStore {
  private queue = new Queue();
  constructor(private file: string) {}
  private async load(): Promise<DataState> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 || !("ideas" in parsed) || !Array.isArray(parsed.ideas) || !("comments" in parsed) || !Array.isArray(parsed.comments)) throw new Error("Invalid IdeaHub data file; restore from backup instead of resetting user data.");
      return parsed as DataState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const seed = createSeed(); await this.persist(seed); return seed;
    }
  }
  private async persist(state: DataState) {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.file);
  }
  read<T>(reader: (state: DataState) => T) { return this.queue.run(async () => structuredClone(reader(await this.load()))); }
  transact<T>(operation: (state: DataState) => T) {
    return this.queue.run(async () => {
      const state = await this.load(), result = operation(state);
      await this.persist(state); return structuredClone(result);
    });
  }
}
