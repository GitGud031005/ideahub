import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Account } from "@/lib/domain";
import { initials } from "@/lib/format";
import { AppError } from "./errors";
import { getDatabasePool } from "./database";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";
import { SESSION_MAX_AGE } from "./session";
import { PostgresAuthStore } from "./postgres-auth-store";

export interface Credential { user: Account; passwordHash: string | null }
export interface AuthStore {
  createAccount(user: Account, passwordHash: string): Promise<boolean>;
  upsertGoogle(user: Account, subject: string): Promise<Account>;
  setAvatar(userId: string, url: string, source: "google" | "custom"): Promise<Account>;
  updateName(userId: string, name: string, initial: string): Promise<Account>;
  changePassword(userId: string, expectedHash: string, nextHash: string): Promise<boolean>;
  findAccount(username: string): Promise<Credential | null>;
  saveSession(hash: string, userId: string, expires: Date, expectedPasswordHash?: string): Promise<void>;
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
  private async issue(user: Account, previous: string | null, expectedPasswordHash?: string) {
    const token = randomBytes(32).toString("base64url");
    await this.store.saveSession(digest(token), user.id, new Date(Date.now() + SESSION_MAX_AGE * 1000), expectedPasswordHash);
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
    const verifiedHash=credential?.passwordHash;
    const valid = await verifyPassword(input.password, verifiedHash ?? DUMMY_PASSWORD_HASH);
    if (!credential || !valid) throw new AppError(401, "INVALID_CREDENTIALS", "Username hoặc mật khẩu chưa đúng");
    return this.issue(credential.user, previous, verifiedHash!);
  }
  async logout(token: string | null) { if (token) await this.store.deleteSession(digest(token)); }
  async google(identity: { subject: string; name: string; avatarUrl: string | null }) {
    const user = await this.store.upsertGoogle({ id: randomUUID(), username: `g_${randomBytes(10).toString("hex")}`, name: identity.name, initial: initials(identity.name), avatarUrl: identity.avatarUrl, provider:"google",avatarSource:identity.avatarUrl ? "google" : "initials" },identity.subject);
    return { user };
  }
  setAvatar(userId:string,url:string,source:"google"|"custom"="custom") {return this.store.setAvatar(userId,url,source);}
  updateName(userId:string,name:string) {return this.store.updateName(userId,name,initials(name));}
  async changePassword(user:Account,input:{currentPassword:string;newPassword:string}) {
    const credential=await this.store.findAccount(user.username);
    if(!credential || credential.user.id!==user.id || credential.user.provider==="google" || !credential.passwordHash)
      throw new AppError(403,"PASSWORD_UNAVAILABLE","Tài khoản Google không sử dụng mật khẩu IdeaHub");
    const expectedHash=credential.passwordHash;
    if(!await verifyPassword(input.currentPassword,expectedHash))
      throw new AppError(422,"CURRENT_PASSWORD","Mật khẩu hiện tại chưa đúng");
    const nextHash=await hashPassword(input.newPassword);
    if(!await this.store.changePassword(user.id,expectedHash,nextHash))
      throw new AppError(409,"PASSWORD_CHANGED","Mật khẩu vừa được thay đổi, hãy đăng nhập lại");
    return this.issue(credential.user,null,nextHash);
  }
  issueSession(user:Account,previous:string|null) {return this.issue(user,previous);}
}
/** Local development/test adapter; production accounts always require PostgreSQL. */
export class MemoryAuthStore implements AuthStore {
  private accounts = new Map<string, Credential>();
  private sessions = new Map<string, { userId: string; expires: Date }>();
  private limits = new Map<string, { since: number; count: number }>();
  private googleIds = new Map<string,string>();
  async createAccount(user: Account, passwordHash: string) { if (this.accounts.has(user.username)) return false; this.accounts.set(user.username, { user, passwordHash }); return true; }
  async findAccount(username: string) { return this.accounts.get(username) ?? null; }
  async upsertGoogle(user: Account, subject:string) {
    const username = this.googleIds.get(subject), existing = username ? this.accounts.get(username) : undefined;
    if (existing) { if(existing.user.avatarSource!=="custom"){existing.user.avatarUrl=user.avatarUrl;existing.user.avatarSource=user.avatarSource;}return existing.user; }
    this.googleIds.set(subject,user.username);this.accounts.set(user.username,{user,passwordHash:null});return user;
  }
  async setAvatar(id:string,url:string,source:"google"|"custom") {
    const item=[...this.accounts.values()].find(a=>a.user.id===id);if(!item)throw new AppError(404,"ACCOUNT_NOT_FOUND","Không tìm thấy tài khoản");
    if(source!=="google"||item.user.avatarSource!=="custom"){item.user.avatarUrl=url;item.user.avatarSource=source;}return item.user;
  }
  async updateName(userId:string,name:string,initial:string) {
    const credential=[...this.accounts.values()].find(a=>a.user.id===userId);
    if(!credential)throw new AppError(404,"ACCOUNT_NOT_FOUND","Không tìm thấy tài khoản");
    credential.user.name=name;credential.user.initial=initial;return credential.user;
  }
  async changePassword(userId:string,expectedHash:string,nextHash:string) {
    const credential=[...this.accounts.values()].find(a=>a.user.id===userId);
    if(!credential || credential.user.provider==="google" || credential.passwordHash!==expectedHash)return false;
    credential.passwordHash=nextHash;
    for(const [key,session] of this.sessions)if(session.userId===userId)this.sessions.delete(key);
    return true;
  }
  async saveSession(hash: string, userId: string, expires: Date, expectedPasswordHash?:string) {
    if(expectedPasswordHash){const credential=[...this.accounts.values()].find(a=>a.user.id===userId);if(credential?.passwordHash!==expectedPasswordHash)throw new AppError(401,"INVALID_CREDENTIALS","Mật khẩu đã thay đổi, hãy đăng nhập lại");}
    this.sessions.set(hash, { userId, expires });
  }
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
