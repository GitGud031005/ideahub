import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Author } from "@/lib/domain";
import { AppError } from "./errors";

export const SESSION_COOKIE = "ideahub_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const runtime = globalThis as typeof globalThis & { __ideahubDevSecret?: string };
function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production" || configured) throw new AppError(503, "SESSION_CONFIG", "Máy chủ cần SESSION_SECRET có ít nhất 32 ký tự");
  return runtime.__ideahubDevSecret ??= randomBytes(48).toString("base64url");
}
function signature(payload: string) { return createHmac("sha256", secret()).update(payload).digest("base64url"); }
export function createSessionToken(id = randomUUID(), now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ v: 1, id, exp: Math.floor(now / 1000) + MAX_AGE })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifySessionToken(token: string, now = Date.now()): Author | null {
  if (token.length > 512) return null;
  const parts = token.split("."); if (parts.length !== 2) return null;
  const expected = Buffer.from(signature(parts[0])); const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (data.v !== 1 || typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id) || !Number.isSafeInteger(data.exp) || data.exp <= now / 1000) return null;
    return { id: data.id, name: `Thành viên ${data.id.slice(0, 4)}`, initial: "TV" };
  } catch { return null; }
}
export function getSessionUser(request: Request): Author | null {
  const token = request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  return token ? verifySessionToken(token) : null;
}
export function requireSession(request: Request) {
  const user = getSessionUser(request); if (!user) throw new AppError(401, "SESSION_REQUIRED", "Phiên làm việc đã hết hạn, hãy tải lại trang"); return user;
}
export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
