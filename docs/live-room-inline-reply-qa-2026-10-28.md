# Live room updates and mobile inline replies

Date: 2026-10-28 (Asia/Ho_Chi_Minh)
Base commit: `63c0a4846424b2e5cc8a60408d931f3c03c45a64`
Status: local automated checks and synthetic browser acceptance passed; production deployment pending.

## Reported problems

1. After entering a room through a notification, later messages could remain absent from the rendered conversation while notifications continued to appear.
2. On mobile, the main “Thêm góc nhìn của bạn” composer occupied the remaining space above the keyboard and covered an active inline reply.

## Changes prepared

- The room feed now renders every refreshed comment snapshot. The new-message marker records unseen arrivals without withholding those comments from the tree or duplicating them on release.
- Notification navigation opens the target's reply branch as well as its ancestors. New descendants of that open path stay expanded; existing collapsed branches remain collapsed.
- Marker logic checks the entire ancestor path, including collapsed ancestors above an expanded descendant.
- Edge-following is recalculated after navigation. Existing touch/momentum guards remain in place.
- When the notification stream arrives before the room stream, the foreground room is refreshed before deciding whether to show a toast. Visible-room receipts no longer depend on browser focus, but still require document visibility, the matching account/room, visible message geometry, and an unobscured pane.
- On narrow screens and short landscape viewports, opening an inline reply/edit hides the mounted main composer while preserving its draft. Canceling the inline form restores the main composer.
- Inline textarea and send controls are brought into the visible chat area after focus, input, and viewport resizing. Ordinary chat scroll events do not invoke this placement hook.

## Validation completed

- `npm run check`: TypeScript passed; 134 tests total, 133 passed, 1 skipped, 0 failed.
- `npm run build`: passed, including the preview-only `/qa-room-preview` route.
- `git diff --check`: passed.
- Regression cases cover continued/deep replies, out-of-order snapshots, intentionally collapsed paths, fresh feed snapshots after notification navigation, and new-message markers under collapsed ancestors.
- Geometry tests cover viewport heights 280, 320, 390, 480, 568, 667, and 844 pixels, with viewport offsets of 0 and 48 pixels. These are numeric tests, not device or browser screenshots.

## Synthetic browser acceptance completed

Chrome preview checks reproduced an additional sibling-insertion bug: preserving the previous anchor hid the newest sibling above the viewport. The patch now brings a new sibling into view when its notification target remains visible and the reader is idle. Touch/momentum and focused inline-editor guards remain active.

At 390×844, after clicking the notification, incoming sibling, child, and nested replies were visible inside the pane, with no toast and no unread badge. The synthetic inbox event preceded the room event.

Inline replies were checked at 390×480, 320×390, and 844×390. The main composer had zero rendered height; the textarea and send button fit inside the pane after viewport settlement. Canceling restored the original main-composer draft.

## Fixture and remaining device acceptance

The synthetic fixture in `scripts/qa/room-live.tsx` uses fake users, comments, notifications, fetch responses, and event streams. It deliberately delivers the inbox event before the comment-stream event. The preview wrapper is `public/__qa_mobile.html`; its iframe renders `/qa-room-preview`.

Before production release, verify:

1. Click a notification, then inject a child, nested reply, and sibling. Check both sort orders, rendered arrivals, exact read receipts, and absence of duplicate alerts for visible messages.
2. Check a new sibling inserted above the current scroll anchor: the live tree must update, and any offscreen arrival must remain discoverable without disrupting native momentum.
3. Collapse a parent while a descendant remains expanded; incoming hidden replies must retain an appropriate unread/new-message indication.
4. Enter a main-composer draft, open an inline reply, resize the visual viewport, type, and cancel. Confirm the reply/send controls stay accessible and the original draft returns.
5. Verify physical iOS and Android keyboard/pan behavior, inertia, background delivery, and OS notification-click navigation. None of these physical-device checks has been completed for this patch.

## Publication

The user explicitly approved publication to `GitGud031005/ideahub` and the preview-to-production workflow after an earlier automatic-review block. Preview builds and browser checks subsequently succeeded.

The production tree excludes `public/__qa_mobile.html` and `src/app/qa-room-preview/page.tsx`, and retains the original production frame security headers. The same-origin framing exception exists only on the synthetic preview branch. No real user messages, credentials, or production screenshots are included in the fixture.
