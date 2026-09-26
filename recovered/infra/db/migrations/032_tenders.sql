-- SPDX-License-Identifier: MIT
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN (
  'driver','dispatcher','manager','recruiter','external_recruiter','tender_specialist',
  'document_specialist','mechanic','access_admin','auditor'
));
ALTER TABLE employee_directory DROP CONSTRAINT employee_directory_source_kind_check;
ALTER TABLE employee_directory DROP CONSTRAINT employee_directory_check;
ALTER TABLE employee_directory ADD CONSTRAINT employee_directory_source_kind_check
  CHECK(source_kind IN ('existing','demo_seed','demo_manual','external_manual','external_invitation','internal_manual'));
ALTER TABLE employee_directory ADD CONSTRAINT employee_directory_check
  CHECK((source_kind IN ('demo_manual','external_manual','external_invitation','internal_manual') AND created_by IS NOT NULL AND created_at IS NOT NULL)
    OR (source_kind NOT IN ('demo_manual','external_manual','external_invitation','internal_manual') AND created_by IS NULL AND created_at IS NULL));

-- Commercial customer names do not require a personal-data grant. Every record
-- still belongs to the complete existing access tuple, including its project.
CREATE TABLE tender_customers (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE tender_items (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  status text NOT NULL CHECK(status IN ('planned','in_progress','awaiting_decision','won','closed')),
  vehicle_count text NOT NULL DEFAULT '' CHECK(length(vehicle_count)<=160),
  requirements text NOT NULL DEFAULT '' CHECK(length(requirements)<=4000),
  delivery_type text NOT NULL DEFAULT '' CHECK(delivery_type IN ('','city','crew')),
  expected_launch date,
  launch_notes text NOT NULL DEFAULT '' CHECK(length(launch_notes)<=1000),
  submission_deadline date,
  next_step text NOT NULL DEFAULT '' CHECK(length(next_step)<=1000),
  next_step_due date,
  kind text NOT NULL CHECK(kind IN ('tender','negotiation','expansion')),
  close_reason text NOT NULL DEFAULT '' CHECK(length(close_reason)<=1000),
  win_reason text NOT NULL DEFAULT '' CHECK(length(win_reason)<=1000),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(status<>'closed' OR length(btrim(close_reason))>0),
  CHECK(status<>'won' OR length(btrim(win_reason))>0),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(customer_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES tender_customers(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE tender_events (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  tender_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  type text NOT NULL CHECK(type IN ('created','updated','status','comment')),
  text text NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 4000),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL CHECK(length(actor_name)>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  from_status text CHECK(from_status IN ('planned','in_progress','awaiting_decision','won','closed')),
  to_status text CHECK(to_status IN ('planned','in_progress','awaiting_decision','won','closed')),
  CHECK((type='created' AND from_status IS NULL AND to_status IS NOT NULL)
    OR (type='status' AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status<>to_status)
    OR (type IN ('updated','comment') AND from_status IS NULL AND to_status IS NULL)),
  FOREIGN KEY(tender_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES tender_items(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(customer_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES tender_customers(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX tender_customers_scope ON tender_customers(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at);
CREATE INDEX tender_items_scope ON tender_items(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at);
CREATE INDEX tender_items_customer ON tender_items(customer_id,created_at);
CREATE INDEX tender_events_scope ON tender_events(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at);
CREATE INDEX tender_events_tender ON tender_events(tender_id,created_at,id);
CREATE INDEX tender_events_customer ON tender_events(customer_id,created_at,id);
GRANT SELECT,INSERT ON tender_customers,tender_items,tender_events TO transport_app;
GRANT UPDATE(name,version,updated_by,updated_at) ON tender_customers TO transport_app;
GRANT UPDATE(customer_id,title,status,vehicle_count,requirements,delivery_type,expected_launch,launch_notes,
  submission_deadline,next_step,next_step_due,kind,close_reason,win_reason,version,updated_by,updated_at) ON tender_items TO transport_app;
-- No UPDATE or DELETE grant on events: chronology and idempotency keys are immutable.
