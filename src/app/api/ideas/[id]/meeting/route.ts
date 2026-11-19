import { z } from "zod";
import { getAuthService } from "@/server/auth";
import { AppError, notFound } from "@/server/errors";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { meetingPilot } from "@/server/meetings/config";
import { meetings } from "@/server/meetings/runtime";
import { getSessionToken } from "@/server/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), afterId: z.uuid().nullable() }).strict(),
  z.object({ action: z.literal("join"), sessionId: z.uuid() }).strict(),
]);

async function authorize(request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !meetingPilot(id)) throw notFound();
  const auth = getAuthService();
  const user = await auth.user(getSessionToken(request));
  if (!user) throw new AppError(401, "AUTH_REQUIRED", "Đăng nhập để vào phòng họp");
  return { id, auth, user };
}

export async function GET(request: Request, context: Context) {
  try {
    const { id, user } = await authorize(request, context);
    return json(await meetings().service.status(id, user.id));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id, auth, user } = await authorize(request, context);
    const input = await readJson(request, action);
    await auth.limit(`meeting:${input.action}:${user.id}`, input.action === "start" ? 10 : 20, 60);
    const { service } = meetings();
    return input.action === "start"
      ? json(await service.start(id, user.id, input.afterId))
      : json(await service.join(id, user, input.sessionId));
  } catch (error) { return errorResponse(error); }
}
