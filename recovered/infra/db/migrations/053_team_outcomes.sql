-- Durable, scope-specific reporting assignments and submitted recognition.
CREATE TABLE team_outcome_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  feature_started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO team_outcome_state(singleton) VALUES(true);
GRANT SELECT ON team_outcome_state TO transport_app;
CREATE TABLE team_outcome_reports (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  owner_name text NOT NULL,
  subordinate_ids uuid[] NOT NULL CHECK(cardinality(subordinate_ids)>0),
  kind text NOT NULL CHECK(kind IN ('weekly','monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK(period_end>=period_start),
  due_at timestamptz NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  done text NOT NULL DEFAULT '' CHECK(length(done)<=6000),
  in_progress text NOT NULL DEFAULT '' CHECK(length(in_progress)<=6000),
  blockers text NOT NULL DEFAULT '' CHECK(length(blockers)<=6000),
  next_month_focus text NOT NULL DEFAULT '' CHECK(length(next_month_focus)<=6000),
  gratitude jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(gratitude)='array' AND jsonb_array_length(gratitude)<=20),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_at timestamptz,
  CHECK(submitted_at IS NULL OR (length(btrim(done))>0 AND length(btrim(in_progress))>0 AND length(btrim(blockers))>0 AND (kind='weekly' OR length(btrim(next_month_focus))>0))),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(responsibility_scope_id,owner_id,kind,period_start),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_outcome_reports_scope_period ON team_outcome_reports(responsibility_scope_id,kind,period_start DESC,owner_id);
CREATE TABLE team_outcome_operations (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(report_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_outcome_reports(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE team_outcome_recognition (
  report_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES users(id),
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason))>0 AND length(reason)<=1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(report_id,recipient_id),
  FOREIGN KEY(report_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_outcome_reports(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_outcome_recognition_recipient ON team_outcome_recognition(responsibility_scope_id,recipient_id);
CREATE TRIGGER team_outcome_operations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_outcome_operations
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER team_outcome_recognition_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_outcome_recognition
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE FUNCTION guard_team_outcome_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Submitted reports are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_outcome_submitted_immutable BEFORE UPDATE ON team_outcome_reports
  FOR EACH ROW EXECUTE FUNCTION guard_team_outcome_submission();
CREATE FUNCTION guard_team_outcome_recognition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM team_outcome_reports r WHERE r.id=NEW.report_id AND r.submitted_at IS NOT NULL
    AND r.xmin::text=pg_current_xact_id()::text AND r.owner_id<>NEW.recipient_id
    AND r.gratitude @> jsonb_build_array(jsonb_build_object('recipientId',NEW.recipient_id,'reason',NEW.reason))) THEN
    RAISE EXCEPTION 'Recognition must match the report submission transaction' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_outcome_recognition_submission BEFORE INSERT ON team_outcome_recognition
  FOR EACH ROW EXECUTE FUNCTION guard_team_outcome_recognition();
GRANT SELECT,INSERT ON team_outcome_reports,team_outcome_operations,team_outcome_recognition TO transport_app;
GRANT UPDATE(done,in_progress,blockers,next_month_focus,gratitude,version,updated_at,submitted_at) ON team_outcome_reports TO transport_app;
