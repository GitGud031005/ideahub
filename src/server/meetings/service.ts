import {
  MEETING_CAPACITY, MEETING_DURATION_MS, MEETING_GRACE_MS, MEETING_WARNING_MS,
  type MeetingEndReason, type MeetingStatus,
} from "@/lib/meeting";
import type { Account } from "@/lib/domain";
import { AppError } from "../errors";
import type { MeetingProvider } from "./provider";
import { closingAt, type MeetingRow, type MeetingStore } from "./store";

const RECONCILE_MS = 15_000;
const RETRY_MS = 1000;
const TOMBSTONE_MS = 11 * 60_000;
const TOKEN_SECONDS = 45;

type MeetingTiming = { duration: number; warning: number };

export class MeetingService {
  constructor(
    private store: MeetingStore,
    private provider: MeetingProvider,
    private now = Date.now,
    private timing: MeetingTiming = { duration: MEETING_DURATION_MS, warning: MEETING_WARNING_MS },
  ) {}

  private describe(archived: boolean, row: MeetingRow | null): MeetingStatus {
    const now = this.now();
    const due = row?.phase === "active" && row.expires_at && now >= closingAt(row.expires_at);
    const phase = due ? "closing" : row?.phase;
    return { serverNow: now, canStart: !archived && (!row || phase === "closed"),
      session: row && phase ? {
        id: row.id, phase, participants: row.participants, startedAt: row.started_at?.getTime() ?? null,
        warnAt: row.warn_at?.getTime() ?? null, expiresAt: row.expires_at?.getTime() ?? null,
        reason: due ? "expired" : row.reason,
      } : null };
  }

  async status(ideaId: string, userId: string) {
    const { archived, session } = await this.store.status(ideaId, userId);
    return this.describe(archived, session);
  }

  async start(ideaId: string, userId: string, afterId: string | null) {
    const id = await this.store.reserve(ideaId, userId, afterId, this.now);
    await this.workOne(id);
    return this.status(ideaId, userId);
  }

  async join(ideaId: string, user: Account, id: string) {
    const { session: candidate } = await this.store.authorizeJoin(ideaId, user.id, id, this.now, false);
    const admission = await this.provider.admission(candidate.room_name, candidate.room_sid!, user.id).catch(() => {
      throw new AppError(503, "MEETING_UNAVAILABLE", "Chưa thể kết nối với phòng. Vui lòng thử lại");
    });
    if (admission === "full") throw new AppError(409, "MEETING_FULL", "Phòng đã đầy. Chờ có chỗ rồi thử lại");
    if (admission === "missing") throw new AppError(409, "MEETING_ENDED", "Phiên này đã đóng hoặc đang đóng");
    const { archived, session } = await this.store.authorizeJoin(ideaId, user.id, id, this.now, true);
    const cutoff = closingAt(session.expires_at!);
    const ttl = Math.min(TOKEN_SECONDS, Math.floor((cutoff - this.now()) / 1000));
    if (ttl < 1) throw new AppError(409, "MEETING_ENDED", "Phiên này đang đóng");
    const access = await this.provider.issue(session.room_name, user, ttl);
    if (this.now() >= cutoff) throw new AppError(409, "MEETING_ENDED", "Phiên này đang đóng");
    return { ...access, status: this.describe(archived, session) };
  }

  async workOne(id?: string) {
    const row = await this.store.claim(this.now(), id);
    if (!row) return false;
    try {
      await this.process(row);
    } catch {
      // Keep operational logs free of tokens, credentials, and provider bodies.
      console.error("IdeaHub meeting provider operation failed", { sessionId: row.id, phase: row.phase });
      await this.store.retry(row, this.now() + RETRY_MS);
    }
    return true;
  }

  private async process(row: MeetingRow) {
    const now = this.now();
    if (row.phase === "closing") return this.terminate(row);
    if (row.phase === "closed") {
      if (await this.provider.inspect(row.room_name))
        await this.provider.terminate(row.room_name, await this.store.issuedIdentities(row.id));
      return this.store.retry(row, now < row.closed_at!.getTime() + TOMBSTONE_MS ? now + RECONCILE_MS : null);
    }

    if (row.phase === "creating") {
      if (now >= row.created_at.getTime() + MEETING_GRACE_MS) return this.close(row, "setup_failed");
      const room = await this.provider.inspect(row.room_name) ?? await this.provider.create(row.room_name);
      const started = this.now();
      return this.store.activate(row, room.sid, started, started + this.timing.warning, started + this.timing.duration);
    }

    const deadline = closingAt(row.expires_at!);
    if (now >= deadline) return this.close(row, "expired");
    const room = await this.provider.inspect(row.room_name);
    if (this.now() >= deadline) return this.close(row, "expired");
    if (!room || room.sid !== row.room_sid) return this.close(row, "empty");
    // LiveKit measures continuously empty time. A DB sample of zero cannot
    // distinguish an uninterrupted gap from an intervening quick reconnect.
    return this.store.observe(row, Math.min(room.count, MEETING_CAPACITY),
      Math.min(deadline, this.now() + RECONCILE_MS));
  }

  private async close(row: MeetingRow, reason: MeetingEndReason) {
    const closing = await this.store.close(row, reason, this.now());
    if (closing) await this.terminate(closing);
  }

  private async terminate(row: MeetingRow) {
    try {
      await this.provider.terminate(row.room_name, await this.store.issuedIdentities(row.id));
    } catch (error) {
      await this.store.retry(row, this.now() + RETRY_MS);
      throw error;
    }
    const now = this.now();
    await this.store.finish(row, now, now + RECONCILE_MS);
  }
}
