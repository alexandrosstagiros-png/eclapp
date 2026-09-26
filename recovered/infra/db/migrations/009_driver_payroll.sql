-- A salary statement is an immutable, explicitly supplied snapshot, not a client tariff calculation.
CREATE FUNCTION payroll_valid_lines(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE line jsonb; total numeric := 0; ids text[] := ARRAY[]::text[]; line_date date;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value)>400 THEN RETURN false; END IF;
  FOR line IN SELECT * FROM jsonb_array_elements(value) LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT line ?& ARRAY['id','date','label','quantityHundredths','unit','rateKopecks','amountKopecks','explanation','sourceReference']
      OR (SELECT count(*) FROM jsonb_object_keys(line))<>9 THEN RETURN false; END IF;
    IF (jsonb_typeof(line->'id')='string' AND length(line->>'id') BETWEEN 1 AND 100
      AND jsonb_typeof(line->'date')='string' AND line->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND jsonb_typeof(line->'label')='string' AND length(btrim(line->>'label')) BETWEEN 1 AND 200
      AND jsonb_typeof(line->'explanation')='string' AND length(btrim(line->>'explanation')) BETWEEN 1 AND 2000
      AND jsonb_typeof(line->'sourceReference')='string' AND length(btrim(line->>'sourceReference')) BETWEEN 1 AND 300
      AND line->>'unit' IN ('shift','hour','trip','stop','kilometer','day','item','payment')) IS NOT TRUE THEN RETURN false; END IF;
    line_date := (line->>'date')::date;
    IF to_char(line_date,'YYYY-MM-DD')<>line->>'date' THEN RETURN false; END IF;
    IF line->>'id'=ANY(ids) THEN RETURN false; END IF;
    ids := array_append(ids,line->>'id');
    IF NOT pricing_json_integer(line->'quantityHundredths',1000000000)
      OR (line->'quantityHundredths')::numeric=0
      OR NOT pricing_json_integer(line->'rateKopecks',1000000000)
      OR NOT pricing_json_integer(line->'amountKopecks',1000000000000) THEN RETURN false; END IF;
    IF (line->'amountKopecks')::numeric<>floor(((line->'quantityHundredths')::numeric*(line->'rateKopecks')::numeric+50)/100) THEN RETURN false; END IF;
    total := total+(line->'amountKopecks')::numeric;
    IF total>1000000000000 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;

CREATE TABLE driver_payroll_statements (
  id uuid PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES users,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL,
  project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  period_start date NOT NULL, period_end date NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  status text NOT NULL CHECK(status IN ('preliminary','approved')),
  source_kind text NOT NULL CHECK(source_kind IN ('demo_manual','manual_verified')),
  calculated_at timestamptz NOT NULL,
  approved_at timestamptz, approved_by uuid REFERENCES users,
  opening_balance_kopecks bigint NOT NULL CHECK(opening_balance_kopecks BETWEEN -1000000000000 AND 1000000000000),
  opening_balance_explanation text NOT NULL CHECK(length(btrim(opening_balance_explanation)) BETWEEN 1 AND 2000),
  earnings jsonb NOT NULL CHECK(payroll_valid_lines(earnings) IS TRUE),
  deductions jsonb NOT NULL CHECK(payroll_valid_lines(deductions) IS TRUE),
  payments jsonb NOT NULL CHECK(payroll_valid_lines(payments) IS TRUE),
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  CHECK(period_start BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND period_end>=period_start AND period_end-period_start<=366),
  CHECK((status='preliminary' AND approved_at IS NULL AND approved_by IS NULL)
    OR (status='approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_at>=calculated_at)),
  UNIQUE(driver_id,project_id,responsibility_scope_id,period_start,period_end,revision)
);
CREATE INDEX driver_payroll_scope_period ON driver_payroll_statements(driver_id,legal_entity_id,region_id,project_id,responsibility_scope_id,period_end DESC,period_start DESC,revision DESC);
CREATE INDEX driver_payroll_driver_period ON driver_payroll_statements(driver_id,period_end DESC,period_start DESC,calculated_at DESC,id DESC);

CREATE FUNCTION payroll_audit_statement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM append_audit(jsonb_build_object('schemaVersion',1,'actorId',NEW.created_by,
    'action','payroll.statement_recorded','entityType','driver_payroll','entityId',NEW.id,
    'channel','system','correlationId',gen_random_uuid(),
    'scope',jsonb_build_object('legalEntityId',NEW.legal_entity_id,'regionId',NEW.region_id,
      'projectId',NEW.project_id,'responsibilityScopeId',NEW.responsibility_scope_id),
    'metadata',jsonb_build_object('revision',NEW.revision,'status',NEW.status,'sourceKind',NEW.source_kind,
      'snapshotHash',encode(digest(convert_to(to_jsonb(NEW)::text,'UTF8'),'sha256'),'hex'))));
  RETURN NEW;
END; $$;
CREATE TRIGGER driver_payroll_recorded AFTER INSERT ON driver_payroll_statements FOR EACH ROW EXECUTE FUNCTION payroll_audit_statement();
CREATE TRIGGER driver_payroll_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON driver_payroll_statements FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
