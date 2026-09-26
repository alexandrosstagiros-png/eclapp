-- SPDX-License-Identifier: MIT
-- Contact details are separate from identity/login credentials.
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  email text CHECK(email IS NULL OR length(email)<=254),
  phone text CHECK(phone IS NULL OR length(phone)<=64),
  contacts text CHECK(contacts IS NULL OR length(contacts)<=2000),
  birth_date date,
  avatar_content bytea CHECK(avatar_content IS NULL OR octet_length(avatar_content)<=262144),
  avatar_sha256 text CHECK(avatar_sha256 IS NULL OR avatar_sha256 ~ '^[0-9a-f]{64}$'),
  avatar_version integer NOT NULL DEFAULT 0 CHECK(avatar_version>=0),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((avatar_content IS NULL)=(avatar_sha256 IS NULL))
);
GRANT SELECT,INSERT ON user_profiles TO transport_app;
GRANT UPDATE(email,phone,contacts,birth_date,avatar_content,avatar_sha256,avatar_version,version,updated_at) ON user_profiles TO transport_app;

CREATE TABLE user_profile_operations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER user_profile_operations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON user_profile_operations
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON user_profile_operations TO transport_app;
