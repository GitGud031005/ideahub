# Owner-only idea deletion

Implemented an owner-only “Xóa idea” button at the bottom of the idea information sidebar. The confirmation names the idea, explains permanent removal of room content, focuses Cancel initially, prevents duplicate submission, and displays request errors. After success the client clears room queries, refreshes dashboard/inbox/unread data and returns home.

`POST /api/ideas/:id/delete` requires the existing authenticated session, same-origin write checks, rate limiting and a strict empty JSON body. The server independently verifies ownership. PostgreSQL includes creator identity in the DELETE predicate; existing foreign keys cascade room memberships, comments, read receipts, attachment records, notifications and recap records in one statement. Memory storage performs equivalent cleanup atomically. Shared cache invalidation follows successful deletion. No database schema or grants changed. External Cloudinary binary garbage collection is outside this change; attachment records and in-app access are removed.

Validation:
- TypeScript and full suite passed: 137 tests, 136 passed, 1 skipped, 0 failures.
- Production build and whitespace checks passed.
- Embedded PostgreSQL executed deletion against the actual migrations, including nested comments and dependent records; another idea remained intact.
- API tests cover guests, nonowners, cross-origin requests, identity spoofing, GET without deletion, successful owner deletion and repeated deletion.
- Synthetic browser preview: nonowner has no delete button; owner can open/cancel confirmation; confirmation fits 320×480; confirming fake deletion returns home. No real production idea was deleted during QA.
- The responsive preview route, wrapper and frame-header exception are excluded from production.
