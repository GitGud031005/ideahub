-- Credentials and revocable sessions remain server-only, outside Data API schemas.
CREATE SCHEMA IF NOT EXISTS ideahub_private;
REVOKE ALL ON SCHEMA ideahub_private FROM PUBLIC, anon, authenticated;
CREATE TABLE ideahub_private.accounts (
  user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ideahub_private.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES ideahub_private.accounts(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON ideahub_private.sessions(user_id);
CREATE INDEX sessions_expiry_idx ON ideahub_private.sessions(expires_at);
CREATE TABLE ideahub_private.auth_limits (
  key_hash text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
CREATE INDEX auth_limits_started_idx ON ideahub_private.auth_limits(started_at);
ALTER TABLE ideahub_private.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideahub_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideahub_private.auth_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ideahub_private FROM PUBLIC, anon, authenticated;
-- The existing users/ideas/comments tables retain server-only grants and RLS.
