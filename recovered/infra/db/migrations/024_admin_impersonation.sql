-- An impersonated session is short-lived and depends on its original administrator session.
ALTER TABLE sessions ADD COLUMN impersonation_parent_session_id uuid REFERENCES sessions(id);
ALTER TABLE sessions ADD CONSTRAINT sessions_impersonation_parent_not_self
  CHECK (impersonation_parent_session_id IS NULL OR impersonation_parent_session_id <> id);
ALTER TABLE sessions ADD CONSTRAINT sessions_impersonation_no_remembered_device
  CHECK (impersonation_parent_session_id IS NULL OR remembered_device_id IS NULL);
CREATE INDEX sessions_impersonation_parent ON sessions(impersonation_parent_session_id)
  WHERE impersonation_parent_session_id IS NOT NULL;
