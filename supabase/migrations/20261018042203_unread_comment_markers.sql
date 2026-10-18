-- Durable read markers belong to PostgreSQL; Redis is never the source of truth.
ALTER TABLE public.comments ADD COLUMN read_sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX comments_unread_idx ON public.comments (idea_id, read_sequence) INCLUDE (author_id);
ALTER TABLE public.memberships ADD COLUMN last_read_sequence bigint NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0);
-- Start existing members at the current history, rather than notify all old messages.
UPDATE public.memberships m SET last_read_sequence = COALESCE((SELECT max(c.read_sequence) FROM public.comments c WHERE c.idea_id=m.idea_id),0);
