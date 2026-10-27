# Discussion collaboration — 26 October 2026

Implemented for the existing IdeaHub discussion, keeping its monochrome layout and nested replies.

- Explicit `@` member selections store stable user IDs and UTF-16 text ranges. Plain text does not notify anyone. Arrow keys navigate suggestions; Enter selects before sending; Escape closes suggestions.
- Room search runs on the server across the entire room, supports Vietnamese without accents, filters by sender and paginates 30 results. Selecting a result expands ancestors and reveals the source comment.
- While reading away from the newest messages, arrivals wait behind the new-message button. Existing messages still update. Read receipts acknowledge only visible articles in a focused tab, preserving collapsed descendants.
- The outbox writes messages and File objects to device IndexedDB before sending. Reload restores unconfirmed messages as failed. Retry preserves the client ID; editing an ambiguously accepted send reconciles the saved message before editing it. IndexedDB failure falls back to the current in-memory outbox.
- Authors can edit with optimistic version checks. Conflicts preserve the editor text. Edits keep creation time, parent, attachments and unread sequence; only newly mentioned recipients are considered for notification.
- Notifications are inserted in the same transaction as comments/edits, unique per recipient/comment. Mention takes precedence over direct reply. Inbox read receipts are separate from comment receipts. Room mute silences toast/push while retaining inbox history.
- Web Push uses `web-push` with persistent server-only VAPID keys. Browser permission is requested only from the enable button. The worker avoids caching authenticated data, isolates accounts, displays every delivered push as required by Safari/iOS (using generic content after an account change), and navigates to the source on click. Known browser push endpoints are allowlisted and redirects disabled.

## API

`GET /api/ideas/:id/members`, `GET /api/ideas/:id/search?q=&author=&offset=`, `POST /api/ideas/:id/comments/:comment/edit`, `GET/POST /api/ideas/:id/notification-settings`, `GET /api/notifications?unread=0&offset=`, `POST /api/notifications/read`, `GET /api/push/config`, `POST /api/push/subscribe`, and `POST /api/push/unsubscribe`.

Existing auth/same-origin checks apply; identity always comes from the session. Notification/subscription storage is private with RLS and no Data API grants.

## Schema and delivery

`supabase/migrations/20261026030300_discussion_collaboration.sql` is additive. The application also prepares its idempotent equivalent under an advisory transaction lock, recording the version in `ideahub_private.schema_versions`. This supports deployments where the admin connector cannot apply a migration. Existing messages are retained and their search text is backfilled.

Push delivery is attempted after comment/edit responses using Next.js `after`. A durable queue uses leases, 20-job batches, bounded retries and endpoint cleanup for 404/410 responses. Subsequent notification requests also drain eligible retries. An optional bearer-protected `/api/cron/notifications` endpoint can drain retries without traffic; no recurring scheduler is installed by this change. Its independent token stays in `ideahub_private.push_keys` and is never sent to clients.

## Validation

- TypeScript checks and production build pass.
- Full suite: 97 passed, 1 external-Postgres integration test skipped without its separate test connection.
- Embedded PostgreSQL verifies migration idempotence, mention/retry deduplication, owner-only edits, version conflicts, accent-insensitive search, viewer isolation and independent receipts. Existing threaded-unread tests pass. A rendered-tree regression test verifies unread badges for buffered messages in collapsed branches.
- Preview deployment loads with the PostgreSQL backend; server-created tables and RLS were verified on the connected project. Security advisor reported informational no-policy notices for server-only tables, consistent with their revoked Data API access.
- Authenticated browser interactions and real OS notification delivery still require a signed-in browser and device permission; they have not been claimed as verified.

On iOS/iPadOS, Web Push requires a supported OS and launching the installed home-screen web app. Device permissions, focus modes and browser settings can suppress system notifications.
