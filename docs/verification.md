# Account authentication and responsive UI verification

Verified on 2026-10-17.

## Google, avatars, and model fallback update

- Production commit `31517c34866f08bd02d46cafadc57e01c7ad68b6` deployed successfully on Vercel.
- `npm run check`: 30 passed, one optional external PostgreSQL test skipped. `npm run build` passed.
- Google tests cover state/nonce/PKCE, callback replay, stable subject identities, session rotation, and preservation of custom avatars. Cloudinary tests cover authenticated same-origin writes, signed fixed transformations, byte/type/size validation, and profile persistence.
- Gemini tests now exercise stateless `generateContent`, the user-supplied model catalog, runtime availability filtering, quota fallback, and immediate failure for invalid credentials.
- Applied `google_profiles`; read-back confirmed avatar columns, private OAuth-state RLS, and no anon SELECT. Security advisors returned only the expected deny-by-default RLS-without-policy informational notices.
- The user saved Production `GEMINI_API_KEY` and `CRON_SECRET`; their values were not inspected. Redeployment was requested through Vercel and subsequent source deployment succeeded.
- Real AI generation verified on 2026-10-17 through two protected Vercel Cron Run actions (both HTTP 200). Database read-back confirmed all five demo files are ready with source=gemini and model=gemini-3.8-flash: daily October 9, 11, 15, 16 and weekly October 5–11. No fallback was needed in this live run; fallback behavior remains covered by transport tests.
- Compared generated bullets and cited comment IDs with all 18 sample comments. The October 16 recap keeps CSV optional, identifies pagination termination as unresolved, and preserves the named README, QA, and slide assignments. The weekly recap summarizes 10 in-period comments. These generated documents replace the earlier hand-authored samples in the database.
- Google OAuth and Cloudinary live validation still require their separate server-side credentials. No production Google account was created or avatar uploaded during automated checks.

## AI recap update

- `npm run check`: 26 passed, one optional external-database test skipped. `npm run build` passed.
- Added daily/weekly period tests, actual PostgreSQL file storage and evidence scope, membership/session checks, duplicate generation leases, cache refresh, preservation after failed refresh, stale-worker rejection, and bounded cron catch-up.
- Mock Google transport tests verify stateless structured requests, output/citation validation, and error sanitization. The later live verification above confirms real Gemini generation after API-key configuration.
- Applied the recap migration and explicitly requested demo seed to Supabase. Read-back confirmed one sample idea, 18 comments, five sample recap files, RLS enabled, and no direct SELECT privileges for anon/authenticated.
- The initial seed documents were hand-authored and labeled as samples; live verification later replaced all five with generated Gemini recaps. Three fictional author profiles have no login accounts.
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
- The original release used initials only. The later Google/avatar update above adds OAuth and Cloudinary; account recovery remains outside scope.
- Temporary public browser-fixture outputs are removed after verification; `tests/ui` retains the reproducible source.
