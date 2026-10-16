import { commentQuerySchema, createCommentSchema, createIdeaSchema, ideaQuerySchema } from "@/lib/validation";
import type { IdeaRepository } from "./repository";
import { getRepository, storageMode } from "./container";
import { AppError } from "./errors";
import { assertSameOrigin, errorResponse, json, rateLimit, readJson } from "./http";
import { createSessionToken, getSessionUser, requireSession, sessionCookie, verifySessionToken } from "./session";

export async function handleApi(request: Request, path: string[], repository?: IdeaRepository): Promise<Response> {
  try {
    const method = request.method, route = path.join("/");
    if (method !== "GET" && method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: "GET, POST" });
    if (method === "POST") assertSameOrigin(request);
    if (route === "health" && method === "GET") return json({ status: "ok", storage: storageMode(), persistent: storageMode() === "json" });
    if (route === "session" && method === "GET") {
      const existing = getSessionUser(request);
      if (existing) return json({ user: existing, storage: storageMode() });
      const token = createSessionToken();
      return json({ user: verifySessionToken(token), storage: storageMode() }, 200, { "Set-Cookie": sessionCookie(token) });
    }
    if (!/^ideas(?:\/[^/]+(?:\/(?:join|comments))?)?$/.test(route)) throw new AppError(404, "NOT_FOUND", "Không tìm thấy API này");
    const user = requireSession(request), repo = repository ?? getRepository(), url = new URL(request.url);
    if (method === "POST") rateLimit(`${user.id}:write`);
    if (path.length === 1) {
      if (method === "GET") return json(await repo.listIdeas(user.id, ideaQuerySchema.parse(Object.fromEntries(url.searchParams))));
      return json(await repo.createIdea(user, await readJson(request, createIdeaSchema)), 201);
    }
    const id = path[1];
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new AppError(400, "INVALID_ID", "Mã ý tưởng không hợp lệ");
    if (path.length === 2 && method === "GET") return json(await repo.getIdea(id, user.id));
    if (path[2] === "join" && method === "POST") return json(await repo.joinIdea(id, user.id));
    if (path[2] === "comments") {
      if (method === "GET") { const query = commentQuerySchema.parse(Object.fromEntries(url.searchParams)); return json(await repo.listComments(id, query.cursor, query.limit)); }
      return json(await repo.createComment(id, user, await readJson(request, createCommentSchema)), 201);
    }
    return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: path[2] === "join" ? "POST" : "GET" });
  } catch (error) { return errorResponse(error); }
}
