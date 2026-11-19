import { createHash, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { databaseConfig } from "../../../src/server/database";
import { meetingTiming } from "../../../src/server/meetings/config";
import { LiveKitMeetingProvider } from "../../../src/server/meetings/provider";
import { MeetingService } from "../../../src/server/meetings/service";
import { MeetingStore } from "../../../src/server/meetings/store";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

let service: MeetingService | undefined;
function worker() {
  if (service) return service;
  const url = Deno.env.get("MEETING_LIVEKIT_URL");
  const key = Deno.env.get("MEETING_LIVEKIT_KEY");
  const secret = Deno.env.get("MEETING_LIVEKIT_SECRET");
  const endpoint = url && URL.parse(url);
  if (!endpoint || endpoint.protocol !== "wss:" || endpoint.username || endpoint.password ||
      endpoint.pathname !== "/" || endpoint.search || endpoint.hash || !key || !secret) {
    throw new Error("Invalid meeting worker configuration");
  }
  const timing = meetingTiming({
    IDEAHUB_MEETING_TEST_SECONDS: Deno.env.get("MEETING_TEST_SECONDS"),
    IDEAHUB_MEETING_TEST_WARNING_SECONDS: Deno.env.get("MEETING_TEST_WARNING_SECONDS"),
  });
  const pool = new Pool(databaseConfig({ DATABASE_URL: Deno.env.get("MEETING_WORKER_DATABASE_URL") }));
  pool.on("error", () => console.error("Meeting worker idle connection failed"));
  service = new MeetingService(new MeetingStore(pool), new LiveKitMeetingProvider(endpoint.href, key, secret), Date.now, timing);
  return service;
}

const digest = (value: string) => createHash("sha256").update(value).digest();
Deno.serve(async request => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }
  const secret = Deno.env.get("MEETING_SWEEP_SECRET");
  if (!secret || secret.length < 32 ||
      !timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const processed = await worker().workOne();
    return Response.json({ ok: true, processed: Number(processed) });
  } catch {
    console.error("Meeting sweeper failed");
    return Response.json({ error: "Sweep failed" }, { status: 503 });
  }
});
