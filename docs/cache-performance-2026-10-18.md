# Cache and database read verification — 2026-10-18

## Method

Measurements execute inside the production Vercel function against the existing Supabase database and Upstash provider. Each workload uses the first existing room by creation time, the first comment page (limit 100), seven samples per path, and a warm PostgreSQL connection. Direct reads and cache reads alternate order. Redis miss keys are unique; each miss is followed immediately by a hit. Synthetic benchmark keys expire in 60 seconds and are deleted afterwards. No comments, memberships, profiles, sessions or accounts are created/changed for production measurement.

Times below are **repository operations**, excluding browser-to-Vercel latency, authentication, rendering, assets, cold starts and connection establishment. This is a small current-data comparison, not a load test or a p95 estimate. It cannot establish capacity for a large deployment.

## Controlled SQL comparison in the existing IAD1 region

| Median milliseconds, 7 samples | Original SQL | Single-statement comment SQL |
| --- | ---: | ---: |
| Activity, direct DB | 156.3 | 152.6 |
| Activity, Redis hit | 458.3 | 443.1 |
| Activity, Redis miss | 831.7 | 814.3 |
| Comments, direct DB | 779.7 | 153.7 |
| Comments, Redis hit | 453.0 | 454.5 |
| Comments, Redis miss | 1463.9 | 824.8 |

Comment reads decreased about 80% versus direct DB reads before the change; they also beat the old Redis hit path. The original first page involved five sequential DB round trips (BEGIN, room, count, page, COMMIT), or six with cursor validation. The replacement statement keeps room/cursor validation, count and page within one PostgreSQL statement snapshot and one network round trip. Empty rooms and exhausted pages retain metadata via a left join.

Raw results: [baseline](benchmarks/cache-before-2026-10-18.json), [single-statement SQL](benchmarks/cache-sql-2026-10-18.json). Baseline source: `0bc380869273652cda8f4f9e660e75ab15c26ca5`; SQL comparison source: `0ef5b4ce4bebd411bd07b9fc53217a05d7b4947a`.

## Final production measurement in Tokyo (HND1)

The production diagnostic returned `region=hnd1` after the region deployment (`2091b0623566620f202435d549eda6ef67b5bf63`). Raw output: [Tokyo results](benchmarks/cache-tokyo-2026-10-18.json).

| Median milliseconds, 7 samples | Direct PostgreSQL | Redis hit | Redis miss |
| --- | ---: | ---: | ---: |
| Activity | 6.5 | 146.7 | 226.0 |
| Comments | 7.8 | 145.2 | 227.4 |

Against the original IAD1 direct comment read (779.7 ms), SQL plus region changes reduce the measured repository read to 7.8 ms (about 99%). Moving the optimized SQL from IAD1 to HND1 reduces that operation from 153.7 to 7.8 ms. These are server-side read operations, not a claim that entire pages load 100 times faster. In the final region, direct PostgreSQL also remains considerably faster than Redis hits, supporting the default-off policy for this low-traffic app.

## Configuration decision

- Redis read caching is opt-in: `IDEAHUB_REDIS_CACHE=true` plus both provider variables. Default is off even when credentials exist. Production uses PostgreSQL directly and retains TanStack Query's client cache. This avoids REST cache misses, revisions and writes in ordinary low-traffic requests.
- The opt-in repository, invalidation, circuit backoff and isolated provider health probe remain available. A disabled cache makes zero Redis commands for ordinary reads/writes, including profile invalidation. An explicit `?cache=verify` still contacts the provider on purpose.
- Supabase project metadata reports `ap-northeast-1` (Tokyo); the original Vercel deployment Resources page reports `IAD1` for the API and other functions. `vercel.json` sets a single `hnd1` region, matching Tokyo, to remove the trans-Pacific database path. Existing cron configuration is preserved.
- `cache.configured` and `cache.enabled` are reported separately in health responses. Provider configuration does not imply that read caching is enabled.

## Correctness checks

- `npm run check`: 60 tests, 59 passed, zero failed, one optional external PostgreSQL integration skipped. Actual SQL is exercised against embedded PostgreSQL.
- Comment page coverage includes empty rooms, the final page, a valid cursor with no remaining comments, invalid/mismatched cursors, missing rooms, tied microsecond timestamps, stable ID ordering, nested replies, pagination without duplicates, and the one-statement read boundary.
- Cache coverage includes zero Redis calls with read caching disabled, opt-in configuration, direct reads/writes and unread counts, provider verification while disabled, enabled invalidation and stale-loader races, provider errors and database errors.
- Existing session enforcement, SSE cross-instance updates/revocation, optimistic comments and personal unread isolation tests pass.
- `npm run build` passes. No schema migration or provider-plan upgrade is required.

## Repeating the measurement

Use `node --import tsx scripts/benchmark-cache.ts` in a trusted server environment with the existing server-only database and Upstash credentials supplied through environment variables. The script emits aggregate timing JSON only, verifies that the hit does not invoke the DB loader, sanitizes failures and closes its database pool. CLI results reflect the CLI host's network location, so production comparisons must run in the same Vercel environment and region. The temporary public production timing diagnostic is removed once verification finishes; ordinary health remains available.

Documentation consulted: [PostgreSQL statement snapshots](https://www.postgresql.org/docs/current/transaction-iso.html), [table expressions](https://www.postgresql.org/docs/current/queries-table-expressions.html), [Vercel function regions](https://vercel.com/docs/functions/configuring-functions/region), [region codes](https://vercel.com/docs/regions).
