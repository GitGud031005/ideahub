import { commentQuerySchema, createCommentSchema, createIdeaSchema, ideaQuerySchema } from "@/lib/validation";
import type { IdeaRepository } from "./repository";
import { getRepository, storageMode } from "./container";
import { AppError } from "./errors";
import { getDatabasePool } from "./database";
import { assertSameOrigin, errorResponse, json, rateLimit, readJson } from "./http";
import { getSessionToken, sessionCookie } from "./session";
import { AuthService, getAuthService } from "./auth";
import { loginSchema, registerSchema, profileSchema, passwordChangeSchema } from "@/lib/auth-validation";
import { getRecapService, type RecapService } from "./recaps";
import { z } from "zod";
import { CloudinaryAvatars, readAvatar } from "./cloudinary";
import { googleConfigured } from "./google-oauth";
import { commentStream } from "./comment-stream";

export async function handleApi(request: Request, path: string[], repository?: IdeaRepository, authentication?: AuthService, recapping?: RecapService, avatars = new CloudinaryAvatars()): Promise<Response> {
  try {
    const method = request.method, route = path.join("/");
    if (method !== "GET" && method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: "GET, POST" });
    if (method === "POST") assertSameOrigin(request);
    if (route === "health" && method === "GET") {
      const storage = storageMode();
      if (storage === "postgres") {
        try { await getDatabasePool().query("SELECT i.id FROM public.ideas i LEFT JOIN ideahub_private.accounts a ON false LIMIT 0"); }
        catch { throw new AppError(503, "DATABASE_UNAVAILABLE", "Chưa kết nối được database"); }
      }
      return json({ status: "ok", storage, persistent: storage !== "memory" });
    }
    if(route==="auth/config"&&method==="GET")return json({google:googleConfigured(),avatarUpload:avatars.configured()});
    const auth = authentication ?? getAuthService(), token = getSessionToken(request);
    if(route==="auth/avatar"&&method==="POST"){
      const user=await auth.user(token);if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để cập nhật ảnh đại diện");
      await auth.limit(`avatar:${user.id}`,10,900);await auth.limit("avatar:global",200,86400);
      if(!avatars.configured())throw new AppError(503,"AVATAR_CONFIG","Chức năng ảnh đại diện chưa kết nối Cloudinary");
      const image=await readAvatar(request),url=await avatars.upload(user.id,image);
      return json({user:await auth.setAvatar(user.id,url),storage:storageMode()});
    }
    if ((route === "auth/profile" || route === "auth/password") && method === "POST") {
      const user=await auth.user(token);
      if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để chỉnh sửa hồ sơ");
      await auth.limit(`${route}:${user.id}`,route.endsWith("password")?5:20,900);
      if(route.endsWith("profile")){
        const input=await readJson(request,profileSchema);
        return json({user:await auth.updateName(user.id,input.name),storage:storageMode()});
      }
      const result=await auth.changePassword(user,await readJson(request,passwordChangeSchema));
      return json({user:result.user,storage:storageMode()},200,{"Set-Cookie":sessionCookie(result.token)});
    }
    if (route === "session" && method === "GET") {
      const user = await auth.user(token);
      return json({ user, storage: storageMode() }, 200, !user && token ? { "Set-Cookie": sessionCookie("", true) } : undefined);
    }
    if (route === "auth/logout" && method === "POST") {
      await auth.logout(token);
      return json({ user: null, storage: storageMode() }, 200, { "Set-Cookie": sessionCookie("", true) });
    }
    if ((route === "auth/login" || route === "auth/register") && method === "POST") {
      const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "local";
      await auth.limit(`${route}:ip:${ip}`, route.endsWith("register") ? 10 : 60, 900);
      // A shared database bucket also limits attempts across serverless instances.
      await auth.limit(`${route}:global`, route.endsWith("register") ? 200 : 1000, 900);
      let result: Awaited<ReturnType<AuthService["login"]>>;
      if (route.endsWith("register")) {
        const input = await readJson(request, registerSchema);
        await auth.limit(`${route}:username:${input.username}`, 12, 900);
        result = await auth.register(input, token);
      } else {
        const input = await readJson(request, loginSchema);
        await auth.limit(`${route}:username:${input.username}`, 12, 900);
        result = await auth.login(input, token);
      }
      return json({ user: result.user, storage: storageMode() }, route.endsWith("register") ? 201 : 200, { "Set-Cookie": sessionCookie(result.token) });
    }
    if (!/^ideas(?:\/[^/]+(?:\/(?:join|comments(?:\/stream)?|recaps(?:\/[^/]+)?))?)?$/.test(route)) throw new AppError(404, "NOT_FOUND", "Không tìm thấy API này");
    const user = await auth.user(token), repo = repository ?? getRepository(), url = new URL(request.url);
    if ((method === "POST" || path[2] === "comments" || path[2] === "recaps") && !user) throw new AppError(401, "AUTH_REQUIRED", "Đăng nhập để tham gia cùng mọi người");
    const viewerId = user?.id ?? "__anonymous__";
    if (method === "POST") rateLimit(`${user!.id}:write`);
    if (path.length === 1) {
      if (method === "GET") return json(await repo.listIdeas(viewerId, ideaQuerySchema.parse(Object.fromEntries(url.searchParams))));
      return json(await repo.createIdea(user!, await readJson(request, createIdeaSchema)), 201);
    }
    const id = path[1];
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new AppError(400, "INVALID_ID", "Mã ý tưởng không hợp lệ");
    if (path[2] === "recaps") {
      const service = recapping ?? getRecapService();
      if (path.length === 4) {
        if (method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: "GET" });
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(path[3])) throw new AppError(400, "INVALID_ID", "Mã recap không hợp lệ");
        return json(await service.get(id, path[3], user!.id));
      }
      if (method === "GET") {
        const query = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().parse(Object.fromEntries(url.searchParams));
        return json(await service.list(id, user!.id, query.offset));
      }
      return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Recap được tạo tự động theo ngày và tuần có thảo luận" } }, 405, { Allow: "GET" });
    }
    if (path.length === 2 && method === "GET") return json(await repo.getIdea(id, viewerId));
    if (path[2] === "join" && method === "POST") return json(await repo.joinIdea(id, user!.id));
    if (path[2] === "comments") {
      if (path[3] === "stream") {
        if (method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: "GET" });
        assertSameOrigin(request);
        const initial = await repo.getIdea(id, user!.id);
        return commentStream(request, initial, async () => {
          const viewer = await auth.user(token);
          return viewer ? repo.getIdea(id, viewer.id) : null;
        });
      }
      if (method === "GET") { const query = commentQuerySchema.parse(Object.fromEntries(url.searchParams)); return json(await repo.listComments(id, query.cursor, query.limit)); }
      return json(await repo.createComment(id, user!, await readJson(request, createCommentSchema)), 201);
    }
    return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: path[2] === "join" ? "POST" : "GET" });
  } catch (error) { return errorResponse(error); }
}
