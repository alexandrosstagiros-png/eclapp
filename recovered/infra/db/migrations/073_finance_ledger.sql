-- Management finance reuses application identities, scopes and audit. Source
-- evidence and balanced operations are append-only; corrections are reversals.
CREATE TABLE finance_ledger_catalogs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('parties','directions','accounts','allocation_rules','plans','import_previews','settings','classification_rules','reconciliations')),
  legal_entity_id uuid NOT NULL REFERENCES legal_entities,
  responsibility_scope_ids uuid[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users,
  updated_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_ledger_catalog_entity_kind ON finance_ledger_catalogs(legal_entity_id,kind) WHERE NOT archived;
CREATE INDEX finance_ledger_catalog_scopes ON finance_ledger_catalogs USING gin(responsibility_scope_ids);

CREATE TABLE finance_ledger_operations (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL REFERENCES legal_entities,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  related_scope_ids uuid[] NOT NULL DEFAULT '{}',
  operation_date date NOT NULL,
  kind text NOT NULL,
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND jsonb_typeof(data->'postings')='array'),
  source_system text,
  source_id text,
  source_version text,
  reverses_id uuid UNIQUE REFERENCES finance_ledger_operations,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(created_by,idempotency_key),
  CHECK((source_system IS NULL AND source_id IS NULL AND source_version IS NULL)
     OR (length(source_system)>0 AND length(source_id)>0 AND length(source_version)>0)),
  CHECK(data->>'id'=id::text AND data->>'legalEntityId'=legal_entity_id::text AND data->>'date'=operation_date::text)
);
CREATE UNIQUE INDEX finance_ledger_operation_source ON finance_ledger_operations(legal_entity_id,source_system,source_id,source_version) WHERE source_system IS NOT NULL;
CREATE INDEX finance_ledger_operation_scope_date ON finance_ledger_operations(responsibility_scope_id,operation_date,id);
CREATE INDEX finance_ledger_operation_related_scopes ON finance_ledger_operations USING gin(related_scope_ids);
CREATE INDEX finance_ledger_operation_entity_date ON finance_ledger_operations(legal_entity_id,operation_date,id);

CREATE FUNCTION check_finance_ledger_postings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p jsonb; total numeric := 0;
BEGIN
  IF jsonb_array_length(NEW.data->'postings')<2 THEN RAISE EXCEPTION 'Finance operation requires balanced postings'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(NEW.data->'postings') LOOP
    IF NOT coalesce(p->>'account','') ~ '^[a-z_]+$'
       OR NOT coalesce(p->>'amountKopecks','') ~ '^-?[0-9]+$'
       OR abs((p->>'amountKopecks')::numeric)>9007199254740991
       OR coalesce(p->>'directionId','')='' THEN
      RAISE EXCEPTION 'Invalid finance posting';
    END IF;
    total := total + (p->>'amountKopecks')::numeric;
  END LOOP;
  IF total<>0 THEN RAISE EXCEPTION 'Finance operation is not balanced'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER finance_ledger_balanced BEFORE INSERT ON finance_ledger_operations FOR EACH ROW EXECUTE FUNCTION check_finance_ledger_postings();
CREATE TRIGGER finance_ledger_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_ledger_operations FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

CREATE TABLE finance_ledger_closures (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL REFERENCES legal_entities,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL CHECK(date_to>=date_from),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(data)='object'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  closed_by uuid NOT NULL REFERENCES users,
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid REFERENCES users,
  reopened_at timestamptz,
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  CHECK((reopened_by IS NULL)=(reopened_at IS NULL))
);
CREATE INDEX finance_ledger_closed_periods ON finance_ledger_closures(responsibility_scope_id,date_from,date_to) WHERE reopened_at IS NULL;

CREATE TABLE finance_ledger_requests (
  actor_id uuid NOT NULL REFERENCES users,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,idempotency_key)
);
CREATE TRIGGER finance_ledger_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_ledger_requests FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

GRANT SELECT,INSERT,UPDATE ON finance_ledger_catalogs TO transport_app;
GRANT SELECT,INSERT ON finance_ledger_operations,finance_ledger_requests TO transport_app;
GRANT SELECT,INSERT,UPDATE ON finance_ledger_closures TO transport_app;
