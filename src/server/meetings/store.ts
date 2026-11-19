import { randomUUID } from "node:crypto";
import { MEETING_CLOSE_LEAD_MS, type MeetingEndReason, type MeetingPhase } from "@/lib/meeting";
import type { DatabaseClient, DatabasePool } from "../postgres-repository";
import { AppError, notFound } from "../errors";

export interface MeetingRow {
  id: string;
  idea_id: string;
  room_name: string;
  room_sid: string | null;
  phase: MeetingPhase;
  created_at: Date;
  started_at: Date | null;
  warn_at: Date | null;
  expires_at: Date | null;
  closed_at: Date | null;
  reason: MeetingEndReason | null;
  participants: number;
  lease_id: string | null;
}
const sessions = "ideahub_private.meeting_sessions";
const identities = "ideahub_private.meeting_issued_identities";
export const closingAt = (expiresAt: Date) => expiresAt.getTime() - MEETING_CLOSE_LEAD_MS;

export class MeetingStore {
  constructor(private db: DatabasePool) {}

  private async transaction<T>(work: (client: DatabaseClient) => Promise<T>) {
    const client = await this.db.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  }

  async status(ideaId: string, userId: string) {
    return this.transaction(async db => {
      const archived = await this.membership(db, ideaId, userId, false);
      return { archived, session: await this.latest(db, ideaId) };
    });
  }

  private async membership(db: DatabaseClient, ideaId: string, userId: string, lock: boolean) {
    const { rows: [idea] } = await db.query<{ status: string }>(
      `SELECT status FROM public.ideas WHERE id=$1 ${lock ? "FOR UPDATE" : "FOR KEY SHARE"}`, [ideaId]);
    if (!idea) throw notFound();
    const member = await db.query(
      "SELECT 1 FROM public.memberships WHERE idea_id=$1 AND user_id=$2 FOR KEY SHARE", [ideaId, userId]);
    if (!member.rowCount) throw new AppError(403, "NOT_JOINED", "Tham gia block để vào phòng họp");
    return idea.status === "archived";
  }

  private async latest(db: DatabaseClient, ideaId: string) {
    const { rows: [session] } = await db.query<MeetingRow>(
      `SELECT * FROM ${sessions} WHERE idea_id=$1 ORDER BY sequence DESC LIMIT 1`, [ideaId]);
    return session ?? null;
  }

  async reserve(ideaId: string, userId: string, afterId: string | null, clock: () => number) {
    return this.transaction(async db => {
      const archived = await this.membership(db, ideaId, userId, true);
      const current = await this.latest(db, ideaId);
      if (current && current.phase !== "closed") return current.id;
      if (archived) throw new AppError(409, "MEETING_ARCHIVED", "Chuyển block về Tiềm năng để bắt đầu cuộc họp mới");
      if ((current?.id ?? null) !== afterId) throw new AppError(409, "MEETING_CHANGED", "Phiên họp vừa thay đổi. Tải lại trạng thái rồi thử lại");
      const id = randomUUID();
      await db.query(`INSERT INTO ${sessions}
        (id,idea_id,room_name,opened_by,created_at,next_action_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [id, ideaId, `ih-meeting-${id}`, userId, new Date(clock())]);
      return id;
    });
  }

  async authorizeJoin(ideaId: string, userId: string, id: string, clock: () => number, record: boolean) {
    return this.transaction(async db => {
      const archived = await this.membership(db, ideaId, userId, false);
      const { rows: [session] } = await db.query<MeetingRow>(
        `SELECT * FROM ${sessions} WHERE idea_id=$1 AND id=$2 FOR UPDATE`, [ideaId, id]);
      if (session?.phase !== "active" || !session.expires_at || clock() >= closingAt(session.expires_at))
        throw new AppError(409, "MEETING_ENDED", "Phiên này đã đóng hoặc đang đóng");
      if (record) await db.query(`INSERT INTO ${identities} (session_id,identity) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, userId]);
      return { archived, session };
    });
  }

  async claim(now: number, only?: string) {
    const { rows } = await this.db.query<MeetingRow>(`WITH due AS (
      SELECT id FROM ${sessions} WHERE next_action_at <= $1
        AND (lease_until IS NULL OR lease_until <= $1) AND ($3::uuid IS NULL OR id=$3)
      ORDER BY CASE phase WHEN 'closing' THEN 0 WHEN 'active' THEN 1 WHEN 'creating' THEN 2 ELSE 3 END,
        next_action_at LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE ${sessions} s SET lease_id=$2,lease_until=$1::timestamptz + CASE
        WHEN s.phase='active' AND $1::timestamptz < s.expires_at - $4::int * interval '1 millisecond'
        THEN interval '5 seconds' ELSE interval '12 seconds' END
      FROM due WHERE s.id=due.id RETURNING s.*`, [new Date(now), randomUUID(), only ?? null, MEETING_CLOSE_LEAD_MS]);
    return rows[0] ?? null;
  }

  async activate(row: MeetingRow, sid: string, now: number, warnAt: number, expiresAt: number) {
    await this.db.query(`UPDATE ${sessions} SET phase='active', room_sid=$3, started_at=$4, warn_at=$5,
      expires_at=$6, next_action_at=$7, lease_id=NULL, lease_until=NULL
      WHERE id=$1 AND lease_id=$2 AND phase='creating'`,
    [row.id, row.lease_id, sid, new Date(now), new Date(warnAt), new Date(expiresAt), new Date(now + 5000)]);
  }

  async observe(row: MeetingRow, count: number, next: number) {
    await this.db.query(`UPDATE ${sessions} SET participants=$3,
      next_action_at=$4,lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 AND phase='active'`,
    [row.id, row.lease_id, count, new Date(next)]);
  }

  async retry(row: MeetingRow, next: number | null) {
    await this.db.query(`UPDATE ${sessions} SET next_action_at=$3,lease_id=NULL,lease_until=NULL
      WHERE id=$1 AND lease_id=$2 AND phase=$4`, [row.id, row.lease_id, next === null ? null : new Date(next), row.phase]);
  }

  async close(row: MeetingRow, reason: MeetingEndReason, now: number) {
    const { rows } = await this.db.query<MeetingRow>(`UPDATE ${sessions}
      SET phase='closing',reason=$3,next_action_at=$4 WHERE id=$1 AND lease_id=$2 AND phase=$5 RETURNING *`,
    [row.id, row.lease_id, reason, new Date(now), row.phase]);
    return rows[0] ?? null;
  }

  async finish(row: MeetingRow, now: number, next: number) {
    await this.db.query(`UPDATE ${sessions} SET phase='closed',closed_at=$3,participants=0,
      next_action_at=$4,lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 AND phase='closing'`,
    [row.id, row.lease_id, new Date(now), new Date(next)]);
  }

  async issuedIdentities(id: string) {
    const { rows } = await this.db.query<{ identity: string }>(
      `SELECT identity FROM ${identities} WHERE session_id=$1`, [id]);
    return rows.map(row => row.identity);
  }

  async signalRoom(name: string, sid: string, event: "participant_joined" | "participant_left" | "room_started" | "room_finished", now: number) {
    // The event is a hint, never authoritative state. Polling picks up
    // events that arrive during a provider observation or never arrive.
    await this.db.query(`UPDATE ${sessions} SET next_action_at=LEAST(next_action_at,$3)
      WHERE room_name=$1 AND (phase IN ('active','closing') OR (phase='closed' AND $4='room_started'))
        AND (room_sid=$2 OR $4='room_started' OR phase='closing')`, [name, sid, new Date(now), event]);
  }
}
