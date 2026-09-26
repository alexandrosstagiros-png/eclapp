-- Imported planning details have explicit resource and workspace bindings.
-- Imports do not create login accounts, grants, trips or global lookups.
CREATE TABLE planning_resource_data (
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('driver','vehicle')),
  resource_id uuid NOT NULL,
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=65536),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
  source_name text NOT NULL CHECK(length(source_name) BETWEEN 1 AND 240),
  source_row integer NOT NULL CHECK(source_row>1),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(responsibility_scope_id,kind,resource_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
GRANT SELECT ON planning_resource_data TO transport_app;

-- Planning contacts do not grant account access or imply operational trips.
CREATE TABLE planning_imported_resources (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('driver','vehicle')),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 300),
  active boolean NOT NULL DEFAULT true,
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE INDEX planning_imported_resources_scope ON planning_imported_resources(responsibility_scope_id,kind,id) WHERE active;
GRANT SELECT ON planning_imported_resources TO transport_app;
