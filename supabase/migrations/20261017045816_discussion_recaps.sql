-- Server-only recap files and short-lived generation leases.
CREATE TABLE ideahub_private.recaps (
  id text PRIMARY KEY,
  idea_id text NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('daily','weekly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('generating','ready','failed')),
  source text NOT NULL CHECK (source IN ('sample','gemini')),
  content jsonb,
  source_hash text CHECK (source_hash IS NULL OR source_hash ~ '^[a-f0-9]{64}$'),
  source_count integer NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  model text,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idea_id,kind,period_start),
  CHECK (period_end = period_start + CASE WHEN kind='daily' THEN 1 ELSE 7 END),
  CHECK (kind <> 'weekly' OR extract(isodow FROM period_start)=1),
  CHECK (content IS NULL OR jsonb_typeof(content)='object'),
  CHECK (status <> 'ready' OR content IS NOT NULL),
  CHECK (status <> 'generating' OR (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX recaps_idea_files_idx ON ideahub_private.recaps (idea_id,period_start DESC,kind DESC,id) WHERE status='ready';
ALTER TABLE ideahub_private.recaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ideahub_private.recaps FROM PUBLIC,anon,authenticated;
