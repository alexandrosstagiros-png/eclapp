-- A form belongs to the complete access tuple. Published versions are insert-only;
-- editing creates a new version and existing plans keep their pinned snapshot.
CREATE TABLE planning_templates (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  latest_version integer NOT NULL CHECK(latest_version > 0),
  created_by uuid NOT NULL REFERENCES users,
  updated_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX planning_templates_scope ON planning_templates(legal_entity_id,region_id,project_id,responsibility_scope_id);
CREATE TABLE planning_template_versions (
  template_id uuid NOT NULL REFERENCES planning_templates,
  version integer NOT NULL CHECK(version > 0),
  definition jsonb NOT NULL CHECK(jsonb_typeof(definition) = 'object'),
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(template_id,version)
);
ALTER TABLE planning_templates ADD CONSTRAINT planning_templates_latest_version_fk
  FOREIGN KEY(id,latest_version) REFERENCES planning_template_versions(template_id,version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE planning_template_defaults (
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  template_id uuid,
  updated_by uuid NOT NULL REFERENCES users,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(template_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES planning_templates(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
ALTER TABLE planning_plans ADD COLUMN template_version integer CHECK(template_version > 0);
ALTER TABLE planning_plans ADD COLUMN template_snapshot jsonb CHECK(jsonb_typeof(template_snapshot) = 'object');
ALTER TABLE planning_plans ADD CONSTRAINT planning_plan_snapshot_pair
  CHECK((template_version IS NULL) = (template_snapshot IS NULL));
GRANT SELECT,INSERT ON planning_templates,planning_template_versions,planning_template_defaults TO transport_app;
GRANT UPDATE(latest_version,updated_by,updated_at) ON planning_templates TO transport_app;
GRANT UPDATE(template_id,updated_by,updated_at) ON planning_template_defaults TO transport_app;
GRANT UPDATE(template_version,template_snapshot) ON planning_plans TO transport_app;
