import type { Account } from "@/lib/domain";
import type { AuthStore } from "./auth";
import type { DatabasePool } from "./postgres-repository";
interface UserRow { id: string; username: string; display_name: string; initial: string; avatar_url:string|null;avatar_source:Account["avatarSource"];google_subject:string|null }
const account = (row: UserRow): Account => ({ id: row.id, username: row.username, name: row.display_name, initial: row.initial,avatarUrl:row.avatar_url,avatarSource:row.avatar_source,provider:row.google_subject ? "google" : "password" });
const userSelect="SELECT u.id,u.display_name,u.initial,u.avatar_url,u.avatar_source,a.username,a.google_subject FROM ideahub_private.accounts a JOIN public.users u ON u.id=a.user_id";
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
    const row = (await this.pool.query<UserRow & { password_hash: string|null }>(`SELECT u.id,u.display_name,u.initial,u.avatar_url,u.avatar_source,a.username,a.google_subject,a.password_hash FROM ideahub_private.accounts a JOIN public.users u ON u.id=a.user_id WHERE a.username=$1`, [username])).rows[0];
    return row ? { user: account(row), passwordHash: row.password_hash } : null;
  }
  async saveSession(hash: string, userId: string, expires: Date) {
    await this.pool.query("INSERT INTO ideahub_private.sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hash,userId,expires]);
    // Bounded cleanup keeps expired sessions from accumulating indefinitely.
    await this.pool.query("DELETE FROM ideahub_private.sessions WHERE token_hash IN (SELECT token_hash FROM ideahub_private.sessions WHERE expires_at <= now() LIMIT 100)");
  }
  async findSession(hash: string, now: Date) {
    const row = (await this.pool.query<UserRow>(`SELECT u.id,u.display_name,u.initial,u.avatar_url,u.avatar_source,a.username,a.google_subject FROM ideahub_private.sessions s JOIN ideahub_private.accounts a ON a.user_id=s.user_id JOIN public.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`, [hash,now])).rows[0];
    return row ? account(row) : null;
  }
  async deleteSession(hash: string) { await this.pool.query("DELETE FROM ideahub_private.sessions WHERE token_hash=$1", [hash]); }
  async upsertGoogle(user:Account,subject:string):Promise<Account> {
    const existing=(await this.pool.query<UserRow>(`${userSelect} WHERE a.google_subject=$1`,[subject])).rows[0];
    if(existing){
      await this.pool.query(`UPDATE public.users SET display_name=$2,initial=$3,avatar_url=CASE WHEN avatar_source='custom' THEN avatar_url ELSE COALESCE($4,avatar_url) END,avatar_source=CASE WHEN avatar_source='custom' OR $4::text IS NULL THEN avatar_source ELSE 'google' END WHERE id=$1`,[existing.id,user.name,user.initial,user.avatarUrl]);
      return account((await this.pool.query<UserRow>(`${userSelect} WHERE a.user_id=$1`,[existing.id])).rows[0]);
    }
    const db=await this.pool.connect();let winner=false,broken=false;
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO public.users(id,display_name,initial,avatar_url,avatar_source) VALUES ($1,$2,$3,$4,$5)",[user.id,user.name,user.initial,user.avatarUrl,user.avatarSource]);
      const inserted=await db.query("INSERT INTO ideahub_private.accounts(user_id,username,google_subject) VALUES ($1,$2,$3) ON CONFLICT (google_subject) DO NOTHING RETURNING user_id",[user.id,user.username,subject]);
      winner=!!inserted.rowCount;await db.query(winner?"COMMIT":"ROLLBACK");
    }catch(error){try{await db.query("ROLLBACK");}catch{broken=true;}throw error;}finally{db.release(broken);}
    if(winner)return user;
    const other=(await this.pool.query<UserRow>(`${userSelect} WHERE a.google_subject=$1`,[subject])).rows[0];
    if(!other)throw new Error("Google identity was not saved");return account(other);
  }
  async setAvatar(id:string,url:string,source:"google"|"custom") {
    await this.pool.query("UPDATE public.users SET avatar_url=$2,avatar_source=$3 WHERE id=$1 AND ($3='custom' OR avatar_source<>'custom')",[id,url,source]);
    const row=(await this.pool.query<UserRow>(`${userSelect} WHERE a.user_id=$1`,[id])).rows[0];if(!row)throw new Error("Account not found");return account(row);
  }
  async consume(key: string, seconds: number, now: Date) {
    const row = (await this.pool.query<{ attempts: number }>(`INSERT INTO ideahub_private.auth_limits (key_hash,started_at,attempts) VALUES ($1,$2,1)
      ON CONFLICT (key_hash) DO UPDATE SET attempts=CASE WHEN auth_limits.started_at <= $2::timestamptz - $3 * interval '1 second' THEN 1 ELSE auth_limits.attempts+1 END,
      started_at=CASE WHEN auth_limits.started_at <= $2::timestamptz - $3 * interval '1 second' THEN $2 ELSE auth_limits.started_at END RETURNING attempts`, [key,now,seconds])).rows[0];
    await this.pool.query("DELETE FROM ideahub_private.auth_limits WHERE key_hash IN (SELECT key_hash FROM ideahub_private.auth_limits WHERE started_at < now() - interval '1 day' LIMIT 100)");
    return row.attempts;
  }
}
