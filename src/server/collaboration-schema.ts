import type {DatabasePool} from "./postgres-repository";
// Versioned additive schema; needed when the admin connector cannot apply migrations.
export const collaborationSchema=String.raw`-- Apply before deploying discussion collaboration code. App sessions use server SQL only.
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
`;
export const roomMessageSchema=String.raw`-- Preserve existing notifications and allow an inbox entry for every new room message.
ALTER TABLE ideahub_private.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE ideahub_private.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('mention','reply','message'));
`;
export async function ensureCollaborationSchema(pool:DatabasePool){
 const db=await pool.connect();
 try{
  await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(569920126)");
  await db.query("CREATE TABLE IF NOT EXISTS ideahub_private.schema_versions(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
  await db.query("ALTER TABLE ideahub_private.schema_versions ENABLE ROW LEVEL SECURITY");
  await db.query("REVOKE ALL ON ideahub_private.schema_versions FROM PUBLIC,anon,authenticated");
  const found=await db.query("SELECT version FROM ideahub_private.schema_versions WHERE version='20261026030300'");
  if(!found.rowCount){for(const statement of collaborationSchema.split(";").filter(s=>s.trim()))await db.query(statement);await db.query("INSERT INTO ideahub_private.schema_versions(version) VALUES('20261026030300') ON CONFLICT DO NOTHING");}
  const messages=await db.query("SELECT version FROM ideahub_private.schema_versions WHERE version='20261027170239'");
  if(!messages.rowCount){for(const statement of roomMessageSchema.split(";").filter(s=>s.trim()))await db.query(statement);await db.query("INSERT INTO ideahub_private.schema_versions(version) VALUES('20261027170239') ON CONFLICT DO NOTHING");}
  await db.query("COMMIT");
 }catch(e){await db.query("ROLLBACK");throw e;}finally{db.release();}
}
let ready:Promise<void>|undefined;
export function prepareCollaboration(pool:DatabasePool){return ready??=(ensureCollaborationSchema(pool).catch(e=>{ready=undefined;throw e;}));}
