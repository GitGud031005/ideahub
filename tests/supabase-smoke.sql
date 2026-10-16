-- Safe smoke check: all fixtures are rolled back, even on assertion failure.
BEGIN;
DO $check$
DECLARE
  actor text := 'smoke-' || gen_random_uuid()::text;
  idea_a text := 'smoke-' || gen_random_uuid()::text;
  idea_b text := 'smoke-' || gen_random_uuid()::text;
  root_id text := 'smoke-' || gen_random_uuid()::text;
  reply_id text := 'smoke-' || gen_random_uuid()::text;
  found_count integer;
BEGIN
  INSERT INTO public.users (id, display_name, initial) VALUES (actor, 'Smoke test', 'T');
  INSERT INTO public.ideas (id, title, description, category, tags, search_text, creator_id)
    VALUES (idea_a, 'Bản đồ thư viện', 'Cùng tìm nơi học', 'Học tập', ARRAY['Học tập','Bản đồ'], 'ban do thu vien cung tim noi hoc hoc tap ban do', actor),
           (idea_b, 'Other room', 'Separate discussion', 'Khác', ARRAY['Khác'], 'other room separate discussion khac', actor);
  INSERT INTO public.memberships (idea_id, user_id) VALUES (idea_a, actor) ON CONFLICT DO NOTHING;
  INSERT INTO public.memberships (idea_id, user_id) VALUES (idea_a, actor) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO found_count FROM public.memberships WHERE idea_id = idea_a AND user_id = actor;
  IF found_count <> 1 THEN RAISE EXCEPTION 'membership uniqueness failed'; END IF;

  INSERT INTO public.comments (id, idea_id, author_id, body) VALUES (root_id, idea_a, actor, 'Root');
  INSERT INTO public.comments (id, idea_id, parent_id, author_id, body) VALUES (reply_id, idea_a, root_id, actor, 'Reply');
  BEGIN
    INSERT INTO public.comments (id, idea_id, parent_id, author_id, body)
      VALUES ('smoke-' || gen_random_uuid()::text, idea_b, root_id, actor, 'Invalid cross-room reply');
    RAISE EXCEPTION 'cross-room parent was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ideas (id, title, description, category, search_text, creator_id)
      VALUES ('smoke-' || gen_random_uuid()::text, '', 'Invalid title', 'Khác', '', actor);
    RAISE EXCEPTION 'empty title was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT count(*) INTO found_count FROM public.ideas WHERE id = idea_a AND strpos(search_text, 'ban do thu vien') > 0;
  IF found_count <> 1 THEN RAISE EXCEPTION 'normalized search failed'; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, 1 AS depth FROM public.comments WHERE id = reply_id AND idea_id = idea_a
    UNION ALL SELECT c.id, c.parent_id, a.depth + 1 FROM public.comments c
      JOIN ancestors a ON c.id = a.parent_id WHERE c.idea_id = idea_a AND a.depth < 13
  ) SELECT max(depth) INTO found_count FROM ancestors;
  IF found_count <> 2 THEN RAISE EXCEPTION 'reply ancestry failed'; END IF;
END
$check$;
ROLLBACK;
SELECT 'ok' AS smoke_test;
