import { errorResponse, json } from "@/server/http";
import { meetings } from "@/server/meetings/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("authorization");
    if (!signature || signature.length > 4096) return json({ error: "Invalid webhook signature" }, 401);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing webhook body" }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > 64_000) {
        await reader.cancel();
        return json({ error: "Webhook body too large" }, 413);
      }
      chunks.push(result.value);
    }
    const { provider, store } = meetings();
    const event = await provider.webhooks.receive(Buffer.concat(chunks).toString("utf8"), signature).catch(() => null);
    if (!event) return json({ error: "Invalid webhook signature or payload" }, 401);
    const { room } = event;
    if (room?.sid && /^ih-meeting-[0-9a-f-]{36}$/.test(room.name) &&
        (event.event === "participant_joined" || event.event === "participant_left" ||
         event.event === "room_started" || event.event === "room_finished"))
      await store.signalRoom(room.name, room.sid, event.event, Date.now());
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
