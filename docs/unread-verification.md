# Unread and optional Redis verification — 2026-10-18

- Updated from existing main `8e0f386` and retained the completed SSE/pagination changes.
- `npm run check`: 56 passed, one optional external PostgreSQL test skipped. Next.js production build and TypeScript passed.
- Applied migration `20261018042203_unread_comment_markers` to Supabase. Read-back confirms bigint sequence and marker columns; existing memberships initially have zero unread history. The security advisor retains only the intentional deny-by-default RLS informational notices; no new client table grants.
- Memory and embedded PostgreSQL tests verify user isolation, ignoring own messages, counting nested replies, skipping pre-join history, strictly monotonic markers, messages arriving after an older snapshot, persistence across repository instances, and idempotent comment retries. API tests cover authentication, membership, same-origin checks and strict rejection of caller-supplied identity.
- Cache tests cover hits, revision invalidation, stale in-flight loaders, repository write invalidation, uncached personal markers, disabled Redis, backoff/fail-open behavior, DB error propagation, HTTPS REST authentication and sanitized errors.
- Actual-component browser fixtures at 320/390/768/1440 px retain matching document/viewport widths. Counts 7 and 123 render as `7` and `99+` with exact accessible labels. Unjoined ideas have no badge.
- Opening the first fixture discussion and returning clears only its badge; the other remains `99+`. A typed draft survives acknowledgement and re-entry. Fixture writes stay in disposable mock state; no production comments/accounts were created for tests.
- Redis transport was tested with a deterministic mock. No live Upstash database/key was supplied, so live cache behavior and performance have not been benchmarked. The deployed app reads PostgreSQL normally until the two server environment variables are configured and the app redeployed.
- Generated public fixture files are removed in the final cleanup commit. The reproducible fixture source remains under `tests/ui`.
