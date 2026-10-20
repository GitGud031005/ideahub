# Personal idea classification

Classification belongs to each viewer. Topic tags remain independent labels.

| Status | Meaning | Icon and palette |
| --- | --- | --- |
| new / Mới | The viewer has not joined | Exclamation mark, pale red |
| potential / Tiềm năng | The viewer has joined and has not archived | Check mark, pale green |
| archived / Lưu trữ | The viewer archived their own membership | Box, pale gray |

Creation joins its author automatically, so an author's own idea starts as potential for that author and appears new to everyone who has not joined. Opening a discussion keeps the existing automatic join flow. Re-entry never silently restores an archived membership.

The dashboard has one filter row: all, new, potential, archived, mine. All includes archived ideas. Mine selects authored ideas. Search and sorting compose with the selected view; stable keyset cursors include the viewer and a personal-v2 scope. Counts describe the dashboard at the pagination snapshot. They are computed together with the filtered total in one SQL statement.

Cards show only a colored status icon at the upper right; hovering or focusing the icon reveals its accessible label. The same colored icons appear beside filter labels. The dropdown formerly shown below tags is removed. The discussion sidebar permits only potential/archive changes. A complete control surface changes background on hover/focus, and the join button paints its complete width.

The server projects status from memberships.archived and membership existence. POST /api/ideas/:id/status accepts only potential/archive and requires a valid session, same origin and the caller's own membership. It updates exactly (idea_id, user_id); it cannot change another person's classification. New is derived, never manually assigned. The legacy ideas.status column remains for rollback compatibility but is no longer read or written by the application. The migration preserves old shared archive visibility for existing members and defaults future memberships to unarchived.

Archiving preserves comments, attachments, recap files, membership, and unread state. It does not add a chat event. Per-viewer idea responses and classification changes bypass Redis; TanStack Query updates room metadata and invalidates dashboard lists locally. Authentication changes clear viewer-specific client data.

Validation: 69 tests passed, one optional external PostgreSQL integration test skipped; production build passed. Memory and embedded PostgreSQL tests cover distinct viewers, join-derived new state, archive/restore isolation, strict API payloads, authorization, preserved discussion and unread state, and cursor scope changes. Existing pagination, live comments, auth, profile, file sharing, recap and cache regression tests also pass.
