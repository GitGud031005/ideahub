-- The exact-receipt release completed at 2026-10-20 04:21:03 UTC.
-- Its join path still incorrectly initialized last_read_sequence to the latest
-- comment, which treated all pre-existing collapsed replies as already read.
-- Only repair memberships created since that release. Older legacy markers are
-- retained because their historical per-comment reads cannot be reconstructed.
-- Keep every exact receipt, including reads completed before this repair.
UPDATE public.memberships
SET last_read_sequence = 0
WHERE joined_at >= TIMESTAMPTZ '2026-10-20 04:21:03+00'
  AND last_read_sequence > 0;
