import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "ORIGIN_REJECTED", "Yêu cầu không hợp lệ");
}
export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError(415, "CONTENT_TYPE", "Yêu cầu phải sử dụng JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) { await reader.cancel(); throw new AppError(413, "BODY_TOO_LARGE", "Nội dung yêu cầu quá lớn"); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AppError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ"); }
  return schema.parse(body);
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError) return json({ error: { code: "VALIDATION", message: "Kiểm tra lại nội dung đã nhập", fields: error.flatten().fieldErrors } }, 422);
  if (error instanceof AppError) return json({ error: { code: error.code, message: error.message } }, error.status);
  console.error("IdeaHub request failed", error);
  return json({ error: { code: "INTERNAL", message: "Máy chủ đang bận, hãy thử lại sau" } }, 500);
}
const rateState = globalThis as typeof globalThis & { __ideahubLimits?: Map<string, { start: number; count: number }> };
/** Best-effort per-instance protection; use shared rate limiting with a production DB/Redis. */
export function rateLimit(key: string, limit = 30, now = Date.now()) {
  const buckets = rateState.__ideahubLimits ??= new Map();
  if (buckets.size > 10000) for (const [id, value] of buckets) if (now - value.start > 60000) buckets.delete(id);
  if (!buckets.has(key) && buckets.size >= 10000) throw new AppError(429, "RATE_LIMIT", "Máy chủ đang bận, hãy thử lại sau một phút");
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= 60000) { buckets.set(key, { start: now, count: 1 }); return; }
  if (bucket.count >= limit) throw new AppError(429, "RATE_LIMIT", "Bạn gửi hơi nhanh, hãy chờ một phút rồi thử lại");
  bucket.count++;
}
