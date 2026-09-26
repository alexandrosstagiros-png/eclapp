CREATE TABLE finance_tariffs (
  id uuid PRIMARY KEY, legal_entity_id uuid NOT NULL, region_id uuid NOT NULL,
  project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0), effective_from date NOT NULL, effective_to date,
  base_kopecks bigint NOT NULL CHECK(base_kopecks BETWEEN 0 AND 1000000000),
  per_stop_kopecks bigint NOT NULL CHECK(per_stop_kopecks BETWEEN 0 AND 1000000000),
  per_waiting_minute_kopecks bigint NOT NULL CHECK(per_waiting_minute_kopecks BETWEEN 0 AND 1000000000),
  authority text NOT NULL DEFAULT 'demo_manual' CHECK(authority='demo_manual'),
  formula_version text NOT NULL DEFAULT 'demo-v1' CHECK(formula_version='demo-v1'),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL, request_hash text NOT NULL CHECK(length(request_hash)=64),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  CHECK(effective_to IS NULL OR effective_to > effective_from),
  UNIQUE(project_id,responsibility_scope_id,version), UNIQUE(created_by,idempotency_key)
);
CREATE INDEX finance_tariff_scope_dates ON finance_tariffs(legal_entity_id,region_id,project_id,responsibility_scope_id,effective_from,effective_to);
CREATE FUNCTION enforce_finance_tariff_interval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('finance-tariff:' || NEW.project_id::text || ':' || NEW.responsibility_scope_id::text,0));
  IF EXISTS(SELECT 1 FROM finance_tariffs t WHERE t.project_id=NEW.project_id AND t.responsibility_scope_id=NEW.responsibility_scope_id
      AND daterange(t.effective_from,t.effective_to,'[)') && daterange(NEW.effective_from,NEW.effective_to,'[)')) THEN
    RAISE EXCEPTION 'Tariff intervals overlap' USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER finance_tariff_interval BEFORE INSERT ON finance_tariffs FOR EACH ROW EXECUTE FUNCTION enforce_finance_tariff_interval();
CREATE TRIGGER finance_tariff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_tariffs FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

CREATE TABLE finance_registries (
  id uuid PRIMARY KEY, legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),
  authority text NOT NULL DEFAULT 'demo_manual' CHECK(authority='demo_manual'),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES users, confirmed_at timestamptz, confirmation_key text,
  idempotency_key text NOT NULL, request_hash text NOT NULL CHECK(length(request_hash)=64),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(created_by,idempotency_key),
  CHECK((status='draft' AND confirmed_at IS NULL AND confirmed_by IS NULL AND confirmation_key IS NULL)
    OR (status='confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND confirmation_key IS NOT NULL))
);
CREATE INDEX finance_registries_scope ON finance_registries(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC,id);
CREATE TABLE finance_registry_rows (
  registry_id uuid NOT NULL REFERENCES finance_registries, row_number integer NOT NULL CHECK(row_number > 1),
  trip_reference text NOT NULL, trip_id uuid NOT NULL REFERENCES trips,
  claimed_kopecks bigint NOT NULL CHECK(claimed_kopecks BETWEEN 0 AND 10000000000000),
  expected_kopecks bigint CHECK(expected_kopecks BETWEEN 0 AND 10000000000000),
  facts_id uuid REFERENCES workflow_facts, tariff_id uuid REFERENCES finance_tariffs,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reasons)='array'),
  PRIMARY KEY(registry_id,row_number), UNIQUE(registry_id,trip_id)
);
CREATE INDEX finance_registry_rows_trip ON finance_registry_rows(trip_id,registry_id);
-- A trip can be paid by one confirmed registry; the unique index is the final concurrent safeguard.
CREATE TABLE finance_confirmed_trips (
  trip_id uuid PRIMARY KEY REFERENCES trips, registry_id uuid NOT NULL REFERENCES finance_registries,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_confirmed_registry ON finance_confirmed_trips(registry_id);
CREATE TRIGGER finance_confirmed_trips_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_confirmed_trips FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE FUNCTION protect_confirmed_finance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='finance_registries' THEN
    IF OLD.status='confirmed' THEN RAISE EXCEPTION 'Confirmed registry is immutable'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM finance_registries WHERE id=OLD.registry_id AND status='confirmed') THEN
      RAISE EXCEPTION 'Confirmed registry rows are immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
CREATE TRIGGER finance_registry_immutable BEFORE UPDATE OR DELETE ON finance_registries FOR EACH ROW EXECUTE FUNCTION protect_confirmed_finance();
CREATE TRIGGER finance_rows_immutable BEFORE UPDATE OR DELETE ON finance_registry_rows FOR EACH ROW EXECUTE FUNCTION protect_confirmed_finance();

CREATE TABLE integration_jobs (
  id uuid PRIMARY KEY, registry_id uuid NOT NULL UNIQUE REFERENCES finance_registries,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(payload->>'schemaVersion'='transport.registry.v1'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','acknowledged','failed')),
  delivery_mode text NOT NULL DEFAULT 'manual' CHECK(delivery_mode IN ('manual','http')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz,
  source_document_id text, acknowledgment_key text, last_error_code text,
  CHECK((status='acknowledged' AND acknowledged_at IS NOT NULL AND source_document_id IS NOT NULL)
    OR (status <> 'acknowledged' AND acknowledged_at IS NULL AND source_document_id IS NULL))
);
CREATE INDEX integration_jobs_scope ON integration_jobs(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC,id);
CREATE INDEX integration_jobs_due ON integration_jobs(next_attempt_at,created_at) WHERE status IN ('pending','processing');
CREATE FUNCTION protect_integration_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='acknowledged' OR OLD.payload IS DISTINCT FROM NEW.payload OR OLD.registry_id IS DISTINCT FROM NEW.registry_id
    OR OLD.id IS DISTINCT FROM NEW.id OR OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
    OR OLD.region_id IS DISTINCT FROM NEW.region_id OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.responsibility_scope_id IS DISTINCT FROM NEW.responsibility_scope_id THEN
    RAISE EXCEPTION 'Integration evidence is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER integration_payload_immutable BEFORE UPDATE ON integration_jobs FOR EACH ROW EXECUTE FUNCTION protect_integration_payload();
