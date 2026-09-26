-- SPDX-License-Identifier: MIT
-- Preserve historical workbook rows independently from validated candidate cards.
CREATE TABLE recruitment_import_rows (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  document_id text NOT NULL CHECK(document_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
  source_sheet text NOT NULL CHECK(length(source_sheet) BETWEEN 1 AND 100),
  source_row integer NOT NULL CHECK(source_row>0),
  file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  candidate_id uuid,
  status text NOT NULL CHECK(status IN ('imported','review','archive')),
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  source_label text NOT NULL DEFAULT '',
  recruiter_label text NOT NULL DEFAULT '',
  location_label text NOT NULL DEFAULT '',
  issues jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(issues)='array'),
  fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='array'),
  raw_data jsonb NOT NULL CHECK(jsonb_typeof(raw_data)='object'),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((status='imported')=(candidate_id IS NOT NULL)),
  UNIQUE(document_id,responsibility_scope_id,source_key),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  FOREIGN KEY(candidate_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES recruitment_candidates(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX recruitment_import_rows_scope_page ON recruitment_import_rows(responsibility_scope_id,source_sheet,source_row,id);
CREATE INDEX recruitment_import_rows_scope_status ON recruitment_import_rows(responsibility_scope_id,status);
CREATE INDEX recruitment_import_rows_candidate ON recruitment_import_rows(candidate_id) WHERE candidate_id IS NOT NULL;
GRANT SELECT ON recruitment_import_rows TO transport_app;
