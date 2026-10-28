# Live room updates and mobile inline replies

Date: 2026-10-28 (Asia/Ho_Chi_Minh)
Base commit: `63c0a4846424b2e5cc8a60408d931f3c03c45a64`
Status: local implementation and automated checks complete; browser acceptance and deployment pending.

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

## Browser acceptance still required

The synthetic fixture in `scripts/qa/room-live.tsx` uses fake users, comments, notifications, fetch responses, and event streams. It deliberately delivers the inbox event before the comment-stream event. The preview wrapper is `public/__qa_mobile.html`; its iframe renders `/qa-room-preview`.

Before production release, verify:

1. Click a notification, then inject a child, nested reply, and sibling. Check both sort orders, rendered arrivals, exact read receipts, and absence of duplicate alerts for visible messages.
2. Check a new sibling inserted above the current scroll anchor: the live tree must update, and any offscreen arrival must remain discoverable without disrupting native momentum.
3. Collapse a parent while a descendant remains expanded; incoming hidden replies must retain an appropriate unread/new-message indication.
4. Enter a main-composer draft, open an inline reply, resize the visual viewport, type, and cancel. Confirm the reply/send controls stay accessible and the original draft returns.
5. Verify physical iOS and Android keyboard/pan behavior, inertia, background delivery, and OS notification-click navigation. None of these physical-device checks has been completed for this patch.

## Publication boundary

Automatic approval review rejected both a compiled QA bundle upload and a subsequent source-tree upload to the public repository `https://github.com/GitGud031005/ideahub`. Its reason was missing explicit authorization for publishing this exact application/QA source payload to that public destination. Neither attempt published these changes. Production remains at the base commit above.

Requested next publication: application changes, regression tests, this report, and synthetic QA source to the existing preview branch `feat/push-opt-in`; after browser acceptance, publish the application changes/tests/report to `main`, triggering the existing Vercel deployment at `https://ideahub-umber.vercel.app/`.

Preview-only files `public/__qa_mobile.html` and `src/app/qa-room-preview/page.tsx` must be excluded from the production tree. No real user messages, credentials, or production screenshots are part of the QA fixture.
