import { timingSafeEqual } from "node:crypto";
import { errorResponse, json } from "@/server/http";
import { meetings } from "@/server/meetings/runtime";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  const secret = process.env.IDEAHUB_MEETING_JOB_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected))
    return json({ error: "Unauthorized" }, 401);
  // Cleanup must keep running after the pilot flag is turned off.
  try {
    const { service } = meetings();
    const work = await Promise.all([service.workOne(), service.workOne(), service.workOne()]);
    return json({ ok: true, processed: work.filter(Boolean).length });
  } catch (error) { return errorResponse(error); }
}
