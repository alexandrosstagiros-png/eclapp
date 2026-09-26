-- Additive MAX support. Existing Telegram invitations and identities stay unchanged,
-- so the legacy demo and the updated public API can share this database.
ALTER TABLE sessions DROP CONSTRAINT sessions_channel_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_channel_check
  CHECK (channel IN ('dev','telegram','max','web'));

ALTER TABLE channel_identities DROP CONSTRAINT channel_identities_provider_check;
ALTER TABLE channel_identities ADD CONSTRAINT channel_identities_provider_check
  CHECK (provider IN ('telegram','max'));

ALTER TABLE workflow_attendance DROP CONSTRAINT workflow_attendance_channel_check;
ALTER TABLE workflow_attendance ADD CONSTRAINT workflow_attendance_channel_check
  CHECK (channel IN ('web','dev','telegram','max','system'));

CREATE TABLE max_invitations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users,
  max_user_id text NOT NULL CHECK (
    max_user_id ~ '^[1-9][0-9]{0,15}$' AND max_user_id::numeric <= 9007199254740991
  ),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users
);
CREATE INDEX max_invitations_user ON max_invitations(user_id) WHERE consumed_at IS NULL;

-- Existing roles do not automatically receive privileges on new tables.
GRANT SELECT, INSERT, UPDATE ON max_invitations TO transport_app;
