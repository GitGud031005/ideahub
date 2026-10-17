import { cronAuthorized, getRecapService } from "@/server/recaps";
import { errorResponse, json } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: { code: "UNAUTHORIZED", message: "Không được phép gọi tác vụ này" } }, 401);
  try { return json(await getRecapService().runDaily()); } catch (error) { return errorResponse(error); }
}
