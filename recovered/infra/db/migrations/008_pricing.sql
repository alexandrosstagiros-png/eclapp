-- Commercial tariff definitions, calculation evidence and approvals are append-only.
-- The original demo registry formula remains a separate authority.
-- These guards validate storage shape/bounds, not tariff arithmetic (owned by route-v1).
CREATE FUNCTION pricing_json_integer(value jsonb, maximum numeric, nullable boolean DEFAULT false) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(CASE WHEN value='null'::jsonb THEN nullable
    WHEN jsonb_typeof(value)='number' THEN value::numeric BETWEEN 0 AND maximum AND trunc(value::numeric)=value::numeric
    ELSE false END,false);
$$;

CREATE FUNCTION pricing_valid_rules(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE band jsonb; previous_bound numeric := -1;
BEGIN
  IF (jsonb_typeof(value)='object' AND value ?& ARRAY['baseKind','baseKopecks','distanceMetric','distanceBands','includedStops','extraStopKopecks','includedKilometersHundredths','extraKilometerKopecks','includedMinutes','extraTimeUnit','extraTimeKopecks','specialStopKopecks']) IS NOT TRUE THEN RETURN false; END IF;
  IF (value->>'baseKind' IN ('fixed','distance_bands') AND value->>'distanceMetric' IN ('route','warehouse_radius','mkad_radius','leg') AND value->>'extraTimeUnit' IN ('minute','started_hour')) IS NOT TRUE THEN RETURN false; END IF;
  IF jsonb_typeof(value->'distanceBands') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value->'distanceBands') > 30 THEN RETURN false; END IF;
  IF (value->>'baseKind'='fixed' AND jsonb_array_length(value->'distanceBands')<>0) OR (value->>'baseKind'='distance_bands' AND (jsonb_array_length(value->'distanceBands')=0 OR value->'baseKopecks'<>'0'::jsonb)) THEN RETURN false; END IF;
  FOR band IN SELECT * FROM jsonb_array_elements(value->'distanceBands') LOOP
    IF NOT pricing_json_integer(band->'upToHundredths',10000000) OR NOT pricing_json_integer(band->'amountKopecks',1000000000) THEN RETURN false; END IF;
    IF (band->'upToHundredths')::numeric <= previous_bound THEN RETURN false; END IF;
    previous_bound := (band->'upToHundredths')::numeric;
  END LOOP;
  RETURN pricing_json_integer(value->'baseKopecks',1000000000)
    AND pricing_json_integer(value->'includedStops',10000)
    AND pricing_json_integer(value->'extraStopKopecks',1000000000,true)
    AND pricing_json_integer(value->'includedKilometersHundredths',10000000,true)
    AND pricing_json_integer(value->'extraKilometerKopecks',1000000000,true)
    AND pricing_json_integer(value->'includedMinutes',10080,true)
    AND pricing_json_integer(value->'extraTimeKopecks',1000000000,true)
    AND pricing_json_integer(value->'specialStopKopecks',1000000000,true);
END; $$;

CREATE FUNCTION pricing_valid_result(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE line jsonb; total numeric := 0;
BEGIN
  IF (jsonb_typeof(value)='object' AND value ?& ARRAY['engineVersion','lines','totalKopecks','issues'] AND value->>'engineVersion'='route-v1') IS NOT TRUE THEN RETURN false; END IF;
  IF jsonb_typeof(value->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(value->'issues') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF NOT pricing_json_integer(value->'totalKopecks',10000000000000,true) THEN RETURN false; END IF;
  FOR line IN SELECT * FROM jsonb_array_elements(value->'lines') LOOP
    IF (jsonb_typeof(line)='object' AND line ?& ARRAY['code','label','quantity','unit','rateKopecks','amountKopecks','explanation'] AND line->>'unit' IN ('trip','stop','kilometer','minute','hour')) IS NOT TRUE THEN RETURN false; END IF;
    IF NOT pricing_json_integer(line->'rateKopecks',1000000000) OR NOT pricing_json_integer(line->'amountKopecks',10000000000000) THEN RETURN false; END IF;
    IF jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    IF (line->'quantity')::numeric < 0 THEN RETURN false; END IF;
    total := total + (line->'amountKopecks')::numeric;
    IF total > 10000000000000 THEN RETURN false; END IF;
  END LOOP;
  RETURN CASE WHEN value->'totalKopecks'='null'::jsonb THEN jsonb_array_length(value->'issues')>0
    ELSE jsonb_array_length(value->'issues')=0 AND (value->'totalKopecks')::numeric=total END;
END; $$;

CREATE FUNCTION pricing_valid_snapshot(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE input jsonb; facts jsonb; tariff jsonb; remaining numeric;
BEGIN
  IF (jsonb_typeof(value)='object' AND value ?& ARRAY['id','tripId','revision','createdAt','input','facts','factsRevision','clientTariff','executorTariff','client','executor','directCostsKopecks','remainderKopecks','clientConfirmedAt','expensesConfirmedAt','clientStale','expensesStale','stale']) IS NOT TRUE THEN RETURN false; END IF;
  input := value->'input'; facts := value->'facts';
  IF (jsonb_typeof(input)='object' AND input ?& ARRAY['clientTariffId','executorTariffId','executorManualKopecks','executorManualReason','directCostsKopecks','directCostsReason','specialStop','warehouseRadiusHundredths','mkadRadiusHundredths','legDistanceHundredths','factsId','expectedRevision','idempotencyKey']) IS NOT TRUE THEN RETURN false; END IF;
  IF NOT pricing_json_integer(input->'executorManualKopecks',1000000000,true) OR NOT pricing_json_integer(input->'directCostsKopecks',1000000000,true) OR NOT pricing_json_integer(input->'expectedRevision',2147483647) THEN RETURN false; END IF;
  IF input->'executorManualKopecks'<>'null'::jsonb AND input->'executorTariffId'<>'null'::jsonb THEN RETURN false; END IF;
  IF input->'specialStop' NOT IN ('null'::jsonb,'true'::jsonb,'false'::jsonb) OR NOT pricing_json_integer(input->'warehouseRadiusHundredths',10000000,true) OR NOT pricing_json_integer(input->'mkadRadiusHundredths',10000000,true) OR NOT pricing_json_integer(input->'legDistanceHundredths',10000000,true) THEN RETURN false; END IF;
  IF facts<>'null'::jsonb THEN
    IF (jsonb_typeof(facts)='object' AND facts ?& ARRAY['stops','kilometersHundredths','minutes','specialStop','warehouseRadiusHundredths','mkadRadiusHundredths','legDistanceHundredths']) IS NOT TRUE THEN RETURN false; END IF;
    IF NOT pricing_json_integer(facts->'stops',10000) OR NOT pricing_json_integer(facts->'kilometersHundredths',10000000) OR NOT pricing_json_integer(facts->'minutes',10080) THEN RETURN false; END IF;
    IF (facts->'specialStop'=input->'specialStop' AND facts->'warehouseRadiusHundredths'=input->'warehouseRadiusHundredths' AND facts->'mkadRadiusHundredths'=input->'mkadRadiusHundredths' AND facts->'legDistanceHundredths'=input->'legDistanceHundredths') IS NOT TRUE THEN RETURN false; END IF;
  END IF;
  FOREACH tariff IN ARRAY ARRAY[value->'clientTariff',value->'executorTariff'] LOOP
    IF tariff<>'null'::jsonb AND ((jsonb_typeof(tariff)='object' AND pricing_valid_rules(tariff->'rules') AND tariff->>'status'='published' AND tariff->'amountsAreNet'='true'::jsonb) IS NOT TRUE) THEN RETURN false; END IF;
  END LOOP;
  IF NOT pricing_valid_result(value->'client') OR NOT pricing_valid_result(value->'executor') OR NOT pricing_json_integer(value->'directCostsKopecks',1000000000,true) THEN RETURN false; END IF;
  IF input->'executorManualKopecks'<>'null'::jsonb AND value#>'{executor,totalKopecks}' IS DISTINCT FROM input->'executorManualKopecks' THEN RETURN false; END IF;
  IF value->'clientTariff'='null'::jsonb AND value#>'{client,totalKopecks}'<>'null'::jsonb THEN RETURN false; END IF;
  IF value->'executorTariff'='null'::jsonb AND input->'executorManualKopecks'='null'::jsonb AND value#>'{executor,totalKopecks}'<>'null'::jsonb THEN RETURN false; END IF;
  IF (value->'directCostsKopecks'=input->'directCostsKopecks' AND value->'clientConfirmedAt'='null'::jsonb AND value->'expensesConfirmedAt'='null'::jsonb AND value->'clientStale'='false'::jsonb AND value->'expensesStale'='false'::jsonb AND value->'stale'='false'::jsonb) IS NOT TRUE THEN RETURN false; END IF;
  IF value#>'{client,totalKopecks}'='null'::jsonb OR value#>'{executor,totalKopecks}'='null'::jsonb OR value->'directCostsKopecks'='null'::jsonb THEN RETURN value->'remainderKopecks'='null'::jsonb; END IF;
  IF jsonb_typeof(value->'remainderKopecks') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  remaining := (value#>'{client,totalKopecks}')::numeric - (value#>'{executor,totalKopecks}')::numeric - (value->'directCostsKopecks')::numeric;
  RETURN (value->'remainderKopecks')::numeric=remaining;
END; $$;

CREATE TABLE pricing_tariffs (
  id uuid PRIMARY KEY,
  series_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  previous_version_id uuid REFERENCES pricing_tariffs,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL,
  project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  side text NOT NULL CHECK(side IN ('client','executor')),
  contract_reference text NOT NULL CHECK(length(contract_reference) <= 300),
  effective_from date NOT NULL, effective_to date,
  source_text text NOT NULL CHECK(length(source_text) <= 20000),
  terms_note text NOT NULL CHECK(length(terms_note) <= 5000),
  amounts_are_net boolean NOT NULL,
  rules jsonb NOT NULL CHECK(pricing_valid_rules(rules) IS TRUE),
  engine_version text NOT NULL DEFAULT 'route-v1' CHECK(engine_version='route-v1'),
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  CHECK(effective_to IS NULL OR effective_to > effective_from),
  CHECK((version=1 AND previous_version_id IS NULL AND series_id=id) OR (version>1 AND previous_version_id IS NOT NULL)),
  UNIQUE(series_id,version)
);
CREATE INDEX pricing_tariffs_scope ON pricing_tariffs(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC,id);
CREATE INDEX pricing_tariffs_previous ON pricing_tariffs(previous_version_id) WHERE previous_version_id IS NOT NULL;

CREATE TABLE pricing_tariff_publications (
  tariff_id uuid PRIMARY KEY REFERENCES pricing_tariffs,
  published_by uuid NOT NULL REFERENCES users,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE pricing_calculations (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips,
  revision integer NOT NULL CHECK(revision > 0),
  facts_id uuid REFERENCES workflow_facts,
  client_tariff_id uuid REFERENCES pricing_tariffs,
  executor_tariff_id uuid REFERENCES pricing_tariffs,
  snapshot jsonb NOT NULL CHECK(pricing_valid_snapshot(snapshot) IS TRUE),
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL,
  CHECK((snapshot->>'id'=id::text AND snapshot->>'tripId'=trip_id::text AND pricing_json_integer(snapshot->'revision',2147483647) AND (snapshot->>'revision')::integer=revision AND (snapshot#>>'{input,expectedRevision}')::integer=revision-1) IS TRUE),
  CHECK((snapshot#>>'{input,factsId}') IS NOT DISTINCT FROM facts_id::text),
  CHECK((snapshot#>>'{input,clientTariffId}') IS NOT DISTINCT FROM client_tariff_id::text),
  CHECK((snapshot#>>'{input,executorTariffId}') IS NOT DISTINCT FROM executor_tariff_id::text),
  CHECK((snapshot#>>'{clientTariff,id}') IS NOT DISTINCT FROM client_tariff_id::text),
  CHECK((snapshot#>>'{executorTariff,id}') IS NOT DISTINCT FROM executor_tariff_id::text),
  CHECK((client_tariff_id IS NULL) = (snapshot->'clientTariff'='null'::jsonb)),
  CHECK((executor_tariff_id IS NULL) = (snapshot->'executorTariff'='null'::jsonb)),
  CHECK((facts_id IS NULL AND snapshot->'facts'='null'::jsonb AND snapshot->'factsRevision'='null'::jsonb) OR (facts_id IS NOT NULL AND jsonb_typeof(snapshot->'facts')='object' AND pricing_json_integer(snapshot->'factsRevision',2147483647))),
  UNIQUE(trip_id,revision)
);
CREATE INDEX pricing_calculations_latest ON pricing_calculations(trip_id,revision DESC);
CREATE INDEX pricing_calculations_facts ON pricing_calculations(facts_id) WHERE facts_id IS NOT NULL;
CREATE INDEX pricing_calculations_client_tariff ON pricing_calculations(client_tariff_id) WHERE client_tariff_id IS NOT NULL;
CREATE INDEX pricing_calculations_executor_tariff ON pricing_calculations(executor_tariff_id) WHERE executor_tariff_id IS NOT NULL;

-- Snapshots may add manually supplied radii, but cannot replace stored operational
-- facts or the immutable published rules referenced by the relational columns.
CREATE FUNCTION pricing_check_calculation_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pricing_side text; selected_tariff_id uuid;
BEGIN
  IF NEW.facts_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workflow_facts f WHERE f.id=NEW.facts_id AND f.trip_id=NEW.trip_id
      AND f.revision=(NEW.snapshot->>'factsRevision')::integer
      AND f.stops=(NEW.snapshot#>>'{facts,stops}')::integer
      AND f.minutes=(NEW.snapshot#>>'{facts,minutes}')::integer
      AND f.kilometers_hundredths=(NEW.snapshot#>>'{facts,kilometersHundredths}')::integer
  ) THEN RAISE EXCEPTION 'Pricing snapshot facts differ from referenced facts' USING ERRCODE='23514'; END IF;
  FOREACH pricing_side IN ARRAY ARRAY['client','executor'] LOOP
    selected_tariff_id := CASE WHEN pricing_side='client' THEN NEW.client_tariff_id ELSE NEW.executor_tariff_id END;
    IF selected_tariff_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pricing_tariffs p JOIN pricing_tariff_publications publication ON publication.tariff_id=p.id
        JOIN trips t ON t.id=NEW.trip_id AND t.project_id=p.project_id AND t.responsibility_scope_id=p.responsibility_scope_id
          AND t.legal_entity_id=p.legal_entity_id AND t.region_id=p.region_id
      WHERE p.id=selected_tariff_id AND p.side=pricing_side AND p.amounts_are_net
        AND t.business_date>=p.effective_from AND (p.effective_to IS NULL OR t.business_date<p.effective_to)
        AND p.rules=NEW.snapshot->(pricing_side || 'Tariff')->'rules'
        AND p.version=(NEW.snapshot->(pricing_side || 'Tariff')->>'version')::integer
    ) THEN RAISE EXCEPTION 'Pricing snapshot tariff differs from published version' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER pricing_calculation_reference_guard BEFORE INSERT ON pricing_calculations FOR EACH ROW EXECUTE FUNCTION pricing_check_calculation_references();

CREATE TABLE pricing_confirmations (
  calculation_id uuid NOT NULL REFERENCES pricing_calculations,
  part text NOT NULL CHECK(part IN ('client','expenses')),
  evidence jsonb NOT NULL CHECK((jsonb_typeof(evidence)='object' AND evidence ?& ARRAY['factsId','factsRevision','factsReviewId','calculationHash'] AND evidence->>'calculationHash' ~ '^[a-f0-9]{64}$' AND evidence->>'factsReviewId' ~ '^[a-f0-9-]{36}$') IS TRUE),
  confirmed_by uuid NOT NULL REFERENCES users,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(calculation_id,part)
);

CREATE TABLE pricing_requests (
  actor_id uuid NOT NULL REFERENCES users,
  idempotency_key uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('tariff.create','tariff.publish','trip.calculate','calculation.confirm')),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,idempotency_key)
);

CREATE TRIGGER pricing_tariffs_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON pricing_tariffs FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER pricing_publications_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON pricing_tariff_publications FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER pricing_calculations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON pricing_calculations FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER pricing_confirmations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON pricing_confirmations FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER pricing_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON pricing_requests FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
