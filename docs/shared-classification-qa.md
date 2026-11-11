# Shared idea classification rollout

Date: 2026-11-11

## Behavior

- Potential and archived are shared idea state. Any authenticated user may change either state, including on someone else's idea without joining it.
- New remains viewer-specific: an active idea the viewer has not joined. An active idea can display both New and Potential indicators.
- All, Potential, New, and Mine exclude archived ideas. Only Archived lists them.
- Own mutations update the room immediately and invalidate dashboard queries. Other visible clients refresh classification within the five-second polling interval.

## Data rollout

The additive migration retains every legacy personal membership flag. A separate bound-parameter bootstrap captures a private rollback snapshot and initializes shared state from the verified source account requested by the owner. On production it classified 10 ideas: 4 potential and 6 archived. The bootstrap is atomic and idempotent; its marker prevents later shared edits from being overwritten by a rerun. Source identifiers are not embedded in repository files.

## Verification

- Full check: 145 tests passed, one database-specific test skipped, zero failures; TypeScript passed.
- Production build passed.
- Memory and PostgreSQL tests cover cross-account visibility, authenticated non-member updates without auto-joining, filter/count consistency, personal New and membership snapshots, pagination, and unchanged messages/read state.
- API tests cover authentication, same-origin checks, strict payload validation, shared archive/restore, and anonymous read filtering.
- Bootstrap tests cover source-account precedence, absent membership defaults, missing source, unchanged memberships, and rerun safety.
- Synthetic browser fixture verified real status control at 320px mobile width: both options fit; archive removes New; restoring potential returns New; membership remains unchanged. Desktop width also checked. This is browser viewport QA, not a physical Android/iOS test.
- Supabase security advisors: no warning/error introduced. The additional private rollout table uses RLS with no Data API policy and denies public/anon/authenticated access.

## Rollback

Retained membership flags permit the prior application release to preserve its former per-user behavior. The private rollout snapshot records each prior global status. Restore global values only through a deliberate rollback, taking later shared edits into account.
