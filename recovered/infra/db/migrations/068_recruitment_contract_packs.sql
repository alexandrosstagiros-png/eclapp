-- Published catalog entries remain normal editable contract templates. Installing
-- a later catalog only inserts missing keys; it never replaces local editions.
ALTER TABLE recruitment_contract_templates
 ADD COLUMN catalog_key text CHECK(catalog_key IS NULL OR catalog_key ~ '^[a-z][a-z0-9_-]{0,99}$'),
 ADD COLUMN pack_kind text CHECK(pack_kind IS NULL OR pack_kind IN ('employee','carrier')),
 ADD COLUMN pack_metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(pack_metadata)='object');
CREATE UNIQUE INDEX recruitment_contract_template_catalog_key
 ON recruitment_contract_templates(responsibility_scope_id,catalog_key) WHERE catalog_key IS NOT NULL;

CREATE TABLE recruitment_contract_packs (
 id uuid PRIMARY KEY,
 responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
 legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
 kind text NOT NULL CHECK(kind IN ('employee','carrier')),
 candidate_id uuid REFERENCES recruitment_candidates(id),
 onboarding_session_id uuid REFERENCES recruitment_onboarding_sessions(id),
 number text NOT NULL CHECK(length(number) BETWEEN 1 AND 160),
 document_date date NOT NULL,
 document_count integer NOT NULL CHECK(document_count BETWEEN 1 AND 80),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(created_by,idempotency_key),
 UNIQUE(responsibility_scope_id,kind,number)
);
CREATE INDEX recruitment_contract_packs_company ON recruitment_contract_packs(legal_entity_id,created_by,created_at);
ALTER TABLE recruitment_contract_documents
 ADD COLUMN pack_id uuid REFERENCES recruitment_contract_packs(id),
 ADD COLUMN pack_position integer,
 ADD CONSTRAINT recruitment_contract_document_pack_pair CHECK((pack_id IS NULL)=(pack_position IS NULL)),
 ADD CONSTRAINT recruitment_contract_document_pack_position CHECK(pack_position BETWEEN 1 AND 80),
 ADD CONSTRAINT recruitment_contract_document_pack_order UNIQUE(pack_id,pack_position),
 ADD CONSTRAINT recruitment_contract_document_pack_template UNIQUE(pack_id,template_id);

CREATE FUNCTION guard_contract_pack() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Issued contract pack is immutable';
END;
$$;
CREATE TRIGGER recruitment_contract_pack_guard BEFORE UPDATE OR DELETE ON recruitment_contract_packs
 FOR EACH ROW EXECUTE FUNCTION guard_contract_pack();
CREATE FUNCTION guard_contract_document_pack() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.pack_id,NEW.pack_position) IS DISTINCT FROM ROW(OLD.pack_id,OLD.pack_position) THEN
   RAISE EXCEPTION 'Contract pack provenance is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER recruitment_contract_document_pack_guard BEFORE UPDATE ON recruitment_contract_documents
 FOR EACH ROW EXECUTE FUNCTION guard_contract_document_pack();
GRANT SELECT,INSERT ON recruitment_contract_packs TO transport_app;

-- Reusable organization data, separate from employee/carrier snapshots.
CREATE TABLE recruitment_contract_pack_settings (
 responsibility_scope_id uuid PRIMARY KEY REFERENCES responsibility_scopes(id),
 legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
 field_values jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(field_values)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT,INSERT ON recruitment_contract_pack_settings TO transport_app;
GRANT UPDATE(field_values,version,updated_by,updated_at) ON recruitment_contract_pack_settings TO transport_app;

CREATE TABLE recruitment_contract_pack_sequences (
 responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
 kind text NOT NULL CHECK(kind IN ('employee','carrier')),
 year integer NOT NULL CHECK(year BETWEEN 1 AND 9999),
 next_number integer NOT NULL CHECK(next_number>0),
 PRIMARY KEY(responsibility_scope_id,kind,year)
);
GRANT SELECT,INSERT ON recruitment_contract_pack_sequences TO transport_app;
GRANT UPDATE(next_number) ON recruitment_contract_pack_sequences TO transport_app;

ALTER TABLE recruitment_onboarding_templates ADD COLUMN source_catalog_key text;
CREATE UNIQUE INDEX recruitment_onboarding_template_source_key
 ON recruitment_onboarding_templates(responsibility_scope_id,source_catalog_key) WHERE source_catalog_key IS NOT NULL;
