-- Reversible removal keeps every published edition and signed original.
ALTER TABLE recruitment_contract_templates
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES users(id),
 ADD CONSTRAINT recruitment_contract_template_deleted_pair CHECK((deleted_at IS NULL)=(deleted_by IS NULL));
ALTER TABLE recruitment_contract_documents
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES users(id),
 ADD CONSTRAINT recruitment_contract_document_deleted_pair CHECK((deleted_at IS NULL)=(deleted_by IS NULL));
GRANT UPDATE(deleted_at,deleted_by) ON recruitment_contract_templates,recruitment_contract_documents TO transport_app;

CREATE OR REPLACE FUNCTION guard_contract_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.template_id,NEW.responsibility_scope_id,NEW.legal_entity_id,NEW.template_snapshot,NEW.candidate_id,NEW.onboarding_session_id,NEW.source_document_id,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.template_id,OLD.responsibility_scope_id,OLD.legal_entity_id,OLD.template_snapshot,OLD.candidate_id,OLD.onboarding_session_id,OLD.source_document_id,OLD.created_by,OLD.created_at) THEN
   RAISE EXCEPTION 'Contract provenance is immutable';
 END IF;
 IF ROW(NEW.deleted_at,NEW.deleted_by) IS DISTINCT FROM ROW(OLD.deleted_at,OLD.deleted_by) THEN
   IF (NEW.deleted_at IS NULL)=(OLD.deleted_at IS NULL) OR NEW.version<>OLD.version+1 OR
     (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','version','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','version','updated_at']) THEN
     RAISE EXCEPTION 'Contract trash transition may only change removal metadata';
   END IF;
   RETURN NEW;
 END IF;
 IF OLD.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Restore a removed contract before editing';
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

CREATE FUNCTION guard_contract_template_trash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.deleted_at,NEW.deleted_by) IS DISTINCT FROM ROW(OLD.deleted_at,OLD.deleted_by) THEN
   IF (NEW.deleted_at IS NULL)=(OLD.deleted_at IS NULL) OR NEW.version<>OLD.version+1 OR
     (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','version','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','version','updated_at']) THEN
     RAISE EXCEPTION 'Template trash transition may only change removal metadata';
   END IF;
 ELSIF OLD.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Restore a removed template before editing';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER recruitment_contract_template_trash_guard BEFORE UPDATE ON recruitment_contract_templates FOR EACH ROW EXECUTE FUNCTION guard_contract_template_trash();
CREATE INDEX recruitment_contract_templates_trash ON recruitment_contract_templates(legal_entity_id,deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX recruitment_contract_documents_trash ON recruitment_contract_documents(legal_entity_id,created_by,deleted_at) WHERE deleted_at IS NOT NULL;
