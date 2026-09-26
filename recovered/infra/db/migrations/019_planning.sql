ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK(role IN ('driver','dispatcher','manager','document_specialist','mechanic','access_admin','auditor'));

-- A shared daily draft belongs to one complete access tuple, never to an
-- individual manager or to a project name. The JSON array preserves row order;
-- each client template controls its own column order when rendering or exporting.
CREATE TABLE planning_plans (
  id uuid PRIMARY KEY,
  business_date date NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  template_id text NOT NULL CHECK(template_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$'),
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_by uuid NOT NULL REFERENCES users,
  updated_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(business_date,legal_entity_id,region_id,project_id,responsibility_scope_id),
  CHECK(CASE WHEN jsonb_typeof(rows) = 'array' THEN jsonb_array_length(rows) <= 200 ELSE false END)
);
CREATE INDEX planning_scope_date ON planning_plans(legal_entity_id,region_id,project_id,responsibility_scope_id,business_date);
GRANT SELECT,INSERT ON planning_plans TO transport_app;
GRANT UPDATE(template_id,rows,version,updated_by,updated_at) ON planning_plans TO transport_app;
