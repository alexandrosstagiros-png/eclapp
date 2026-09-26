-- Source-grounded reports and durable, in-application scheduled sharing.
CREATE TABLE team_summary_schedules (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL CHECK(frequency IN ('daily','weekly')),
  local_time text NOT NULL CHECK(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  time_zone text NOT NULL,
  weekday integer NOT NULL DEFAULT 1 CHECK(weekday BETWEEN 1 AND 7),
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  next_run_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  last_run_at timestamptz,
  last_period_end timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  last_error text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE team_summaries (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL CHECK(period_end>period_start),
  message_count integer NOT NULL CHECK(message_count>=0),
  mode text NOT NULL CHECK(mode='extractive'),
  overview text NOT NULL,
  items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),
  source_message_ids uuid[] NOT NULL DEFAULT '{}',
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  schedule_id uuid,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(schedule_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_summary_schedules(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  CHECK((schedule_id IS NULL)=(scheduled_for IS NULL)),
  UNIQUE(schedule_id,scheduled_for)
);
CREATE TABLE team_summary_runs (
  id uuid PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES team_summary_schedules(id),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 1,
  summary_id uuid REFERENCES team_summaries(id),
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE(schedule_id,scheduled_for)
);
CREATE INDEX team_summaries_scope ON team_summaries(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC,id);
CREATE INDEX team_summary_schedules_due ON team_summary_schedules(next_attempt_at,next_run_at,id) WHERE enabled;
GRANT SELECT,INSERT ON team_summaries,team_summary_schedules,team_summary_runs TO transport_app;
GRANT UPDATE(recipient_ids) ON team_summaries TO transport_app;
GRANT UPDATE(enabled,frequency,local_time,time_zone,weekday,recipient_ids,next_run_at,next_attempt_at,last_run_at,last_period_end,attempts,last_error,version,updated_at) ON team_summary_schedules TO transport_app;
GRANT UPDATE(status,attempts,summary_id,error_code,attempted_at,completed_at) ON team_summary_runs TO transport_app;
