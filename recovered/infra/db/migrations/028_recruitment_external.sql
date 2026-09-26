-- SPDX-License-Identifier: MIT
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
 CHECK(role IN ('driver','dispatcher','manager','recruiter','external_recruiter','document_specialist','mechanic','access_admin','auditor'));
ALTER TABLE recruitment_requests
 ADD COLUMN public_brief text NOT NULL DEFAULT '' CHECK(length(public_brief)<=4000),
 ADD COLUMN warehouse_address text NOT NULL DEFAULT '' CHECK(length(warehouse_address)<=500),
 ADD COLUMN route_info text NOT NULL DEFAULT '' CHECK(length(route_info)<=1000),
 ADD COLUMN training_terms text NOT NULL DEFAULT '' CHECK(length(training_terms)<=1000),
 ADD COLUMN driver_requirements text NOT NULL DEFAULT '' CHECK(length(driver_requirements)<=1000);
GRANT UPDATE(public_brief,warehouse_address,route_info,training_terms,driver_requirements) ON recruitment_requests TO transport_app;

-- An access_grant alone never exposes recruiting data to an external recruiter.
CREATE TABLE recruitment_external_access (
 user_id uuid NOT NULL REFERENCES users(id),
 legal_entity_id uuid NOT NULL,
 region_id uuid NOT NULL,
 project_id uuid NOT NULL,
 responsibility_scope_id uuid NOT NULL,
 request_ids uuid[] NOT NULL DEFAULT '{}',
 status text NOT NULL CHECK(status IN ('active','revoked')),
 expires_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(user_id,responsibility_scope_id),
 FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
 FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
 CHECK(cardinality(request_ids)<=10000)
);
GRANT SELECT,INSERT ON recruitment_external_access TO transport_app;
GRANT UPDATE(request_ids,status,expires_at,version,updated_at,updated_by) ON recruitment_external_access TO transport_app;

-- Server-authored append-only activity; no client timestamps, user ids or counts.
CREATE TABLE recruitment_activity (
 id uuid PRIMARY KEY,
 legal_entity_id uuid NOT NULL,
 region_id uuid NOT NULL,
 project_id uuid NOT NULL,
 responsibility_scope_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('scope_visit','data_read','request_view','candidate_created','application_created','stage_changed','task_completed')),
 entity_id uuid,
 request_id uuid,
 from_stage text,
 to_stage text,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 dedupe_key text NOT NULL,
 UNIQUE(actor_id,responsibility_scope_id,kind,dedupe_key),
 FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
 FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE INDEX recruitment_activity_scope ON recruitment_activity(responsibility_scope_id,occurred_at,actor_id);
CREATE INDEX recruitment_activity_actor ON recruitment_activity(actor_id,responsibility_scope_id,occurred_at);
GRANT SELECT,INSERT ON recruitment_activity TO transport_app;
