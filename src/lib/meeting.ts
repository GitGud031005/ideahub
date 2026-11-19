export const MEETING_CAPACITY = 6;
export const MEETING_GRACE_MS = 60_000;
export const MEETING_DURATION_MS = 180 * 60_000;
export const MEETING_WARNING_MS = 150 * 60_000;
// Dispatch a few seconds early to leave a budget for the 2-second cron tick,
// HTTP dispatch, and LiveKit teardown. Preview must measure this budget.
export const MEETING_CLOSE_LEAD_MS = 12_000;

export type MeetingPhase = "creating" | "active" | "closing" | "closed";
export type MeetingEndReason = "expired" | "empty" | "deleted" | "setup_failed";
export type MeetingSummary = {
  id: string;
  phase: MeetingPhase;
  participants: number;
  startedAt: number | null;
  warnAt: number | null;
  expiresAt: number | null;
  reason: MeetingEndReason | null;
};
export type MeetingStatus = { serverNow: number; canStart: boolean; session: MeetingSummary | null };
export type MeetingJoin = { url: string; token: string; status: MeetingStatus };
export const meetingApi = (id: string) => `/ideas/${encodeURIComponent(id)}/meeting`;

export function meetingClock(warnAt: number, expiresAt: number, now: number) {
  return { warning: now >= warnAt && now < expiresAt, expired: now >= expiresAt,
    remainingSeconds: Math.ceil(Math.max(0, expiresAt - now) / 1000) };
}
