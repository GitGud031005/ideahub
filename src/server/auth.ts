import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Account } from "@/lib/domain";
import { initials } from "@/lib/format";
import { AppError } from "./errors";
import { getDatabasePool } from "./database";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";
import { SESSION_MAX_AGE } from "./session";
import { PostgresAuthStore } from "./postgres-auth-store";

export interface Credential { user: Account; passwordHash: string }
export interface AuthStore {
  createAccount(user: Account, passwordHash: string): Promise<boolean>;
  findAccount(username: string): Promise<Credential | null>;
  saveSession(hash: string, userId: string, expires: Date): Promise<void>;
  findSession(hash: string, now: Date): Promise<Account | null>;
  deleteSession(hash: string): Promise<void>;
  consume(key: string, windowSeconds: number, now: Date): Promise<number>;
}
export const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export class AuthService {
  constructor(private store: AuthStore) {}
  async limit(key: string, count: number, seconds = 900) {
    if (await this.store.consume(digest(key), seconds, new Date()) > count) throw new AppError(429, "AUTH_RATE_LIMIT", "Bạn thử quá nhiều lần, hãy đợi một lúc rồi thử lại");
  }
  async user(token: string | null, now = new Date()): Promise<Account | null> { return token ? this.store.findSession(digest(token), now) : null; }
  private async issue(user: Account, previous: string | null) {
    const token = randomBytes(32).toString("base64url");
    await this.store.saveSession(digest(token), user.id, new Date(Date.now() + SESSION_MAX_AGE * 1000));
    if (previous) await this.logout(previous);
    return { user, token };
  }
  async register(input: { username: string; fullName: string; password: string }, previous: string | null) {
    const user: Account = { id: randomUUID(), username: input.username, name: input.fullName, initial: initials(input.fullName) };
    const hash = await hashPassword(input.password);
    if (!await this.store.createAccount(user, hash)) throw new AppError(409, "USERNAME_TAKEN", "Username này đã được sử dụng");
    return this.issue(user, previous);
  }
  async login(input: { username: string; password: string }, previous: string | null) {
    const credential = await this.store.findAccount(input.username);
    const valid = await verifyPassword(input.password, credential?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!credential || !valid) throw new AppError(401, "INVALID_CREDENTIALS", "Username hoặc mật khẩu chưa đúng");
    return this.issue(credential.user, previous);
  }
  async logout(token: string | null) { if (token) await this.store.deleteSession(digest(token)); }
}
/** Local development/test adapter; production accounts always require PostgreSQL. */
export class MemoryAuthStore implements AuthStore {
  private accounts = new Map<string, Credential>();
  private sessions = new Map<string, { userId: string; expires: Date }>();
  private limits = new Map<string, { since: number; count: number }>();
  async createAccount(user: Account, passwordHash: string) { if (this.accounts.has(user.username)) return false; this.accounts.set(user.username, { user, passwordHash }); return true; }
  async findAccount(username: string) { return this.accounts.get(username) ?? null; }
  async saveSession(hash: string, userId: string, expires: Date) { this.sessions.set(hash, { userId, expires }); }
  async findSession(hash: string, now: Date) { const s = this.sessions.get(hash); if (!s || s.expires <= now) return null; return [...this.accounts.values()].find(a => a.user.id === s.userId)?.user ?? null; }
  async deleteSession(hash: string) { this.sessions.delete(hash); }
  async consume(key: string, seconds: number, now: Date) { const b = this.limits.get(key); if (!b || now.getTime() - b.since >= seconds * 1000) { this.limits.set(key, { since: now.getTime(), count: 1 }); return 1; } return ++b.count; }
}
const runtime = globalThis as typeof globalThis & { __ideahubAuth?: AuthService };
export function getAuthService() {
  if (runtime.__ideahubAuth) return runtime.__ideahubAuth;
  if (process.env.IDEAHUB_STORAGE === "postgres") return runtime.__ideahubAuth = new AuthService(new PostgresAuthStore(getDatabasePool()));
  if (process.env.NODE_ENV === "production") throw new AppError(503, "AUTH_CONFIG", "Đăng nhập cần kết nối PostgreSQL");
  return runtime.__ideahubAuth = new AuthService(new MemoryAuthStore());
}
