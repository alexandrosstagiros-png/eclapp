-- SPDX-License-Identifier: MIT
-- A source upload is an immutable snapshot, never a financial posting. Runtime
-- access cannot overwrite or delete datasets or the activation/link history.
CREATE TABLE fleet_maintenance_datasets (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 200),
  file_hash text NOT NULL CHECK(file_hash ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 100000),
  metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND jsonb_typeof(payload->'rows')='array'
    AND jsonb_array_length(payload->'rows')=row_count),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(legal_entity_id,region_id,project_id,responsibility_scope_id,file_hash)
);
CREATE TABLE fleet_maintenance_state (
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  active_dataset_id uuid,
  version integer NOT NULL CHECK(version>0),
  links jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(links)='array'),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(active_dataset_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES fleet_maintenance_datasets(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE fleet_maintenance_events (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  kind text NOT NULL CHECK(kind IN ('activated','vehicle_link')),
  dataset_id uuid,
  details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(dataset_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES fleet_maintenance_datasets(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(legal_entity_id,region_id,project_id,responsibility_scope_id,version)
);
CREATE INDEX fleet_maintenance_datasets_scope ON fleet_maintenance_datasets
  (legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC);
CREATE INDEX fleet_maintenance_events_scope ON fleet_maintenance_events
  (legal_entity_id,region_id,project_id,responsibility_scope_id,version DESC);
GRANT SELECT,INSERT ON fleet_maintenance_datasets,fleet_maintenance_state,fleet_maintenance_events TO transport_app;
GRANT UPDATE(active_dataset_id,version,links,updated_by,updated_at) ON fleet_maintenance_state TO transport_app;
