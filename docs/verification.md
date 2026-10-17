# Account authentication and responsive UI verification

Verified on 2026-10-17.

## AI recap update

- `npm run check`: 26 passed, one optional external-database test skipped. `npm run build` passed.
- Added daily/weekly period tests, actual PostgreSQL file storage and evidence scope, membership/session checks, duplicate generation leases, cache refresh, preservation after failed refresh, stale-worker rejection, and bounded cron catch-up.
- Mock Google transport tests verify stateless structured requests, output/citation validation, and error sanitization. A real Gemini request is pending the user's API-key configuration.
- Applied the recap migration and explicitly requested demo seed to Supabase. Read-back confirmed one sample idea, 18 comments, five sample recap files, RLS enabled, and no direct SELECT privileges for anon/authenticated.
- Sample documents are hand-authored and clearly labeled; three fictional author profiles have no login accounts.
- Existing account checks below document the earlier authentication release, not the newly authorized discussion seed.

## Automated checks

- `npm run check`: 18 tests passed; the optional external PostgreSQL integration test was skipped when its dedicated test URL was absent.
- `npm run build`: passed, including TypeScript and Next.js production compilation.
- API and isolated PostgreSQL tests cover registration, normalized usernames, duplicate-account rollback, scrypt verification, session expiry and rotation, logout revocation, rate limiting, private table privileges, and authentication requirements for ideas and comments.

## Browser checks

The browser fixture uses the real app components with mocked API responses and disposable in-frame state. It never creates production accounts, ideas, or comments.

- Dashboard at CSS widths 320, 390, 768, and 1440 px: document width matches viewport; one, one, two, and three card columns respectively.
- Registration dialog at 320 and 390 px: fits the viewport without horizontal overflow.
- Guest create and join actions open authentication before continuing.
- At 320 px, account initials and account menu fit; the information sidebar opens as a 296 px drawer and closes normally.
- At 320 px, opening all 13 nested comments keeps the document at 320 x 844 px while the comment region scrolls internally (610 px region, 2405 px content).
- Desktop discussion at 1440 px retains the sidebar and a document height of 844 px without page overflow.

The long-thread regression came from an absolutely positioned screen-reader status escaping its scroll region. Anchoring the status and positioning the comment region fixes the extra document height.

## Live deployment checks and limits

- Read-only checks confirmed PostgreSQL health, an anonymous session without a minted guest identity, public idea listing, and an `AUTH_REQUIRED` response for unauthenticated comment access.
- The Supabase migration for accounts, hashed sessions, and shared rate limits was applied. Private auth tables have RLS enabled and deny anon/authenticated access.
- A production account-creation smoke test was rejected by automatic approval review because it would create a persistent account. It was not retried; write behavior was verified against isolated PostgreSQL instead.
- Google sign-in, account recovery, and uploaded avatars are outside this implementation. Account avatars use name initials.
- Temporary public browser-fixture outputs are removed after verification; `tests/ui` retains the reproducible source.
