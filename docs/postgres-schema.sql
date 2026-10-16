-- Proposal only: integrate through migrations when a real PostgreSQL database is connected.
CREATE TABLE users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  initial text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ideas (
  id text PRIMARY KEY,
  title varchar(80) NOT NULL CHECK (length(trim(title)) > 0),
  description varchar(240) NOT NULL CHECK (length(trim(description)) > 0),
  category text NOT NULL CHECK (category IN ('Công nghệ','Đời sống','Học tập','Thiết kế','Khác')),
  tags text[] NOT NULL DEFAULT '{}',
  creator_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(tags) <= 12)
);
CREATE INDEX ideas_created_idx ON ideas (created_at DESC, id);
CREATE INDEX ideas_creator_idx ON ideas (creator_id, created_at DESC);

CREATE TABLE memberships (
  idea_id text NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id, idea_id);

CREATE TABLE comments (
  id text PRIMARY KEY,
  idea_id text NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  parent_id text,
  author_id text NOT NULL REFERENCES users(id),
  body varchar(2000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, idea_id),
  FOREIGN KEY (parent_id, idea_id) REFERENCES comments(id, idea_id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX comments_room_cursor_idx ON comments (idea_id, created_at, id);
CREATE INDEX comments_parent_idx ON comments (idea_id, parent_id, created_at);
