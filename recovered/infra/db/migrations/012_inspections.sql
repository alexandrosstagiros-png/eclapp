ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('driver','dispatcher','document_specialist','mechanic','access_admin','auditor'));

CREATE TABLE inspection_templates (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  created_by uuid NOT NULL REFERENCES users, created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(legal_entity_id,region_id,project_id,responsibility_scope_id,version),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE TABLE inspection_template_items (
  template_id uuid NOT NULL REFERENCES inspection_templates, id text NOT NULL CHECK(id ~ '^[a-z][a-z0-9_]{0,63}$'),
  position integer NOT NULL CHECK(position BETWEEN 0 AND 39),
  section text NOT NULL CHECK(section IN ('vehicle','fluids','documents','equipment','other')),
  kind text NOT NULL CHECK(kind IN ('photo','document','check','text')),
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160), instruction text NOT NULL CHECK(length(instruction) <= 1000),
  required boolean NOT NULL, critical boolean NOT NULL,
  PRIMARY KEY(template_id,id), UNIQUE(template_id,position)
);
CREATE TABLE inspection_photos (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips, driver_id uuid NOT NULL REFERENCES users,
  template_id uuid NOT NULL, item_id text NOT NULL,
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png')), content bytea NOT NULL,
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), uploaded_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(template_id,item_id) REFERENCES inspection_template_items(template_id,id),
  UNIQUE(id,trip_id,driver_id,template_id,item_id),
  CHECK(octet_length(content)=byte_size), CHECK(encode(digest(content,'sha256'),'hex')=sha256)
);
CREATE INDEX inspection_photos_owner ON inspection_photos(trip_id,driver_id,template_id,item_id);
CREATE TABLE inspection_submissions (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips, driver_id uuid NOT NULL REFERENCES users,
  template_id uuid NOT NULL, vehicle_id uuid NOT NULL REFERENCES vehicles, business_date date NOT NULL,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100), comment text NOT NULL CHECK(length(comment) <= 2000),
  occurred_at timestamptz(3) NOT NULL, submitted_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  has_critical_defects boolean NOT NULL,
  FOREIGN KEY(template_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES inspection_templates(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  UNIQUE(trip_id,driver_id,revision), UNIQUE(id,trip_id,driver_id,template_id), UNIQUE(id,template_id),
  CHECK(occurred_at <= submitted_at + interval '5 minutes' AND occurred_at >= submitted_at - interval '7 days')
);
CREATE INDEX inspection_submissions_scope ON inspection_submissions(legal_entity_id,region_id,project_id,responsibility_scope_id,submitted_at DESC,id DESC);
CREATE INDEX inspection_submissions_latest ON inspection_submissions(trip_id,driver_id,revision DESC);
CREATE TABLE inspection_answers (
  submission_id uuid NOT NULL, template_id uuid NOT NULL, item_id text NOT NULL,
  result text NOT NULL CHECK(result IN ('ok','defect','missing','not_applicable')),
  comment text NOT NULL CHECK(length(comment) <= 1000),
  PRIMARY KEY(submission_id,item_id), UNIQUE(submission_id,template_id,item_id),
  FOREIGN KEY(submission_id,template_id) REFERENCES inspection_submissions(id,template_id),
  FOREIGN KEY(template_id,item_id) REFERENCES inspection_template_items(template_id,id),
  CHECK(result NOT IN ('defect','missing') OR length(comment) >= 3)
);
CREATE TABLE inspection_answer_photos (
  submission_id uuid NOT NULL, item_id text NOT NULL, photo_id uuid NOT NULL,
  trip_id uuid NOT NULL, driver_id uuid NOT NULL, template_id uuid NOT NULL,
  PRIMARY KEY(submission_id,item_id,photo_id), UNIQUE(submission_id,photo_id),
  FOREIGN KEY(submission_id,template_id,item_id) REFERENCES inspection_answers(submission_id,template_id,item_id),
  FOREIGN KEY(submission_id,trip_id,driver_id,template_id) REFERENCES inspection_submissions(id,trip_id,driver_id,template_id),
  FOREIGN KEY(photo_id,trip_id,driver_id,template_id,item_id) REFERENCES inspection_photos(id,trip_id,driver_id,template_id,item_id)
);
CREATE INDEX inspection_answer_photos_photo ON inspection_answer_photos(photo_id);
CREATE TABLE inspection_reviews (
  id uuid PRIMARY KEY, submission_id uuid NOT NULL UNIQUE REFERENCES inspection_submissions,
  decision text NOT NULL CHECK(decision IN ('accepted','returned')),
  reason text CHECK(length(reason) BETWEEN 3 AND 1000), reviewed_by uuid NOT NULL REFERENCES users,
  reviewed_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), CHECK(decision <> 'returned' OR reason IS NOT NULL)
);
CREATE TABLE inspection_requests (
  actor_id uuid NOT NULL REFERENCES users, idempotency_key uuid NOT NULL, operation text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor_id,idempotency_key)
);

-- Append-only children must also be sealed against new evidence after publication.
-- xmin is assigned when the immutable parent is inserted; assembly (including an
-- isolated restore) must insert each parent and all its children in one transaction.
CREATE FUNCTION guard_inspection_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xmin xid;
BEGIN
  IF TG_TABLE_NAME = 'inspection_template_items' THEN
    SELECT xmin INTO parent_xmin FROM inspection_templates WHERE id=NEW.template_id;
  ELSE
    SELECT xmin INTO parent_xmin FROM inspection_submissions WHERE id=NEW.submission_id;
  END IF;
  IF parent_xmin IS NULL OR parent_xmin::text::bigint <> mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
    RAISE EXCEPTION 'Inspection evidence is sealed; child rows require the same transaction';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inspection_template_items_assembly BEFORE INSERT ON inspection_template_items FOR EACH ROW EXECUTE FUNCTION guard_inspection_assembly();
CREATE TRIGGER inspection_answers_assembly BEFORE INSERT ON inspection_answers FOR EACH ROW EXECUTE FUNCTION guard_inspection_assembly();
CREATE TRIGGER inspection_answer_photos_assembly BEFORE INSERT ON inspection_answer_photos FOR EACH ROW EXECUTE FUNCTION guard_inspection_assembly();

CREATE TRIGGER inspection_templates_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_templates FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_template_items_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_template_items FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_photos_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_photos FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_submissions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_submissions FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_answers_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_answers FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_answer_photos_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_answer_photos FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_reviews FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER inspection_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON inspection_requests FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
