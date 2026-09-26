-- SPDX-License-Identifier: MIT
-- Removed instructions retain their original files, receipts and audit links.
ALTER TABLE team_articles ADD COLUMN deleted_at timestamptz;
ALTER TABLE team_articles ADD COLUMN deleted_by uuid REFERENCES users(id);
ALTER TABLE team_articles ADD CHECK((deleted_at IS NULL)=(deleted_by IS NULL));
CREATE INDEX team_articles_active_scope ON team_articles(responsibility_scope_id,updated_at DESC,id) WHERE deleted_at IS NULL;
GRANT UPDATE(deleted_at,deleted_by) ON team_articles TO transport_app;

CREATE TABLE team_article_deletion_operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  article_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  article_version integer NOT NULL CHECK(article_version>0),
  deleted_ids uuid[] NOT NULL CHECK(cardinality(deleted_ids)>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(article_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_articles(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TRIGGER team_article_deletion_operations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_article_deletion_operations
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_article_deletion_operations TO transport_app;

CREATE FUNCTION guard_team_article_tombstone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Deleted articles cannot be restored or revised' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_articles_tombstone_guard BEFORE UPDATE ON team_articles
  FOR EACH ROW EXECUTE FUNCTION guard_team_article_tombstone();
