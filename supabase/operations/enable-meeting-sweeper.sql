-- Run only on the isolated pilot database, after enabling pg_cron and pg_net.
-- Put meeting_sweep_url and meeting_sweep_secret in Vault beforehand.
SELECT cron.schedule(
  'ideahub-meeting-sweep',
  '2 seconds',
  $job$
    SELECT net.http_post(
      url := endpoint.decrypted_secret,
      headers := jsonb_build_object('Authorization', 'Bearer ' || secret.decrypted_secret),
      timeout_milliseconds := 10000
    )
    FROM vault.decrypted_secrets endpoint
    JOIN vault.decrypted_secrets secret ON secret.name = 'meeting_sweep_secret'
    WHERE endpoint.name = 'meeting_sweep_url'
      AND EXISTS (
        SELECT 1 FROM ideahub_private.meeting_sessions
        WHERE next_action_at <= statement_timestamp()
          AND (lease_until IS NULL OR lease_until <= statement_timestamp())
      );
  $job$
);
