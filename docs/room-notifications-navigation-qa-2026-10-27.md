# Room notifications and message navigation

## Behavior implemented

Every new comment or reply creates one inbox record for every other current room member, including replies by the same author to their own root or reply. Mention and direct-reply labels take priority over the general message label. Room mute retains inbox history and suppresses popup, sound and device push. The sender receives no notification for their own send. Retried sends and ordinary edits do not create duplicate notifications or notify members who joined later.

A signed-in inbox SSE connection checks the viewer's notification version independently of the current room, with HTTP polling and focus/reconnect recovery. Worker push deliveries also refresh the inbox. Foreground sounds require a real page gesture to unlock browser audio; each eligible arrival is queued separately. Device push keeps a separate tag per notification, uses high urgency and drains multiple batches. Reading the inbox no longer silently discards a queued push.

Selecting a notification loads the target and ancestors from an authenticated uncached context endpoint when the current snapshot lacks it. The UI releases buffered messages, expands all ancestors and waits for rendering. A ready service-worker client navigates within the app; an unready client falls back to normal navigation. Notification read requests do not delay navigation. Only the chat pane scrolls.

## QA and correction

Embedded PostgreSQL and memory repository checks cover untagged roots, eight consecutive self-replies, replies to another author, no self-notification, mute, retries, edits, late membership, ancestor context and wrong-room 404. API checks cover authenticated inbox SSE and context routes. Service-worker tests cover account changes, separate push tags and reuse of a ready room without reload. Browser audio tests cover gesture unlock and separate queued alerts.

The first preview commit `0c7c9e24d056bcf8f9d3913d0c2fefabbeca6718` was checked with actual React components and isolated synthetic data in Chrome/Blink. A 390x844 stale-snapshot deep link opened all 12 ancestors, focused the target, left document scroll at zero, and showed no horizontal overflow. A 375x667 notification click also reached the nested target. New reply arrival updated the inbox badge through the live event path.

Additional 320x568 QA found that center alignment could leave part of the target below the chat pane when the viewport/composer resized after closing the notification dialog. The local correction places the target 16px below the pane top, waits two animation frames, and observes pane/content size changes while locating. Touch, wheel and navigation keys cancel an outstanding reveal. A loading status is shown while locating. This final geometry correction has not yet been browser-verified: auto-review blocked the subsequent public GitHub update, and the cloud browser could not reach the executor's loopback preview server.

## Automated validation

Final `npm run check`: 121 tests total, 120 passed, 1 optional integration test skipped, 0 failures; TypeScript passed. `git diff --check` passed. Production compilation also passed during implementation.

## Release state and limits

The additive database constraint allowing the new `message` kind was applied and verified; no existing notification rows were removed. Security advisors report the same pre-existing INFO-only server-SQL RLS notices.

Production main is still `1b3583ef518b439b8c7f1e57aeaa2d3fe1e9809f`. Final source changes are local pending explicit approval to publish updated code to the existing public repository `GitGud031005/ideahub` and deploy production. The initial preview is not the final geometry correction.

Physical iOS Safari/PWA, Android Chrome, OS sound, background delivery and real keyboards have not been verified. No claim is made that all devices or notification timing are fully certified. No real chat messages were sent to other users for testing.
