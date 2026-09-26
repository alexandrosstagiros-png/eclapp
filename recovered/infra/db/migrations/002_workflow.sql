CREATE TABLE workflow_requests (
  actor_id uuid NOT NULL REFERENCES users,
  idempotency_key uuid NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,idempotency_key)
);

CREATE TABLE workflow_attendance (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips,
  actor_id uuid NOT NULL REFERENCES users,
  kind text NOT NULL CHECK(kind IN ('check_in','check_out')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  channel text NOT NULL CHECK(channel IN ('web','dev','telegram','system')),
  UNIQUE(trip_id,actor_id,kind)
);
CREATE INDEX workflow_attendance_trip ON workflow_attendance(trip_id,received_at,id);

CREATE TABLE workflow_documents (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips,
  kind text NOT NULL CHECK(kind IN ('delivery_note','waybill')),
  revision integer NOT NULL CHECK(revision > 0),
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 160),
  mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
  content bytea NOT NULL,
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid NOT NULL REFERENCES users,
  uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(trip_id,kind,revision),
  CHECK(octet_length(content)=byte_size),
  CHECK(encode(digest(content,'sha256'),'hex')=sha256)
);
CREATE TABLE workflow_document_reviews (
  id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES workflow_documents,
  decision text NOT NULL CHECK(decision IN ('accepted','returned')),
  reason text CHECK(length(reason) BETWEEN 3 AND 500),
  reviewed_by uuid NOT NULL REFERENCES users,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(decision<>'returned' OR reason IS NOT NULL)
);
CREATE INDEX workflow_document_review_latest ON workflow_document_reviews(document_id,reviewed_at DESC,id DESC);

CREATE TABLE workflow_facts (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips,
  revision integer NOT NULL CHECK(revision > 0),
  minutes integer NOT NULL CHECK(minutes BETWEEN 0 AND 10080),
  stops integer NOT NULL CHECK(stops BETWEEN 0 AND 10000),
  kilometers_hundredths integer NOT NULL CHECK(kilometers_hundredths BETWEEN 0 AND 10000000),
  waiting_minutes integer NOT NULL CHECK(waiting_minutes BETWEEN 0 AND 10080 AND waiting_minutes <= minutes),
  submitted_by uuid NOT NULL REFERENCES users,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(trip_id,revision)
);
CREATE TABLE workflow_fact_reviews (
  id uuid PRIMARY KEY, facts_id uuid NOT NULL REFERENCES workflow_facts,
  decision text NOT NULL CHECK(decision IN ('approved','returned')),
  reason text CHECK(length(reason) BETWEEN 3 AND 500),
  reviewed_by uuid NOT NULL REFERENCES users,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(decision<>'returned' OR reason IS NOT NULL)
);
CREATE INDEX workflow_fact_review_latest ON workflow_fact_reviews(facts_id,reviewed_at DESC,id DESC);

CREATE VIEW workflow_current_documents AS
SELECT d.id,d.trip_id,d.kind,d.revision,d.filename,d.mime_type,d.byte_size,d.sha256,d.uploaded_by,d.uploaded_at,
  coalesce(r.decision,'pending') AS status,r.reason,r.reviewed_by,r.reviewed_at
FROM (SELECT DISTINCT ON(trip_id,kind) * FROM workflow_documents ORDER BY trip_id,kind,revision DESC) d
LEFT JOIN LATERAL (SELECT * FROM workflow_document_reviews WHERE document_id=d.id ORDER BY reviewed_at DESC,id DESC LIMIT 1) r ON true;

CREATE VIEW workflow_current_facts AS
SELECT f.*,coalesce(r.decision,'pending') AS status,r.reason,r.reviewed_by,r.reviewed_at
FROM (SELECT DISTINCT ON(trip_id) * FROM workflow_facts ORDER BY trip_id,revision DESC) f
LEFT JOIN LATERAL (SELECT * FROM workflow_fact_reviews WHERE facts_id=f.id ORDER BY reviewed_at DESC,id DESC LIMIT 1) r ON true;

CREATE TRIGGER workflow_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workflow_requests FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER workflow_attendance_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workflow_attendance FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER workflow_documents_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workflow_documents FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER workflow_document_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workflow_document_reviews FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER workflow_facts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workflow_facts FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER workflow_fact_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workflow_fact_reviews FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
