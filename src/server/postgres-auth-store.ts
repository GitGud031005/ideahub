import type { Account } from "@/lib/domain";
import type { AuthStore } from "./auth";
import type { DatabasePool } from "./postgres-repository";
interface UserRow { id: string; username: string; display_name: string; initial: string }
const account = (row: UserRow): Account => ({ id: row.id, username: row.username, name: row.display_name, initial: row.initial });
export class PostgresAuthStore implements AuthStore {
  constructor(private pool: DatabasePool) {}
  async createAccount(user: Account, passwordHash: string) {
    const db = await this.pool.connect(); let broken = false;
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO public.users (id, display_name, initial) VALUES ($1,$2,$3)", [user.id,user.name,user.initial]);
      await db.query("INSERT INTO ideahub_private.accounts (user_id, username, password_hash) VALUES ($1,$2,$3)", [user.id,user.username,passwordHash]);
      await db.query("COMMIT"); return true;
    } catch (error) {
      try { await db.query("ROLLBACK"); } catch { broken = true; }
      if ((error as { code?: string; constraint?: string }).code === "23505" && (error as { constraint?: string }).constraint === "accounts_username_key") return false;
      throw error;
    } finally { db.release(broken); }
  }
  async findAccount(username: string) {
    const row = (await this.pool.query<UserRow & { password_hash: string }>(`SELECT u.id, u.display_name, u.initial, a.username, a.password_hash FROM ideahub_private.accounts a JOIN public.users u ON u.id=a.user_id WHERE a.username=$1`, [username])).rows[0];
    return row ? { user: account(row), passwordHash: row.password_hash } : null;
  }
  async saveSession(hash: string, userId: string, expires: Date) {
    await this.pool.query("INSERT INTO ideahub_private.sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hash,userId,expires]);
    // Bounded cleanup keeps expired sessions from accumulating indefinitely.
    await this.pool.query("DELETE FROM ideahub_private.sessions WHERE token_hash IN (SELECT token_hash FROM ideahub_private.sessions WHERE expires_at <= now() LIMIT 100)");
  }
  async findSession(hash: string, now: Date) {
    const row = (await this.pool.query<UserRow>(`SELECT u.id,u.display_name,u.initial,a.username FROM ideahub_private.sessions s JOIN ideahub_private.accounts a ON a.user_id=s.user_id JOIN public.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`, [hash,now])).rows[0];
    return row ? account(row) : null;
  }
  async deleteSession(hash: string) { await this.pool.query("DELETE FROM ideahub_private.sessions WHERE token_hash=$1", [hash]); }
  async consume(key: string, seconds: number, now: Date) {
    const row = (await this.pool.query<{ attempts: number }>(`INSERT INTO ideahub_private.auth_limits (key_hash,started_at,attempts) VALUES ($1,$2,1)
      ON CONFLICT (key_hash) DO UPDATE SET attempts=CASE WHEN auth_limits.started_at <= $2::timestamptz - $3 * interval '1 second' THEN 1 ELSE auth_limits.attempts+1 END,
      started_at=CASE WHEN auth_limits.started_at <= $2::timestamptz - $3 * interval '1 second' THEN $2 ELSE auth_limits.started_at END RETURNING attempts`, [key,now,seconds])).rows[0];
    await this.pool.query("DELETE FROM ideahub_private.auth_limits WHERE key_hash IN (SELECT key_hash FROM ideahub_private.auth_limits WHERE started_at < now() - interval '1 day' LIMIT 100)");
    return row.attempts;
  }
}
