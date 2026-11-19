-- Keep tombstones and issued identities after idea deletion so the worker can
-- revoke existing grants and reconcile a room that reappears after closure.
CREATE TABLE ideahub_private.meeting_sessions (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  idea_id text NOT NULL,
  room_name text NOT NULL UNIQUE,
  room_sid text,
  opened_by text NOT NULL,
  phase text NOT NULL DEFAULT 'creating' CHECK (phase IN ('creating','active','closing','closed')),
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  warn_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  reason text CHECK (reason IN ('expired','empty','deleted','setup_failed')),
  participants integer NOT NULL DEFAULT 0 CHECK (participants BETWEEN 0 AND 6),
  next_action_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  CHECK ((started_at IS NULL AND warn_at IS NULL AND expires_at IS NULL) OR
         (started_at IS NOT NULL AND warn_at IS NOT NULL AND expires_at IS NOT NULL
          AND started_at < warn_at AND warn_at < expires_at AND room_sid IS NOT NULL)),
  CHECK ((phase = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((phase IN ('closing','closed')) = (reason IS NOT NULL))
);

CREATE UNIQUE INDEX meeting_sessions_one_open_per_idea ON ideahub_private.meeting_sessions(idea_id)
  WHERE phase <> 'closed';
CREATE INDEX meeting_sessions_latest ON ideahub_private.meeting_sessions(idea_id, sequence DESC);
CREATE INDEX meeting_sessions_due ON ideahub_private.meeting_sessions(next_action_at) WHERE next_action_at IS NOT NULL;

CREATE TABLE ideahub_private.meeting_issued_identities (
  session_id uuid NOT NULL REFERENCES ideahub_private.meeting_sessions(id) ON DELETE CASCADE,
  identity text NOT NULL,
  PRIMARY KEY (session_id, identity)
);

ALTER TABLE ideahub_private.meeting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideahub_private.meeting_issued_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ideahub_private.meeting_sessions, ideahub_private.meeting_issued_identities FROM PUBLIC, anon, authenticated;

CREATE FUNCTION ideahub_private.close_deleted_idea_meetings() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE ideahub_private.meeting_sessions
  SET phase = 'closing', reason = 'deleted', next_action_at = clock_timestamp()
  WHERE idea_id = OLD.id AND phase IN ('creating','active');
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION ideahub_private.close_deleted_idea_meetings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ideas_close_meeting BEFORE DELETE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION ideahub_private.close_deleted_idea_meetings();
