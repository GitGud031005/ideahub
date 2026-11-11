-- Additive rollout: personal membership flags remain intact for rollback.
ALTER TABLE public.ideas ALTER COLUMN status SET DEFAULT 'potential';
ALTER TABLE public.ideas ADD COLUMN status_updated_by text REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.ideas ADD COLUMN status_updated_at timestamptz;
CREATE INDEX ideas_status_updated_by_idx ON public.ideas(status_updated_by);
-- The source account is supplied separately by the operator after identity verification.
CREATE TABLE ideahub_private.classification_rollouts (
  name text PRIMARY KEY,
  source_user_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
ALTER TABLE ideahub_private.classification_rollouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ideahub_private.classification_rollouts FROM PUBLIC, anon, authenticated;
