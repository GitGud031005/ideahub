-- Keep the existing sequence as the historical/join baseline. New reads are exact
-- receipts, so opening a parent cannot acknowledge its collapsed descendants.
CREATE TABLE public.comment_read_receipts (
  idea_id text NOT NULL,
  user_id text NOT NULL,
  comment_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id),
  FOREIGN KEY (idea_id, user_id) REFERENCES public.memberships(idea_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id, idea_id) REFERENCES public.comments(id, idea_id) ON DELETE CASCADE
);
CREATE INDEX comment_read_receipts_membership_idx ON public.comment_read_receipts(idea_id, user_id);
CREATE INDEX comment_read_receipts_comment_idx ON public.comment_read_receipts(comment_id, idea_id);
-- IdeaHub uses server-side custom sessions, not Supabase Auth. No Data API access.
ALTER TABLE public.comment_read_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_read_receipts FROM PUBLIC, anon, authenticated;
