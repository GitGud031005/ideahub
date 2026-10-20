-- Archive belongs to the viewer's membership. Joining determines new/potential.
ALTER TABLE public.memberships ADD COLUMN archived boolean NOT NULL DEFAULT false;
-- Preserve prior archive choices for people already in those discussions.
UPDATE public.memberships m SET archived = true FROM public.ideas i
WHERE m.idea_id = i.id AND i.status = 'archived';
-- Retain the old idea column for rollback compatibility; new code does not use it.
