-- SPDX-License-Identifier: MIT
-- Recruiting data shares the application's complete access tuple. There are no
-- global candidate lookups; a phone is unique within its authorized workspace.
CREATE TABLE recruitment_requests (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  city text NOT NULL CHECK(length(city) BETWEEN 1 AND 100),
  district text NOT NULL DEFAULT '' CHECK(length(district)<=160),
  kind text NOT NULL CHECK(kind IN ('driver','carrier')),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  priority text NOT NULL CHECK(priority IN ('normal','urgent')),
  status text NOT NULL CHECK(status IN ('open','paused','closed')),
  needed_by date,
  recruiter_id uuid NOT NULL REFERENCES users(id),
  schedule text NOT NULL DEFAULT '' CHECK(length(schedule)<=300),
  pay_terms text NOT NULL DEFAULT '' CHECK(length(pay_terms)<=1000),
  vehicle_requirements text NOT NULL DEFAULT '' CHECK(length(vehicle_requirements)<=1000),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  hh_url text NOT NULL DEFAULT '' CHECK(length(hh_url)<=2048),
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(published_at IS NULL OR published_at>=created_at),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE recruitment_candidates (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 160),
  phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'),
  city text NOT NULL CHECK(length(city) BETWEEN 1 AND 100),
  district text NOT NULL DEFAULT '' CHECK(length(district)<=160),
  kind text NOT NULL CHECK(kind IN ('driver','carrier')),
  recruiter_id uuid NOT NULL REFERENCES users(id),
  source text NOT NULL CHECK(source IN ('manual','hh','referral','other')),
  hh_url text NOT NULL DEFAULT '' CHECK(length(hh_url)<=2048),
  license_categories text NOT NULL DEFAULT '' CHECK(length(license_categories)<=80),
  experience text NOT NULL DEFAULT '' CHECK(length(experience)<=500),
  vehicle_type text NOT NULL DEFAULT '' CHECK(length(vehicle_type)<=160),
  vehicle_dimensions text NOT NULL DEFAULT '' CHECK(length(vehicle_dimensions)<=160),
  vehicle_capacity text NOT NULL DEFAULT '' CHECK(length(vehicle_capacity)<=160),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(legal_entity_id,region_id,project_id,responsibility_scope_id,phone),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE recruitment_applications (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  request_id uuid NOT NULL,
  recruiter_id uuid NOT NULL REFERENCES users(id),
  stage text NOT NULL CHECK(stage IN ('new','contact','interview','internship','paperwork','hired','reserve','rejected')),
  reason text NOT NULL DEFAULT '' CHECK(length(reason)<=1000),
  start_date date,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(stage<>'rejected' OR length(btrim(reason))>0),
  CHECK(stage<>'hired' OR start_date IS NOT NULL),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(candidate_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(request_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_requests(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(candidate_id,request_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE recruitment_tasks (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  candidate_id uuid,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
  due_at timestamptz NOT NULL,
  assignee_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK(status IN ('open','done')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((status='done')=(completed_at IS NOT NULL)),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(candidate_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE recruitment_events (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  application_id uuid NOT NULL,
  from_stage text CHECK(from_stage IN ('new','contact','interview','internship','paperwork','hired','reserve','rejected')),
  to_stage text NOT NULL CHECK(to_stage IN ('new','contact','interview','internship','paperwork','hired','reserve','rejected')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid NOT NULL REFERENCES users(id),
  FOREIGN KEY(application_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_applications(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX recruitment_requests_scope ON recruitment_requests(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at);
CREATE INDEX recruitment_candidates_scope ON recruitment_candidates(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at);
CREATE INDEX recruitment_applications_scope ON recruitment_applications(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at);
CREATE INDEX recruitment_tasks_scope ON recruitment_tasks(legal_entity_id,region_id,project_id,responsibility_scope_id,due_at);
CREATE INDEX recruitment_tasks_due ON recruitment_tasks(assignee_id,due_at) WHERE status='open';
CREATE INDEX recruitment_events_scope ON recruitment_events(legal_entity_id,region_id,project_id,responsibility_scope_id,occurred_at);
CREATE INDEX recruitment_events_application ON recruitment_events(application_id,occurred_at);
GRANT SELECT,INSERT ON recruitment_requests,recruitment_candidates,recruitment_applications,recruitment_tasks,recruitment_events TO transport_app;
GRANT UPDATE(title,city,district,kind,quantity,priority,status,needed_by,recruiter_id,schedule,pay_terms,vehicle_requirements,notes,hh_url,published_at,version,updated_by,updated_at) ON recruitment_requests TO transport_app;
GRANT UPDATE(full_name,phone,city,district,kind,recruiter_id,source,hh_url,license_categories,experience,vehicle_type,vehicle_dimensions,vehicle_capacity,notes,archived,version,updated_by,updated_at) ON recruitment_candidates TO transport_app;
GRANT UPDATE(recruiter_id,stage,reason,start_date,version,updated_by,updated_at) ON recruitment_applications TO transport_app;
GRANT UPDATE(candidate_id,title,due_at,assignee_id,status,notes,completed_at,version,updated_by,updated_at) ON recruitment_tasks TO transport_app;
