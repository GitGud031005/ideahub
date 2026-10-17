import { z } from "zod";

export const RECAP_TIME_ZONE = "Asia/Ho_Chi_Minh";
export type RecapKind = "daily" | "weekly";
export const recapBulletSchema = z.object({
  text: z.string().trim().min(1).max(600),
  commentIds: z.array(z.string().min(1).max(100)).min(1).max(12),
}).strict();
export const recapContentSchema = z.object({
  keyIdeas: z.array(recapBulletSchema).min(1).max(12),
  decisions: z.array(recapBulletSchema).max(12),
  nextSteps: z.array(recapBulletSchema).max(12),
  openQuestions: z.array(recapBulletSchema).max(12),
}).strict();
export type RecapContent = z.infer<typeof recapContentSchema>;
export interface RecapFile {
  id: string; ideaId: string; kind: RecapKind; periodStart: string; periodEnd: string;
  fileName: string; source: "sample" | "gemini"; sourceCount: number; createdAt: string;
  updatedAt: string;
}
export interface Recap extends RecapFile { content: RecapContent }
export interface RecapPage { items: RecapFile[]; nextOffset: number | null; aiConfigured: boolean }

export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: RECAP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekStart(day: string) {
  return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
}
export function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
export function periodFor(kind: RecapKind, day: string) {
  const start = kind === "weekly" ? weekStart(day) : day;
  return { start, end: addDays(start, kind === "weekly" ? 7 : 1) };
}
export function recapFileName(kind: RecapKind, day: string) { return `${day}${kind === "weekly" ? "_weekly" : ""}.md`; }
export function displayDay(day: string) { return day.split("-").reverse().join("/"); }
export const recapInputSchema = z.object({
  kind: z.enum(["daily", "weekly"]),
  date: z.string().refine(validDay, "Ngày không hợp lệ"),
}).strict();
