import type { ApiErrorPayload, CommentsPage, Comment } from "./domain";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorPayload | null)?.error;
    if (response.status === 401 && error?.code === "AUTH_REQUIRED" && typeof window !== "undefined") window.dispatchEvent(new Event("ideahub:auth-required"));
    throw new ApiError(response.status, error?.code || "REQUEST_FAILED", error?.message || "Không thể kết nối máy chủ", error?.fields);
  }
  return body as T;
}
export async function fetchComments(ideaId: string, signal?: AbortSignal) {
  const items: Comment[] = [], seen = new Set<string>(); let cursor: string | null = null;
  do {
    const page: CommentsPage = await api(`/ideas/${encodeURIComponent(ideaId)}/comments?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("Không thể tải tiếp bình luận");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}
