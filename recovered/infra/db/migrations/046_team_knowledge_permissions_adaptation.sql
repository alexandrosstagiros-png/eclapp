-- SPDX-License-Identifier: MIT
-- Staff publications exclude drivers; write permissions are separate per scope.
ALTER TABLE team_article_imports DROP CONSTRAINT team_article_imports_visibility_check;
ALTER TABLE team_article_imports ADD CONSTRAINT team_article_imports_visibility_check CHECK(visibility IN ('scope','admin','staff'));

CREATE TABLE team_knowledge_permissions (
  user_id uuid NOT NULL REFERENCES users(id),
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,responsibility_scope_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE INDEX team_knowledge_permissions_scope ON team_knowledge_permissions(legal_entity_id,region_id,project_id,responsibility_scope_id,user_id);
GRANT SELECT,INSERT ON team_knowledge_permissions TO transport_app;
GRANT UPDATE(can_create,can_edit,updated_by,updated_at) ON team_knowledge_permissions TO transport_app;

ALTER TABLE users ADD COLUMN adaptation_required boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN adaptation_scope_id uuid REFERENCES responsibility_scopes(id);
ALTER TABLE users ADD COLUMN adaptation_completed_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_adaptation_assignment_check CHECK(NOT adaptation_required OR adaptation_scope_id IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_adaptation_completion_check CHECK(adaptation_completed_at IS NULL OR (adaptation_required AND adaptation_scope_id IS NOT NULL));

ALTER TABLE team_articles ADD CONSTRAINT team_articles_scoped_identity UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id);
CREATE TABLE team_adaptation_reads (
  user_id uuid NOT NULL REFERENCES users(id),
  article_id uuid NOT NULL,
  article_version integer NOT NULL CHECK(article_version>0),
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,article_id,article_version),
  FOREIGN KEY(article_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_articles(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_adaptation_reads_scope ON team_adaptation_reads(user_id,responsibility_scope_id,article_id);
CREATE TRIGGER team_adaptation_reads_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_adaptation_reads
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_adaptation_reads TO transport_app;
