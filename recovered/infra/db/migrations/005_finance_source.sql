CREATE TABLE finance_registry_sources (
  registry_id uuid PRIMARY KEY REFERENCES finance_registries,
  source_csv text NOT NULL CHECK(octet_length(source_csv) BETWEEN 1 AND 262144),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(encode(digest(convert_to(source_csv,'UTF8'),'sha256'),'hex')=sha256)
);
CREATE TRIGGER finance_registry_source_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_registry_sources FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE FUNCTION prevent_confirmed_finance_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM finance_registries WHERE id=NEW.registry_id AND status='confirmed') THEN
    RAISE EXCEPTION 'Confirmed registry cannot receive additional rows';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER finance_confirmed_insert_guard BEFORE INSERT ON finance_registry_rows FOR EACH ROW EXECUTE FUNCTION prevent_confirmed_finance_insert();
CREATE TRIGGER integration_no_delete BEFORE DELETE OR TRUNCATE ON integration_jobs FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
