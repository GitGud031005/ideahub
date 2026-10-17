# Daily and weekly AI recap

Each discussion sidebar has dated recap files grouped under collapsible Monday–Sunday weeks. Opening a file shows a modal with bullet lists for key ideas, explicit decisions, next steps, and unresolved questions. Empty decision sections explicitly say that no decision was recorded. Each bullet can open its source comment.

Files are persisted as structured documents in `ideahub_private.recaps`; the `.md` filename is a readable document label, not a public Storage object. Daily names use `YYYY-MM-DD.md`; weekly names use the Monday date, `YYYY-MM-DD_weekly.md`.

## Enable Google AI later

Set server-only environment variables in Vercel and redeploy:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key; never use a `NEXT_PUBLIC_` prefix |
| `GEMINI_MODEL` | Optional; defaults to `gemini-3.8-flash` |
| `CRON_SECRET` | Random bearer secret of at least 16 characters, used by Vercel scheduled requests |

There is no browser-side key form. Without a key, saved recaps still open and the create control stays disabled. No real Gemini request has been tested before a key is configured. With a key, joined users can use “Tạo bản recap” to select a date and daily/weekly period. Today or the current week creates a snapshot through the current messages; a subsequent request refreshes the same file if the input changed.

Google integration uses the [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) with structured JSON output and `store: false`. Inputs include the idea title/description, comment authors, message bodies, timestamps, parent IDs, and necessary ancestor context. They do not contain account credentials or sessions. Structured data and source IDs are validated before publication; the model is instructed not to turn suggestions into decisions. Citation validation verifies IDs, not the factual correctness of every generated sentence.

## Schedule and limits

- Vercel invokes `/api/cron/recaps` once daily at `18:00 UTC` (01:00 the following day in Vietnam). Hobby scheduling may execute within the following hour.
- Daily periods use Vietnamese midnight. Weekly periods run Monday through Sunday. The scheduled task processes only closed periods, so the weekly file first becomes eligible on Monday.
- The job catches up at most four files per invocation, searching 14 days of daily activity and eight completed weeks. Pending work continues on later runs; it is not an unlimited queue and is intended for a small installation. Monitor `completed`, `failed`, and `hasMore` before increasing volume.
- A shared global generation budget allows 100 requests per 24-hour bucket. Manual requests also have a per-user limit of ten per 15 minutes. Cached requests consume the request budget but do not call Google again.
- Generation uses an atomic database lease, a unique `(idea_id, kind, period_start)` key, and an input hash. Concurrent calls cannot both generate the same file. Expired leases can recover; stale workers cannot overwrite newer content. A failed refresh preserves saved content.
- One period supports up to 500 source comments and a 160 KB UTF-8 prompt payload including ancestor context. Larger inputs fail explicitly rather than silently truncating. Scheduled jobs skip periods above 500 messages. Large rooms need a chunked summarization pipeline before raising these limits.
- Google calls have a 40-second timeout and are not retried automatically. A new manual request or later scheduled run may retry a failure.
- Recap list/detail require an authenticated account; generation additionally requires membership. Direct browser Data API access is revoked and RLS is enabled. The existing application uses server-managed username sessions, not Supabase Auth policies.

References: [Google structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Vercel cron authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Vercel cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). Supabase's [RLS-without-policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected for this server-only deny-by-default access model.

## Demo data and verification

`supabase/seed-recap-demo.sql` contains the explicitly requested fictional discussion “Data Crawling Lab · Thảo luận mẫu”: 18 comments, three fictional author profiles without login accounts, four daily recaps and one weekly recap across two weeks. It is separate from schema migrations and is idempotent; rerunning never overwrites an existing demo. Every sample recap is marked “Mẫu · biên soạn sẵn”. It was written for UI review and is not represented as Gemini output.

The schema migration and demo seed have been applied to the existing project. PostgreSQL tests check source counts and citation scope, duplicate-generation locking, cache refresh, failed-refresh preservation, lease recovery, authentication/membership, date boundaries, and scheduled catch-up. Mock HTTP tests verify the Google payload, output validation, and sanitized failures. Use `npm run check` and `npm run build`.
