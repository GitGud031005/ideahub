ALTER TABLE public.users ADD COLUMN avatar_url text CHECK (avatar_url IS NULL OR (length(avatar_url)<=2048 AND avatar_url LIKE 'https://%'));
ALTER TABLE public.users ADD COLUMN avatar_source text NOT NULL DEFAULT 'initials' CHECK (avatar_source IN ('initials','google','custom'));
ALTER TABLE ideahub_private.accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE ideahub_private.accounts ADD COLUMN google_subject text UNIQUE CHECK (length(google_subject) BETWEEN 1 AND 255);
ALTER TABLE ideahub_private.accounts ADD CONSTRAINT accounts_identity CHECK (password_hash IS NOT NULL OR google_subject IS NOT NULL);
CREATE TABLE ideahub_private.oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  verifier text NOT NULL,
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX oauth_states_expiry_idx ON ideahub_private.oauth_states(expires_at);
ALTER TABLE ideahub_private.oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ideahub_private.oauth_states FROM PUBLIC,anon,authenticated;
