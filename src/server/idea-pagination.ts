import { z } from "zod";
import type { IdeaQuery } from "@/lib/domain";
import { normalize } from "@/lib/format";
import { AppError } from "./errors";

const timestamp = z.string().datetime().refine(value => new Date(value).getUTCFullYear() > 0);
const cursorSchema = z.object({
  snapshot: timestamp,
  createdAt: timestamp,
  id: z.string().min(1).max(100),
  members: z.number().int().min(0).max(2147483647),
  scope: z.string().max(500),
}).strict();
export type IdeaCursor = z.infer<typeof cursorSchema>;
function scope(userId: string, query: IdeaQuery) {
  return JSON.stringify([userId, normalize(query.q), "personal-v2", query.view, query.sort]);
}
export function readIdeaCursor(userId: string, query: IdeaQuery): IdeaCursor | undefined {
  if (!query.cursor) return;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")));
    if (cursor.scope !== scope(userId, query) || query.offset) throw new Error("Cursor query changed");
    return cursor;
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "Vị trí ý tưởng không hợp lệ, hãy tải lại danh sách");
  }
}
export function writeIdeaCursor(userId: string, query: IdeaQuery, position: Omit<IdeaCursor, "scope">) {
  return Buffer.from(JSON.stringify({ ...position, scope: scope(userId, query) })).toString("base64url");
}
