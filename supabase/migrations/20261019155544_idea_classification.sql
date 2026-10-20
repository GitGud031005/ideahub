-- Existing ideas are already being discussed; future ideas start as new.
ALTER TABLE public.ideas ADD COLUMN status text NOT NULL DEFAULT 'potential'
  CONSTRAINT ideas_status_check CHECK (status IN ('new', 'potential', 'archived'));
ALTER TABLE public.ideas ALTER COLUMN status SET DEFAULT 'new';
CREATE INDEX ideas_status_created_idx ON public.ideas (status, created_at DESC, id);
