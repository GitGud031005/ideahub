# Mobile room momentum scrolling

## Diagnosis and correction

The empty comment outbox previously returned a new array on every render. This invalidated the merged thread memo whenever read-visibility state changed during scrolling. The layout effect then assigned `scrollTop` from a viewport anchor, including zero-distance assignments. On affected WebKit versions a programmatic scroll can stop native touch inertia. This is a code-level diagnosis; physical-device reproduction was not available.

The fix keeps the empty outbox reference stable, skips unchanged/subpixel scroll writes, and suppresses automatic anchor/bottom adjustments throughout touch contact and subsequent scrolling frames. Anchors now use content coordinates, excluding the reader's scroll displacement. Article geometry is sampled once after scrolling settles instead of scanning the list on every animation frame. Touch observation is passive; no synthetic inertia or touch cancellation is introduced. Explicit notification navigation and sort changes retain their existing behavior. The message pane also declares touch overflow scrolling.

## Validation

- TypeScript passed.
- Full automated suite: 124 passed, 1 optional integration test skipped, 0 failed.
- Production build passed.
- Four new regression tests cover no-op writes on repeated read renders, finger release followed by momentum frames, content insertion above a stationary reader, and oldest-order following without repeated bottom writes.
- Physical iPhone/Android inertia is not certified by these tests. A viewport-sized desktop browser cannot establish native device momentum behavior.
