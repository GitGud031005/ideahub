/** Track native panning through finger release and the following momentum frames. */
export class RoomScrollActivity {
  private touching = false;
  private lastMotion = -Infinity;
  touchStart(now: number) { this.touching = true; this.lastMotion = now; }
  touchEnd(now: number) { this.touching = false; this.lastMotion = now; }
  scroll(now: number) { this.lastMotion = now; }
  active(now: number) { return this.touching || now - this.lastMotion < 200; }
}

export type RoomScrollAnchor = { id: string; offset: number };
type ScrollPane = { scrollTop: number; scrollHeight: number; clientHeight: number };

/** Never write an unchanged offset: even a no-op assignment can stop native inertia. */
export function restoreRoomScroll(box: ScrollPane, moving: boolean, followingOldest: boolean, anchorDelta?: number) {
  if (moving) return;
  const top = followingOldest ? Math.max(0, box.scrollHeight - box.clientHeight)
    : anchorDelta === undefined ? box.scrollTop : box.scrollTop + anchorDelta;
  if (Math.abs(top - box.scrollTop) >= 1) box.scrollTop = top;
}
