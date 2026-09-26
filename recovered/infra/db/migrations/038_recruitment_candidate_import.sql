-- SPDX-License-Identifier: MIT
-- Administrative provenance is intentionally absent from transport_app grants.
-- Legacy comments, formulas and personal data are never copied to audit payloads.
CREATE TABLE recruitment_candidate_imports (
  id uuid PRIMARY KEY,
  document_id text NOT NULL CHECK(document_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
  source_record_sha256 text NOT NULL CHECK(source_record_sha256 ~ '^[a-f0-9]{64}$'),
  resolution_sha256 text NOT NULL CHECK(resolution_sha256 ~ '^[a-f0-9]{64}$'),
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES recruitment_contacts(id),
  application_id uuid,
  source_data jsonb NOT NULL CHECK(jsonb_typeof(source_data)='object'),
  resolution_data jsonb NOT NULL CHECK(jsonb_typeof(resolution_data)='object'),
  imported_by uuid NOT NULL REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(document_id,source_key),
  FOREIGN KEY(candidate_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(application_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_applications(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX recruitment_candidate_imports_candidate ON recruitment_candidate_imports(candidate_id);
