-- IdeaHub initial schema. Run once on a dedicated Supabase project.
-- Server-only access: Next.js validates signed guest sessions. No browser Data API access.

CREATE TABLE public.users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  initial text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ideas (
  id text PRIMARY KEY,
  title varchar(80) NOT NULL CHECK (length(trim(title)) > 0),
  description varchar(240) NOT NULL CHECK (length(trim(description)) > 0),
  category text NOT NULL CHECK (category IN ('Công nghệ','Đời sống','Học tập','Thiết kế','Khác')),
  tags text[] NOT NULL DEFAULT '{}',
  search_text text NOT NULL,
  creator_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(tags) <= 12)
);
CREATE INDEX ideas_created_idx ON public.ideas (created_at DESC, id);
CREATE INDEX ideas_creator_idx ON public.ideas (creator_id, created_at DESC);

CREATE TABLE public.memberships (
  idea_id text NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);
CREATE INDEX memberships_user_idx ON public.memberships (user_id, idea_id);

CREATE TABLE public.comments (
  id text PRIMARY KEY,
  idea_id text NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  parent_id text,
  author_id text NOT NULL REFERENCES public.users(id),
  body varchar(2000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, idea_id),
  FOREIGN KEY (parent_id, idea_id) REFERENCES public.comments(id, idea_id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX comments_room_cursor_idx ON public.comments (idea_id, created_at, id);
CREATE INDEX comments_parent_idx ON public.comments (parent_id, idea_id);
CREATE INDEX comments_author_idx ON public.comments (author_id);

-- SQL-created tables need explicit RLS. Keep the Data API closed until Auth
-- and policies are implemented; a publishable key must not expose guest data.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users, public.ideas, public.memberships, public.comments
  FROM PUBLIC, anon, authenticated;
