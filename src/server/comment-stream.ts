import type { RoomActivity } from "@/lib/domain";

/** Read shared storage, rather than an instance-local event bus, for Vercel compatibility. */
export function activityStream(
  request: Request,
  initial: string,
  read: () => Promise<string | null>,
  { interval = 1000, duration = 50000, event = "comments-changed" } = {},
) {
  const encoder = new TextEncoder();
  let cancelled = false;
  let stop = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false, timer: ReturnType<typeof setTimeout> | undefined;
      let version = initial, ticks = 0;
      const deadline = setTimeout(() => stop(), duration);
      stop = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        clearTimeout(deadline);
        request.signal.removeEventListener("abort", stop);
        if (!cancelled) controller.close();
      };
      const send = (event: string) => controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
      async function poll() {
        try {
          const idea = await read();
          if (closed) return;
          if (idea===null) { send("auth-required"); stop(); return; }
          // A stalled client must not retain an unbounded stream buffer.
          if (controller.desiredSize !== null && controller.desiredSize <= 0) { stop(); return; }
          const next = idea;
          if (next !== version) { version = next; send(event); }
          else if (++ticks % 10 === 0) controller.enqueue(encoder.encode(": heartbeat\n\n"));
          timer = setTimeout(poll, interval);
        } catch {
          if (!closed) { send("stream-error"); stop(); }
        }
      }
      request.signal.addEventListener("abort", stop, { once: true });
      if (request.signal.aborted) { stop(); return; }
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      // Reconnects always refresh the cache, including messages missed while offline.
      send(event);
      timer = setTimeout(poll, interval);
    },
    cancel() { cancelled = true; stop(); },
  });
  return new Response(body, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  } });
}

const roomVersion=(room:RoomActivity)=>`${room.commentCount}:${room.memberCount}:${room.version??"0"}`;
export function commentStream(request:Request,initial:RoomActivity,read:()=>Promise<RoomActivity|null>,options={}){
 return activityStream(request,roomVersion(initial),async()=>{const room=await read();return room?roomVersion(room):null;},options);
}
