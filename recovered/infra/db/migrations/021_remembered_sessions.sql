-- Refresh credentials are independent random secrets; only their hashes persist.
CREATE TABLE remembered_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users,
  auth_version integer NOT NULL CHECK(auth_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK(expires_at <= absolute_expires_at)
);
CREATE INDEX remembered_devices_user ON remembered_devices(user_id) WHERE revoked_at IS NULL;
CREATE INDEX remembered_devices_expiry ON remembered_devices(expires_at);
CREATE TABLE remembered_device_tokens (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  device_id uuid NOT NULL REFERENCES remembered_devices ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz
);
CREATE UNIQUE INDEX remembered_devices_one_current_token ON remembered_device_tokens(device_id) WHERE consumed_at IS NULL;
CREATE INDEX remembered_device_tokens_device ON remembered_device_tokens(device_id);
ALTER TABLE sessions ADD COLUMN remembered_device_id uuid REFERENCES remembered_devices ON DELETE SET NULL;
CREATE INDEX sessions_remembered_device ON sessions(remembered_device_id) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON remembered_devices,remembered_device_tokens TO transport_app;
