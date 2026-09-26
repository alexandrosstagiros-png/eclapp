-- Password login is independent of messenger bindings and never grants roles/scopes.
CREATE TABLE phone_credentials (
  user_id uuid PRIMARY KEY REFERENCES users,
  phone text NOT NULL UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  password_salt text NOT NULL CHECK (password_salt ~ '^[a-f0-9]{64}$'),
  password_hash text NOT NULL CHECK (password_hash ~ '^[a-f0-9]{128}$'),
  hash_algorithm text NOT NULL DEFAULT 'scrypt-v1' CHECK (hash_algorithm = 'scrypt-v1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL REFERENCES users
);

-- Count failures across processes/restarts without duplicating the plaintext phone.
CREATE TABLE phone_login_attempts (
  phone_hash text PRIMARY KEY CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 5),
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  blocked_until timestamptz
);
CREATE INDEX phone_login_attempts_window ON phone_login_attempts(window_started_at);
GRANT SELECT, INSERT, UPDATE ON phone_credentials TO transport_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON phone_login_attempts TO transport_app;
