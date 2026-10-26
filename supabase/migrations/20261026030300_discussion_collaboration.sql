-- Apply before deploying discussion collaboration code. App sessions use server SQL only.
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS mentions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '';
UPDATE public.comments SET search_text=regexp_replace(replace(lower(normalize(body,NFD)),'đ','d'),'[̀-ͯ]','','g') WHERE search_text='';
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS notifications_muted boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS ideahub_private.notifications (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  idea_id text NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  comment_id text NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('mention','reply')), created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz, push_state text NOT NULL DEFAULT 'pending',
  push_after timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
  UNIQUE(user_id,comment_id)
);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON ideahub_private.notifications(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_push_idx ON ideahub_private.notifications(push_after) WHERE push_state='pending' AND attempts<5;
CREATE TABLE IF NOT EXISTS ideahub_private.push_keys (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), public_key text NOT NULL, private_key text NOT NULL, dispatch_token text NOT NULL DEFAULT (gen_random_uuid()::text||gen_random_uuid()::text)
);
CREATE TABLE IF NOT EXISTS ideahub_private.push_subscriptions (
  endpoint text PRIMARY KEY,user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL,auth text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON ideahub_private.push_subscriptions(user_id);
ALTER TABLE ideahub_private.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideahub_private.push_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideahub_private.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ideahub_private.notifications,ideahub_private.push_keys,ideahub_private.push_subscriptions FROM PUBLIC,anon,authenticated;
