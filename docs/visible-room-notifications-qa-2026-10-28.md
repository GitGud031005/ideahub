# Suppress alerts for messages being read in the open room

## Behavior

A foreground notification waits briefly for the independent room stream to render its target. If that exact comment is visible in the focused room, under the same account, and not hidden by a dialog or mobile drawer, the app records a read receipt instead of displaying a toast or playing a sound. Replies in an expanded branch currently on screen can enter the feed immediately even when the reader is away from the newest edge. The existing momentum guard remains in force.

Read receipts now atomically mark the matching notification as read, scoped by room, account and exact comment IDs. Hidden descendants and other accounts remain unread. Inbox history is retained. The notification counter refreshes after reading.

Before delivering a recent device push, the dispatcher allows up to 3 seconds from notification creation for the live reader's receipt, then checks the current database state again. A job claimed before the receipt is suppressed if the receipt arrives in time. Closed/background apps, other rooms and unread collapsed/offscreen branches still receive push according to existing room mute and device permissions. Older retry jobs have no additional receipt delay. This supersedes the earlier rule that read inbox entries still always generated push.

Suppression happens before sending Web Push. The service worker continues to display notifications that have already been delivered by the push service, preserving iOS requirements. A message already handed to the push service cannot be recalled by a later receipt; slow/offline clients therefore fail toward delivering a notification rather than silently losing it.

## Validation

- Full check: TypeScript passed; 130 tests, 129 passed, 1 optional integration test skipped, 0 failed.
- Real SQL exercised in embedded PostgreSQL as well as the memory repository: exact read/notification linkage, claimed-job races, account isolation, and atomic rollback of invalid receipt batches.
- Dispatcher tests use encrypted Web Push request construction with synthetic subscriptions and an injected transport; viewed jobs are withheld while background, other-room and collapsed-branch jobs are delivered.
- DOM-state tests cover foreground visibility, focus, wrong room/account, open dialogs, inert mobile content, collapsed and offscreen targets, and a visible reply branch with its parent offscreen.
- No schema change, permissions expansion, or new database table is required.
- Physical iOS/Android push banners and sounds have not been tested. These tests do not certify device delivery timing.
