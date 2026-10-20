# Idea classification

Each idea has one shared team status: new (Mới), potential (Tiềm năng), or archived (Lưu trữ). Tags remain independent topic labels.

New ideas start as new. Existing ideas at migration time become potential. An unjoined new card has a stronger monochrome border; room entry requires authentication and automatically joins the viewer, so the emphasis disappears on return. This is a personal discovery hint, not a claim that every team member has read the idea.

The dashboard starts with active (new + potential), with explicit filters for each status and all statuses. Search, personal views, sorting, counts, and keyset pagination respect classification. Cursor scope includes status. Counts share the page snapshot and provide the total without an extra count query.

Joined members can classify an idea directly on its card or in the discussion sidebar. Guests and non-members see a read-only badge. POST /api/ideas/:id/status requires a server session, same-origin request, strict enum-only payload and database membership. User IDs never come from the payload. Archiving is reversible and preserves membership, comments, files, recaps and unread markers. Classification never produces a chat message or increases unread counts.

Status responses remain uncached and viewer-specific. Changing status invalidates the dashboard query and updates the room query locally. Other viewers refresh on focus or the dashboard's 30-second interval; room metadata retains its 15-second interval.

Validation: 69 tests passed, 1 optional external PostgreSQL test skipped. Production build and targeted pagination/classification checks passed. Memory and embedded PostgreSQL cover membership denial, new defaults, shared changes, archive/restore, search/filter counts, preserved discussion/unread state and cursor scope changes. API tests cover login, membership, origin and strict payloads. Production schema verification confirmed 4 existing ideas as potential, new default, index and retained server-only RLS/grants.

Responsive UI verification: synthetic fixtures tested at 320, 390, 768 and 1440 pixels with no document overflow. Archive and restore actions, filter counts and mobile sidebar dropdown verified through browser controls. Fixture routes and bundle removed after verification.
