-- Forms and their immutable per-candidate snapshots. Photo bytes deliberately
-- live outside PostgreSQL in a private, temporary spool excluded from backups.
CREATE TABLE recruitment_onboarding_templates (
 id uuid PRIMARY KEY,
 responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
 legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 destination text NOT NULL CHECK(length(destination) BETWEEN 1 AND 160),
 employment_type text NOT NULL CHECK(employment_type IN ('employee','ip','self_employed')),
 description text NOT NULL DEFAULT '', privacy_notice text NOT NULL DEFAULT '',
 fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='array'),
 documents jsonb NOT NULL CHECK(jsonb_typeof(documents)='array'),
 active boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE recruitment_onboarding_sessions (
 id uuid PRIMARY KEY,
 template_id uuid NOT NULL REFERENCES recruitment_onboarding_templates(id),
 responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
 legal_entity_id uuid NOT NULL REFERENCES legal_entities(id),
 template_snapshot jsonb NOT NULL CHECK(jsonb_typeof(template_snapshot)='object'),
 candidate_id uuid REFERENCES recruitment_candidates(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','verified')),
 field_values jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(field_values)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 token_hash text UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 link_issued_by uuid REFERENCES users(id),
 link_expires_at timestamptz,
 verified_at timestamptz, verified_by uuid REFERENCES users(id)
);
CREATE TABLE recruitment_onboarding_photos (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES recruitment_onboarding_sessions(id),
 document_id text NOT NULL,
 document_type text NOT NULL,
 label text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '72 hours',
 reviewed_at timestamptz, reviewed_by uuid REFERENCES users(id),
 deleted_at timestamptz, deleted_by uuid REFERENCES users(id),
 deletion_reason text CHECK(deletion_reason IN ('manual','expired','missing')),
 ocr_status text NOT NULL DEFAULT 'pending' CHECK(ocr_status IN ('pending','recognized','failed')),
 ocr_attempts integer NOT NULL DEFAULT 0 CHECK(ocr_attempts BETWEEN 0 AND 5),
 CHECK(expires_at<=uploaded_at+interval '72 hours'),
 CHECK((reviewed_at IS NULL)=(reviewed_by IS NULL)),
 CHECK((deleted_at IS NULL)=(deletion_reason IS NULL))
);
CREATE INDEX recruitment_onboarding_templates_company ON recruitment_onboarding_templates(legal_entity_id,updated_at);
CREATE INDEX recruitment_onboarding_sessions_company ON recruitment_onboarding_sessions(legal_entity_id,created_by,updated_at);
CREATE INDEX recruitment_onboarding_photos_session ON recruitment_onboarding_photos(session_id,uploaded_at);
CREATE INDEX recruitment_onboarding_photos_expiry ON recruitment_onboarding_photos(expires_at) WHERE deleted_at IS NULL;

-- Preserve the provenance even after templates change or original photos expire.
CREATE FUNCTION guard_onboarding_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.template_id,NEW.responsibility_scope_id,NEW.legal_entity_id,NEW.template_snapshot,NEW.candidate_id,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.template_id,OLD.responsibility_scope_id,OLD.legal_entity_id,OLD.template_snapshot,OLD.candidate_id,OLD.created_by,OLD.created_at) THEN
   RAISE EXCEPTION 'Onboarding provenance is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER recruitment_onboarding_snapshot BEFORE UPDATE ON recruitment_onboarding_sessions
 FOR EACH ROW EXECUTE FUNCTION guard_onboarding_snapshot();
GRANT SELECT,INSERT ON recruitment_onboarding_templates,recruitment_onboarding_sessions,recruitment_onboarding_photos TO transport_app;
GRANT UPDATE(name,destination,employment_type,description,privacy_notice,fields,documents,active,version,updated_at) ON recruitment_onboarding_templates TO transport_app;
GRANT UPDATE(status,field_values,version,updated_at,token_hash,link_expires_at,link_issued_by,verified_at,verified_by) ON recruitment_onboarding_sessions TO transport_app;
GRANT UPDATE(reviewed_at,reviewed_by,deleted_at,deleted_by,deletion_reason,ocr_status,ocr_attempts) ON recruitment_onboarding_photos TO transport_app;
