-- Bind $1 to the verified source user ID. Run once after the additive schema migration.
-- All old memberships remain unchanged. The private snapshot supports rollback.
WITH source AS (
  SELECT id FROM public.users WHERE id=$1
), captured AS (
  SELECT s.id AS source_user_id,jsonb_agg(jsonb_build_object(
    'id',i.id,'previousStatus',i.status,
    'status',CASE WHEN m.archived THEN 'archived' ELSE 'potential' END
  )) AS snapshot
  FROM source s CROSS JOIN public.ideas i
  LEFT JOIN public.memberships m ON m.idea_id=i.id AND m.user_id=s.id
  GROUP BY s.id
), rollout AS (
  INSERT INTO ideahub_private.classification_rollouts(name,source_user_id,snapshot)
  SELECT 'shared-v1',source_user_id,snapshot FROM captured
  ON CONFLICT (name) DO NOTHING
  RETURNING source_user_id,snapshot
), updated AS (
  UPDATE public.ideas i SET status=x.status,status_updated_by=r.source_user_id,status_updated_at=clock_timestamp()
  FROM rollout r CROSS JOIN LATERAL jsonb_to_recordset(r.snapshot) AS x(id text,status text)
  WHERE i.id=x.id RETURNING i.id,i.status
)
SELECT count(*)::int AS migrated,
  count(*) FILTER (WHERE status='potential')::int AS potential,
  count(*) FILTER (WHERE status='archived')::int AS archived
FROM updated;
