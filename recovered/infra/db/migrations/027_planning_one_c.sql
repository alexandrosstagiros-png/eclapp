-- Explicit per-scope bindings to the local custom 1C database. No inferred
-- vehicle capabilities or synthetic workflow trips are needed for planning.
CREATE TABLE planning_one_c_scopes (
  responsibility_scope_id uuid PRIMARY KEY REFERENCES responsibility_scopes,
  source_namespace uuid NOT NULL,
  client_ref uuid NOT NULL,
  project_ref uuid NOT NULL,
  target_label text NOT NULL DEFAULT 'Локальная 1С · InfoBase'
);
CREATE TABLE planning_one_c_resources (
  responsibility_scope_id uuid NOT NULL REFERENCES planning_one_c_scopes,
  kind text NOT NULL CHECK(kind IN ('driver','vehicle')),
  local_id uuid NOT NULL,
  source_ref uuid NOT NULL,
  label text NOT NULL,
  registration text NOT NULL DEFAULT '',
  active boolean NOT NULL,
  PRIMARY KEY(responsibility_scope_id,kind,local_id),
  UNIQUE(responsibility_scope_id,kind,source_ref)
);
CREATE TABLE planning_one_c_exports (
  id uuid PRIMARY KEY,
  responsibility_scope_id uuid NOT NULL REFERENCES planning_one_c_scopes,
  business_date date NOT NULL,
  row_id uuid NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','created','unchanged','error')),
  receipt jsonb,
  message text,
  attempts integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(responsibility_scope_id,business_date,row_id)
);
GRANT SELECT ON planning_one_c_scopes,planning_one_c_resources TO transport_app;
GRANT SELECT,INSERT ON planning_one_c_exports TO transport_app;
GRANT UPDATE(status,receipt,message,attempts,updated_at) ON planning_one_c_exports TO transport_app;
