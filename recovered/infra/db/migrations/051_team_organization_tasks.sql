-- SPDX-License-Identifier: MIT
-- Organizational positions never change users.role or security grants.
CREATE TABLE team_organization_positions (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(responsibility_scope_id,title)
);
CREATE TABLE team_organization_employees (
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  manager_id uuid REFERENCES users(id),
  position_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(responsibility_scope_id,user_id),
  CHECK(manager_id IS NULL OR manager_id<>user_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(position_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_organization_positions(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_organization_managers ON team_organization_employees(responsibility_scope_id,manager_id,user_id);
CREATE TABLE team_tasks (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=8000),
  author_id uuid NOT NULL REFERENCES users(id),
  assignee_id uuid NOT NULL REFERENCES users(id),
  due_date date,
  status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid NOT NULL REFERENCES users(id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_tasks_scope_updated ON team_tasks(responsibility_scope_id,updated_at DESC,id);
CREATE INDEX team_tasks_assignee ON team_tasks(responsibility_scope_id,assignee_id,status);
CREATE TABLE team_task_messages (
  task_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  assignment_version integer NOT NULL CHECK(assignment_version>0),
  assignee_id uuid NOT NULL REFERENCES users(id),
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL UNIQUE,
  PRIMARY KEY(task_id,assignment_version),
  FOREIGN KEY(task_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_tasks(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE team_organization_task_operations (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('employee','position','create','edit','status')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE TRIGGER team_organization_task_operations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_organization_task_operations
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER team_task_messages_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_task_messages
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_organization_positions,team_organization_employees,team_tasks,team_task_messages,team_organization_task_operations TO transport_app;
GRANT UPDATE(title,version,updated_by,updated_at) ON team_organization_positions TO transport_app;
GRANT UPDATE(manager_id,position_id,version,updated_by,updated_at) ON team_organization_employees TO transport_app;
GRANT UPDATE(title,description,assignee_id,due_date,status,version,conversation_id,message_id,updated_by,updated_at) ON team_tasks TO transport_app;
