-- SPDX-License-Identifier: MIT
-- Additive workflow; old manual hires remain unconfirmed.
ALTER TABLE recruitment_activity DROP CONSTRAINT recruitment_activity_kind_check;
ALTER TABLE recruitment_activity ADD CONSTRAINT recruitment_activity_kind_check CHECK(kind IN
 ('scope_visit','data_read','request_view','candidate_created','application_created','stage_changed','task_completed','contact_recorded'));
ALTER TABLE recruitment_requests ADD COLUMN requires_security boolean NOT NULL DEFAULT false;
GRANT UPDATE(requires_security) ON recruitment_requests TO transport_app;
ALTER TABLE recruitment_candidates DROP CONSTRAINT recruitment_candidates_source_check;
ALTER TABLE recruitment_candidates ADD CONSTRAINT recruitment_candidates_source_check CHECK(source IN
 ('manual','avito','ati','hh','referral','vehicle_sticker','telegram','whatsapp','rabota_ru','superjob','joblab','profi','other'));
ALTER TABLE recruitment_applications DROP CONSTRAINT recruitment_applications_stage_check;
ALTER TABLE recruitment_applications ADD CONSTRAINT recruitment_applications_stage_check CHECK(stage IN
 ('new','contact','qualified','interview','security','internship','paperwork','hired','reserve','rejected'));
ALTER TABLE recruitment_events DROP CONSTRAINT recruitment_events_from_stage_check;
ALTER TABLE recruitment_events DROP CONSTRAINT recruitment_events_to_stage_check;
ALTER TABLE recruitment_events ADD CONSTRAINT recruitment_events_from_stage_check CHECK(from_stage IN
 ('new','contact','qualified','interview','security','internship','paperwork','hired','reserve','rejected'));
ALTER TABLE recruitment_events ADD CONSTRAINT recruitment_events_to_stage_check CHECK(to_stage IN
 ('new','contact','qualified','interview','security','internship','paperwork','hired','reserve','rejected'));
ALTER TABLE recruitment_applications
 ADD COLUMN security_status text NOT NULL DEFAULT 'not_requested' CHECK(security_status IN ('not_requested','documents','submitted','in_review','clarification','approved','rejected','not_required')),
 ADD COLUMN security_assignee_id uuid REFERENCES users(id),
 ADD COLUMN security_due_at timestamptz,
 ADD COLUMN attendance_status text NOT NULL DEFAULT 'unconfirmed' CHECK(attendance_status IN ('unconfirmed','confirmed','no_show')),
 ADD COLUMN confirmed_start_date date,
 ADD COLUMN confirmed_by uuid REFERENCES users(id),
 ADD COLUMN confirmed_at timestamptz,
 ADD CONSTRAINT recruitment_confirmed_start_consistent CHECK((attendance_status='confirmed') = (confirmed_start_date IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL));
GRANT UPDATE(security_status,security_assignee_id,security_due_at,attendance_status,confirmed_start_date,confirmed_by,confirmed_at) ON recruitment_applications TO transport_app;
ALTER TABLE recruitment_tasks ADD COLUMN application_id uuid;
ALTER TABLE recruitment_tasks ADD COLUMN workflow_kind text NOT NULL DEFAULT 'manual' CHECK(workflow_kind IN ('manual','security'));
ALTER TABLE recruitment_tasks ADD CONSTRAINT recruitment_tasks_application_fk
 FOREIGN KEY(application_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
 REFERENCES recruitment_applications(id,legal_entity_id,region_id,project_id,responsibility_scope_id);
GRANT UPDATE(application_id) ON recruitment_tasks TO transport_app;
CREATE UNIQUE INDEX recruitment_open_security_task ON recruitment_tasks(application_id) WHERE workflow_kind='security' AND status='open';

CREATE TABLE recruitment_contacts (
 id uuid PRIMARY KEY,
 legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
 candidate_id uuid NOT NULL, application_id uuid,
 result text NOT NULL CHECK(result IN ('inquiry','connected','no_answer','callback','thinking','declined')),
 source text NOT NULL CHECK(source IN ('manual','avito','ati','hh','referral','vehicle_sticker','telegram','whatsapp','rabota_ru','superjob','joblab','profi','other')),
 occurred_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid NOT NULL REFERENCES users(id),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 request_payload jsonb NOT NULL DEFAULT '{}',
 origin text NOT NULL DEFAULT 'app' CHECK(origin IN ('app','import')),
 FOREIGN KEY(candidate_id,legal_entity_id,region_id,project_id,responsibility_scope_id) REFERENCES recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
 FOREIGN KEY(application_id,legal_entity_id,region_id,project_id,responsibility_scope_id) REFERENCES recruitment_applications(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
 CHECK(origin='import' OR occurred_at IS NOT NULL)
);
CREATE INDEX recruitment_contacts_candidate ON recruitment_contacts(candidate_id,occurred_at DESC,id);
CREATE INDEX recruitment_contacts_scope ON recruitment_contacts(responsibility_scope_id,recorded_at DESC,id);
CREATE TABLE recruitment_workflow_events (
 id uuid PRIMARY KEY,
 legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
 application_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('security','start')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid NOT NULL REFERENCES users(id),
 payload jsonb NOT NULL,
 FOREIGN KEY(application_id,legal_entity_id,region_id,project_id,responsibility_scope_id) REFERENCES recruitment_applications(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX recruitment_workflow_events_application ON recruitment_workflow_events(application_id,occurred_at DESC,id);
CREATE INDEX recruitment_tasks_candidate_open ON recruitment_tasks(candidate_id,due_at,id) WHERE status='open';
CREATE INDEX recruitment_candidates_worklist ON recruitment_candidates(responsibility_scope_id,recruiter_id,archived,updated_at DESC,id);
GRANT SELECT,INSERT ON recruitment_contacts,recruitment_workflow_events TO transport_app;
