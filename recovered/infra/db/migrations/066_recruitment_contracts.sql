-- Contract templates have an editable draft and append-only published editions.
-- Signed originals are durable private records, unlike temporary onboarding photos.
CREATE TABLE recruitment_contract_templates (
 id uuid PRIMARY KEY,
 responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
 legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
 draft jsonb CHECK(draft IS NULL OR jsonb_typeof(draft)='object'),
 published_version integer NOT NULL DEFAULT 0 CHECK(published_version>=0),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE recruitment_contract_template_versions (
 template_id uuid NOT NULL REFERENCES recruitment_contract_templates(id),
 edition integer NOT NULL CHECK(edition>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 published_by uuid NOT NULL REFERENCES users(id),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(template_id,edition)
);
CREATE TABLE recruitment_contract_documents (
 id uuid PRIMARY KEY,
 template_id uuid NOT NULL REFERENCES recruitment_contract_templates(id),
 responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
 legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
 template_snapshot jsonb NOT NULL CHECK(jsonb_typeof(template_snapshot)='object'),
 candidate_id uuid REFERENCES recruitment_candidates(id),
 onboarding_session_id uuid REFERENCES recruitment_onboarding_sessions(id),
 source_document_id uuid REFERENCES recruitment_contract_documents(id),
 content_text text NOT NULL CHECK(length(content_text) BETWEEN 1 AND 100000),
 field_values jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(field_values)='object'),
 number text NOT NULL DEFAULT '' CHECK(length(number)<=160),
 document_date date,
 rendered_text text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','signed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 issued_at timestamptz,
 issued_by uuid REFERENCES users(id),
 signed_date date,
 signed_by uuid REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='draft')=(issued_at IS NULL)),
 CHECK((issued_at IS NULL)=(issued_by IS NULL)),
 CHECK((status='signed')=(signed_date IS NOT NULL)),
 CHECK((signed_date IS NULL)=(signed_by IS NULL))
);
CREATE TABLE recruitment_contract_signed_files (
 document_id uuid PRIMARY KEY REFERENCES recruitment_contract_documents(id),
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 200),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 content bytea NOT NULL CHECK(octet_length(content)=byte_size),
 uploaded_by uuid NOT NULL REFERENCES users(id),
 uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX recruitment_contract_templates_company ON recruitment_contract_templates(legal_entity_id,updated_at);
CREATE INDEX recruitment_contract_documents_company ON recruitment_contract_documents(legal_entity_id,created_by,updated_at);
CREATE INDEX recruitment_contract_documents_candidate ON recruitment_contract_documents(candidate_id);
CREATE INDEX recruitment_contract_documents_onboarding ON recruitment_contract_documents(onboarding_session_id);

CREATE FUNCTION guard_contract_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.template_id,NEW.responsibility_scope_id,NEW.legal_entity_id,NEW.template_snapshot,NEW.candidate_id,NEW.onboarding_session_id,NEW.source_document_id,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.template_id,OLD.responsibility_scope_id,OLD.legal_entity_id,OLD.template_snapshot,OLD.candidate_id,OLD.onboarding_session_id,OLD.source_document_id,OLD.created_by,OLD.created_at) THEN
   RAISE EXCEPTION 'Contract provenance is immutable';
 END IF;
 IF OLD.status='signed' OR (OLD.status='issued' AND (NEW.status<>'signed' OR
    ROW(NEW.content_text,NEW.field_values,NEW.number,NEW.document_date,NEW.rendered_text,NEW.issued_at,NEW.issued_by)
    IS DISTINCT FROM ROW(OLD.content_text,OLD.field_values,OLD.number,OLD.document_date,OLD.rendered_text,OLD.issued_at,OLD.issued_by))) THEN
   RAISE EXCEPTION 'Issued contract content is immutable';
 END IF;
 IF OLD.status='draft' AND NEW.status NOT IN ('draft','issued') THEN
   RAISE EXCEPTION 'Contract must be issued before signing';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER recruitment_contract_document_guard BEFORE UPDATE ON recruitment_contract_documents FOR EACH ROW EXECUTE FUNCTION guard_contract_document();
GRANT SELECT,INSERT ON recruitment_contract_templates,recruitment_contract_template_versions,recruitment_contract_documents,recruitment_contract_signed_files TO transport_app;
GRANT UPDATE(draft,published_version,version,updated_at) ON recruitment_contract_templates TO transport_app;
GRANT UPDATE(content_text,field_values,number,document_date,rendered_text,status,version,issued_at,issued_by,signed_date,signed_by,updated_at) ON recruitment_contract_documents TO transport_app;
