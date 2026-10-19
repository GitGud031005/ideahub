-- Server-only attachment receipts; no direct browser Data API access.
ALTER TABLE public.ideas ADD COLUMN discussion_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.comments ADD COLUMN pinned_at timestamptz;
ALTER TABLE public.comments DROP CONSTRAINT comments_body_check;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_check CHECK (
  jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=5
  AND (length(trim(body))>0 OR jsonb_array_length(attachments)>0)
);
CREATE TABLE public.discussion_attachments (
  id text PRIMARY KEY,
  idea_id text NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES public.users(id),
  comment_id text,
  asset_id text NOT NULL UNIQUE,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
  mime text NOT NULL,
  size integer NOT NULL CHECK(size>0 AND size<=3145728),
  kind text NOT NULL CHECK(kind IN ('image','file')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(comment_id,idea_id) REFERENCES public.comments(id,idea_id) ON DELETE CASCADE
);
CREATE INDEX discussion_attachments_room_idx ON public.discussion_attachments(idea_id,comment_id);
CREATE INDEX comments_pinned_idx ON public.comments(idea_id,pinned_at DESC) WHERE pinned_at IS NOT NULL;
ALTER TABLE public.discussion_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discussion_attachments FROM PUBLIC,anon,authenticated;
