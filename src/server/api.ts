import {allowedPushEndpoint} from "./web-push";
import { editCommentSchema, commentQuerySchema, createCommentSchema, createIdeaSchema, ideaQuerySchema, updateIdeaStatusSchema } from "@/lib/validation";
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
import { applicationCache } from "./redis-cache";
import { activityStream, commentStream } from "./comment-stream";
import { randomUUID } from "node:crypto";
import { CloudinaryDiscussionFiles, readDiscussionFile } from "./discussion-uploads";
import { publicAttachment } from "./attachment-record";
import { GeminiTagSuggester, type TagSuggester } from "./gemini-tags";
import { tagSuggestionInputSchema } from "@/lib/validation";

export async function handleApi(request: Request, path: string[], repository?: IdeaRepository, authentication?: AuthService, recapping?: RecapService, avatars = new CloudinaryAvatars(), files = new CloudinaryDiscussionFiles(), tagger:TagSuggester = new GeminiTagSuggester()): Promise<Response> {
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
      const verify=new URL(request.url).searchParams.get("cache")==="verify";
      if(verify)rateLimit("health:cache-probe",4);
      const cache={...(verify?await applicationCache.verify():{configured:applicationCache.configured}),enabled:applicationCache.enabled};
      return json({ status: "ok", storage, persistent: storage !== "memory",cache });
    }
    if(route==="auth/config"&&method==="GET")return json({google:googleConfigured(),avatarUpload:avatars.configured()});
    const auth = authentication ?? getAuthService(), token = getSessionToken(request);
    if(route==="auth/avatar"&&method==="POST"){
      const user=await auth.user(token);if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để cập nhật ảnh đại diện");
      await auth.limit(`avatar:${user.id}`,10,900);await auth.limit("avatar:global",200,86400);
      if(!avatars.configured())throw new AppError(503,"AVATAR_CONFIG","Chức năng ảnh đại diện chưa kết nối Cloudinary");
      const image=await readAvatar(request),url=await avatars.upload(user.id,image);
      const updated=await auth.setAvatar(user.id,url);await applicationCache.invalidate();
      return json({user:updated,storage:storageMode()});
    }
    if ((route === "auth/profile" || route === "auth/password") && method === "POST") {
      const user=await auth.user(token);
      if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để chỉnh sửa hồ sơ");
      await auth.limit(`${route}:${user.id}`,route.endsWith("password")?5:20,900);
      if(route.endsWith("profile")){
        const input=await readJson(request,profileSchema);
        const updated=await auth.updateName(user.id,input.name);await applicationCache.invalidate();
        return json({user:updated,storage:storageMode()});
      }
      const result=await auth.changePassword(user,await readJson(request,passwordChangeSchema));
      return json({user:result.user,storage:storageMode()},200,{"Set-Cookie":sessionCookie(result.token)});
    }
    if (route === "session" && method === "GET") {
      const user = await auth.user(token);
      return json({ user, storage: storageMode() }, 200, !user && token ? { "Set-Cookie": sessionCookie("", true) } : undefined);
    }
    if (route === "auth/logout" && method === "POST") {
      const user=await auth.user(token),endpoint=request.headers.get("x-push-endpoint");if(user&&endpoint)await (repository??getRepository()).removePush(user.id,endpoint);
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
    if(route==="ideas/suggest-tags"){
      const user=await auth.user(token);if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để gợi ý tags");
      if(method!=="POST")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Dùng POST để gợi ý tags"}},405,{Allow:"POST"});
      const input=await readJson(request,tagSuggestionInputSchema);
      await auth.limit(`tag-suggestions:${user.id}`,12,3600);
      await auth.limit("tag-suggestions:global",150,86400);
      return json(await tagger.suggest(input));
    }
    if(route==="unread"){
      const user=await auth.user(token);if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để xem tin chưa đọc");
      if(method!=="GET")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Phương thức không được hỗ trợ"}},405,{Allow:"GET"});
      return json(await (repository??getRepository()).unreadCounts(user.id));
    }
    if(route==="notifications"||route.startsWith("notifications/")||route.startsWith("push/")){
      const user=await auth.user(token);if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để xem thông báo");
      const repo=repository??getRepository(),url=new URL(request.url);
      if(method==="POST")await auth.limit(`notifications:${user.id}`,120,60);
      if(route==="notifications/stream"&&method==="GET"){
        assertSameOrigin(request);return activityStream(request,await repo.notificationVersion(user.id),async()=>{
          const viewer=await auth.user(token);return viewer?.id===user.id?repo.notificationVersion(user.id):null;
        },{event:"notifications-changed"});
      }
      if(route==="notifications"&&method==="GET"){const query=z.object({unread:z.enum(["0","1"]).default("0"),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(Object.fromEntries(url.searchParams));return json(await repo.listNotifications(user.id,query.unread==="1",query.offset));}
      if(route==="notifications/read"&&method==="POST"){const input=await readJson(request,z.object({ids:z.union([z.literal("all"),z.array(z.string().max(100)).min(1).max(100)])}).strict());await repo.readNotifications(user.id,input.ids);return json({ok:true});}
      if(route==="push/config"&&method==="GET")return json({publicKey:(await repo.pushKeys()).publicKey});
      if(route==="push/subscribe"&&method==="POST"){const input=await readJson(request,z.object({expirationTime:z.number().nullable().optional(),endpoint:z.string().url().max(2048).refine(allowedPushEndpoint),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)}).strict()}).strict());await repo.savePush(user.id,{endpoint:input.endpoint,keys:input.keys});return json({ok:true});}
      if(route==="push/unsubscribe"&&method==="POST"){const input=await readJson(request,z.object({endpoint:z.string().max(2048)}).strict());await repo.removePush(user.id,input.endpoint);return json({ok:true});}
      throw new AppError(404,"NOT_FOUND","Không tìm thấy API này");
    }
    if (!/^ideas(?:\/[^/]+(?:\/(?:delete|join|read|status|members|search|notification-settings|attachments(?:\/[^/]+)?|comments(?:\/(?:stream|[^/]+\/(?:pin|edit|context)))?|recaps(?:\/[^/]+)?))?)?$/.test(route)) throw new AppError(404, "NOT_FOUND", "Không tìm thấy API này");
    const user = await auth.user(token), repo = repository ?? getRepository(), url = new URL(request.url);
    if ((method === "POST" || path[2] === "comments" || path[2] === "recaps" || path[2]==="attachments" || path[2]==="read") && !user) throw new AppError(401, "AUTH_REQUIRED", "Đăng nhập để tham gia cùng mọi người");
    const viewerId = user?.id ?? "__anonymous__";
    if (method === "POST") rateLimit(`${user!.id}:${path[2]==="read"?"read":"write"}`,path[2]==="read"?120:30);
    if (path.length === 1) {
      if (method === "GET") return json(await repo.listIdeas(viewerId, ideaQuerySchema.parse(Object.fromEntries(url.searchParams))));
      return json(await repo.createIdea(user!, await readJson(request, createIdeaSchema)), 201);
    }
    const id = path[1];
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new AppError(400, "INVALID_ID", "Mã ý tưởng không hợp lệ");
    if(path[2]==="delete"){
      if(method!=="POST")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Dùng POST để xóa idea"}},405,{Allow:"POST"});
      await readJson(request,z.object({}).strict());
      await repo.deleteIdea(id,user!.id);return json({ok:true});
    }
    if(path[2]==="members"||path[2]==="search"||path[2]==="notification-settings"){
      if(!user)throw new AppError(401,"AUTH_REQUIRED","Đăng nhập để tham gia cùng mọi người");
      if(path[2]==="members"&&method==="GET")return json(await repo.listMembers(id,user.id));
      if(path[2]==="search"&&method==="GET"){const q=z.object({q:z.string().trim().max(120).default(""),author:z.string().max(100).default(""),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().parse(Object.fromEntries(url.searchParams));return json(await repo.searchComments(id,user.id,q.q,q.author,q.offset));}
      if(path[2]==="notification-settings"){if(method==="GET")return json({muted:await repo.roomMuted(id,user.id)});const input=await readJson(request,z.object({muted:z.boolean()}).strict());await repo.muteRoom(id,user.id,input.muted);return json(input);}
      return json({error:{code:"METHOD_NOT_ALLOWED",message:"Phương thức không được hỗ trợ"}},405);
    }
    if(path[2]==="comments"&&path.length===5&&path[4]==="context"){
      if(method!=="GET")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Dùng GET để mở bình luận"}},405,{Allow:"GET"});
      return json(await repo.getCommentContext(id,path[3]));
    }
    if(path[2]==="comments"&&path.length===5&&path[4]==="edit"){if(method!=="POST")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Dùng POST để sửa bình luận"}},405,{Allow:"POST"});return json(await repo.editComment(id,path[3],user!,await readJson(request,editCommentSchema)));}
    if (path[2] === "status") {
      if (method !== "POST") return json({error:{code:"METHOD_NOT_ALLOWED",message:"Dùng POST để thay đổi phân loại"}},405,{Allow:"POST"});
      const input = await readJson(request, updateIdeaStatusSchema);
      return json(await repo.setIdeaStatus(id, user!.id, input.status));
    }
    if(path[2]==="attachments"){
      if(path.length===4&&method==="GET")return files.download(await repo.getAttachment(id,path[3],user!.id),url.searchParams.get("download")==="1");
      if(path.length!==3||method!=="POST")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Phương thức không được hỗ trợ"}},405);
      if(!(await repo.getIdea(id,user!.id)).joined)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để gửi tệp");
      await auth.limit(`files:${user!.id}`,60,3600);await auth.limit("files:global",500,86400);
      const file=await readDiscussionFile(request),assetId=await files.upload(file),attachmentId=randomUUID();
      const attachment={id:attachmentId,ideaId:id,ownerId:user!.id,assetId,name:file.name,mime:file.mime,size:file.size,kind:file.kind,url:`/api/ideas/${encodeURIComponent(id)}/attachments/${attachmentId}`,commentId:null,createdAt:new Date().toISOString()};
      await repo.saveAttachment(attachment);return json(publicAttachment(attachment),201);
    }
    if(path[2]==="comments"&&path.length===5&&path[4]==="pin"){
      if(method!=="POST")return json({error:{code:"METHOD_NOT_ALLOWED",message:"Dùng POST để thay đổi ghim"}},405,{Allow:"POST"});
      const input=await readJson(request,z.object({pinned:z.boolean()}).strict());
      await repo.pinComment(id,path[3],user!.id,input.pinned);return json({ok:true});
    }
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
    if(path[2]==="read"){
      if(method==="GET")return json({unreadIds:await repo.unreadCommentIds(id,user!.id)});
      const commentId=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
      const body=await readJson(request,z.union([
        z.object({commentIds:z.array(commentId).min(1).max(200)}).strict(),
        z.object({commentId}).strict(),
      ]));
      await repo.markRead(id,user!.id,"commentIds" in body?body.commentIds:body.commentId);return json({ok:true});
    }
    if (path[2] === "join" && method === "POST") return json(await repo.joinIdea(id,user!.id,user!));
    if (path[2] === "comments") {
      if (path[3] === "stream") {
        if (method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: "GET" });
        assertSameOrigin(request);
        const initial = await repo.getActivity(id);
        return commentStream(request, initial, async () => {
          const viewer = await auth.user(token);
          return viewer ? repo.getActivity(id) : null;
        });
      }
      if (method === "GET") { const query = commentQuerySchema.parse(Object.fromEntries(url.searchParams)); return json(await repo.listComments(id, query.cursor, query.limit)); }
      return json(await repo.createComment(id, user!, await readJson(request, createCommentSchema)), 201);
    }
    return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Phương thức không được hỗ trợ" } }, 405, { Allow: path[2] === "join" ? "POST" : "GET" });
  } catch (error) { return errorResponse(error); }
}
