-- Preserve existing notifications and allow an inbox entry for every new room message.
ALTER TABLE ideahub_private.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE ideahub_private.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN ('mention','reply','message'));
