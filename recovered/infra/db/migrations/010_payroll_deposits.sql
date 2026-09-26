-- Append-only salary/deposit evidence. Account identity is immutable; balances derive from the ledger.
CREATE TABLE payroll_deposit_accounts (
  id uuid PRIMARY KEY, driver_id uuid NOT NULL REFERENCES users,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(driver_id,project_id,responsibility_scope_id)
);
CREATE INDEX payroll_deposit_accounts_scope ON payroll_deposit_accounts(legal_entity_id,region_id,project_id,responsibility_scope_id,driver_id);
CREATE TABLE payroll_deposit_policies (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES payroll_deposit_accounts,
  version integer NOT NULL CHECK(version>0), target_kopecks bigint NOT NULL DEFAULT 3000000 CHECK(target_kopecks BETWEEN 0 AND 1000000000000),
  max_contribution_basis_points integer NOT NULL DEFAULT 5000 CHECK(max_contribution_basis_points BETWEEN 0 AND 10000),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(account_id,version)
);
CREATE TABLE driver_payroll_settlements (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES payroll_deposit_accounts,
  period_start date NOT NULL, period_end date NOT NULL,
  snapshot jsonb NOT NULL CHECK((jsonb_typeof(snapshot)='object' AND snapshot->>'status'='approved' AND snapshot ? 'settlement') IS TRUE),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(period_start BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND period_end>=period_start AND period_end-period_start<=366),
  UNIQUE(account_id,period_start,period_end)
);
CREATE INDEX driver_payroll_settlements_account_period ON driver_payroll_settlements(account_id,period_end DESC,period_start DESC);
CREATE TABLE payroll_deposit_returns (
  id uuid PRIMARY KEY, account_id uuid NOT NULL UNIQUE REFERENCES payroll_deposit_accounts,
  termination_date date NOT NULL CHECK(termination_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  amount_kopecks bigint NOT NULL CHECK(amount_kopecks BETWEEN 0 AND 1000000000000),
  reconciliation_reference text NOT NULL CHECK(length(btrim(reconciliation_reference)) BETWEEN 1 AND 300),
  explanation text NOT NULL CHECK(length(btrim(explanation)) BETWEEN 1 AND 2000),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(id,account_id)
);
CREATE TABLE payroll_deposit_return_payments (
  id uuid PRIMARY KEY, account_id uuid NOT NULL UNIQUE REFERENCES payroll_deposit_accounts,
  return_id uuid NOT NULL UNIQUE REFERENCES payroll_deposit_returns,
  payment_date date NOT NULL CHECK(payment_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  payment_reference text NOT NULL CHECK(length(btrim(payment_reference)) BETWEEN 1 AND 300),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(return_id,account_id) REFERENCES payroll_deposit_returns(id,account_id)
);
CREATE TABLE payroll_deposit_ledger (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES payroll_deposit_accounts,
  sequence integer NOT NULL CHECK(sequence>0), kind text NOT NULL CHECK(kind IN ('contribution','deduction','return')),
  amount_kopecks bigint NOT NULL CHECK(amount_kopecks BETWEEN -1000000000000 AND 1000000000000 AND amount_kopecks<>0),
  balance_after_kopecks bigint NOT NULL CHECK(balance_after_kopecks BETWEEN 0 AND 1000000000000),
  statement_id uuid REFERENCES driver_payroll_settlements, return_id uuid REFERENCES payroll_deposit_returns,
  explanation text NOT NULL CHECK(length(btrim(explanation)) BETWEEN 1 AND 2000),
  source_reference text NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 1 AND 300),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((kind='contribution' AND amount_kopecks>0) OR (kind IN ('deduction','return') AND amount_kopecks<0)),
  CHECK((kind='return' AND return_id IS NOT NULL AND statement_id IS NULL) OR (kind<>'return' AND statement_id IS NOT NULL AND return_id IS NULL)),
  UNIQUE(account_id,sequence), UNIQUE(statement_id,kind), UNIQUE(return_id,kind)
);
CREATE TABLE payroll_deposit_requests (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES payroll_deposit_accounts,
  created_by uuid NOT NULL REFERENCES users, idempotency_key uuid NOT NULL, operation text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(created_by,idempotency_key)
);
CREATE FUNCTION payroll_deposit_validate_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_balance bigint; previous_sequence integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll-account:' || NEW.account_id::text,0));
  SELECT balance_after_kopecks,sequence INTO previous_balance,previous_sequence FROM payroll_deposit_ledger WHERE account_id=NEW.account_id ORDER BY sequence DESC LIMIT 1;
  IF NEW.sequence<>coalesce(previous_sequence,0)+1 OR NEW.balance_after_kopecks<>coalesce(previous_balance,0)+NEW.amount_kopecks THEN RAISE EXCEPTION 'Invalid deposit ledger continuity'; END IF;
  IF NEW.statement_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM driver_payroll_settlements WHERE id=NEW.statement_id AND account_id=NEW.account_id) THEN RAISE EXCEPTION 'Deposit statement scope mismatch'; END IF;
  IF NEW.return_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payroll_deposit_returns WHERE id=NEW.return_id AND account_id=NEW.account_id AND amount_kopecks=-NEW.amount_kopecks) THEN RAISE EXCEPTION 'Deposit return scope mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payroll_deposit_ledger_validate BEFORE INSERT ON payroll_deposit_ledger FOR EACH ROW EXECUTE FUNCTION payroll_deposit_validate_entry();
CREATE FUNCTION payroll_deposit_validate_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account payroll_deposit_accounts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll-account:' || NEW.account_id::text,0));
  SELECT * INTO account FROM payroll_deposit_accounts WHERE id=NEW.account_id;
  IF EXISTS(SELECT 1 FROM payroll_deposit_returns WHERE account_id=NEW.account_id) THEN RAISE EXCEPTION 'Deposit account already reconciled'; END IF;
  IF EXISTS(SELECT 1 FROM driver_payroll_settlements WHERE account_id=NEW.account_id AND period_end>NEW.period_end) THEN RAISE EXCEPTION 'Payroll periods must be confirmed chronologically'; END IF;
  IF (NEW.snapshot->>'id'=NEW.id::text AND NEW.snapshot->>'periodStart'=NEW.period_start::text AND NEW.snapshot->>'periodEnd'=NEW.period_end::text AND NEW.snapshot->'project'->>'id'=account.project_id::text AND NEW.snapshot->'legalEntity'->>'id'=account.legal_entity_id::text AND NEW.snapshot->'responsibilityScope'->>'id'=account.responsibility_scope_id::text) IS NOT TRUE THEN RAISE EXCEPTION 'Payroll snapshot scope mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM driver_payroll_settlements WHERE account_id=NEW.account_id AND period_start<=NEW.period_end AND period_end>=NEW.period_start)
    OR EXISTS(SELECT 1 FROM driver_payroll_statements WHERE driver_id=account.driver_id AND project_id=account.project_id AND responsibility_scope_id=account.responsibility_scope_id AND status='approved' AND period_start<=NEW.period_end AND period_end>=NEW.period_start)
    THEN RAISE EXCEPTION 'Payroll period overlaps approved statement'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER driver_payroll_settlements_validate BEFORE INSERT ON driver_payroll_settlements FOR EACH ROW EXECUTE FUNCTION payroll_deposit_validate_period();
CREATE FUNCTION payroll_deposit_valid_snapshot(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE calc jsonb := value->'settlement'; earned numeric; deducted numeric; paid numeric;
BEGIN
  IF NOT payroll_valid_lines(value->'earnings') OR NOT payroll_valid_lines(value->'deductions') OR NOT payroll_valid_lines(value->'payments') THEN RETURN false; END IF;
  SELECT coalesce(sum((line->>'amountKopecks')::numeric),0) INTO earned FROM jsonb_array_elements(value->'earnings') line;
  SELECT coalesce(sum((line->>'amountKopecks')::numeric),0) INTO deducted FROM jsonb_array_elements(value->'deductions') line;
  SELECT coalesce(sum((line->>'amountKopecks')::numeric),0) INTO paid FROM jsonb_array_elements(value->'payments') line;
  RETURN (calc->>'formulaVersion'='deposit-v1' AND (calc->>'canConfirm')::boolean AND (calc->>'uncoveredKopecks')::numeric=0
    AND value->>'sourceKind' IN ('demo_manual','manual_verified') AND value->>'currency'='RUB'
    AND (value->>'openingBalanceKopecks')::numeric=0 AND (value->>'earnedKopecks')::numeric=earned
    AND (value->>'deductedKopecks')::numeric=deducted AND (value->>'paidKopecks')::numeric=paid
    AND (value->>'netKopecks')::numeric=earned-deducted AND (value->>'balanceKopecks')::numeric=earned-deducted-paid
    AND (calc->>'totalPayableKopecks')::numeric=earned-deducted-paid AND (calc->>'grossKopecks')::numeric=earned
    AND (calc->>'salaryChargesKopecks')::numeric+(calc->>'depositContributionKopecks')::numeric=deducted
    AND (calc->>'depositOpeningKopecks')::numeric-(calc->>'depositUsedKopecks')::numeric+(calc->>'depositContributionKopecks')::numeric=(calc->>'depositClosingKopecks')::numeric) IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;
ALTER TABLE driver_payroll_settlements ADD CONSTRAINT driver_payroll_settlement_arithmetic CHECK(payroll_deposit_valid_snapshot(snapshot) IS TRUE);
CREATE FUNCTION payroll_deposit_audit_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account payroll_deposit_accounts; account_id_value uuid;
BEGIN
  account_id_value := CASE WHEN TG_TABLE_NAME='payroll_deposit_accounts' THEN NEW.id ELSE (to_jsonb(NEW)->>'account_id')::uuid END;
  SELECT * INTO account FROM payroll_deposit_accounts WHERE id=account_id_value;
  PERFORM append_audit(jsonb_build_object('schemaVersion',1,'actorId',NEW.created_by,'action','payroll.' || TG_TABLE_NAME || '_recorded',
    'entityType',TG_TABLE_NAME,'entityId',NEW.id,'channel','system','correlationId',gen_random_uuid(),
    'scope',jsonb_build_object('legalEntityId',account.legal_entity_id,'regionId',account.region_id,'projectId',account.project_id,'responsibilityScopeId',account.responsibility_scope_id),
    'metadata',jsonb_build_object('accountId',account_id_value,'snapshotHash',encode(digest(convert_to(to_jsonb(NEW)::text,'UTF8'),'sha256'),'hex'))));
  RETURN NEW;
END; $$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['payroll_deposit_accounts','payroll_deposit_policies','driver_payroll_settlements','payroll_deposit_returns','payroll_deposit_return_payments','payroll_deposit_ledger','payroll_deposit_requests'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation()',name || '_immutable',name);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION payroll_deposit_audit_insert()',name || '_recorded',name);
  END LOOP;
END; $$;
