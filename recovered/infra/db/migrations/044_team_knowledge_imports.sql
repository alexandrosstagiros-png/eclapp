-- SPDX-License-Identifier: MIT
-- Original knowledge documents are deduplicated by content, never exposed by hash.
CREATE TABLE team_knowledge_files (
  sha256 text PRIMARY KEY CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 0 AND 8388608),
  content bytea NOT NULL,
  CHECK(octet_length(content)=byte_size),
  CHECK(encode(digest(content,'sha256'),'hex')=sha256)
);

CREATE TABLE team_article_imports (
  article_id uuid PRIMARY KEY REFERENCES team_articles(id),
  folder_path text NOT NULL CHECK(octet_length(folder_path)<=2048 AND folder_path !~ '[[:cntrl:]]'),
  source_path text NOT NULL CHECK(octet_length(source_path) BETWEEN 1 AND 2048 AND source_path !~ '[[:cntrl:]]'),
  source_archive text NOT NULL CHECK(octet_length(source_archive) BETWEEN 1 AND 255 AND source_archive=btrim(source_archive)
    AND source_archive NOT IN ('.','..') AND source_archive !~ '[[:cntrl:]]' AND position('/' in source_archive)=0 AND position(chr(92) in source_archive)=0),
  filename text NOT NULL CHECK(octet_length(filename) BETWEEN 1 AND 255 AND filename=btrim(filename)
    AND filename NOT IN ('.','..') AND filename !~ '[[:cntrl:]]' AND position('/' in filename)=0 AND position(chr(92) in filename)=0),
  mime_type text NOT NULL CHECK(length(mime_type)<=127 AND mime_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
  sha256 text NOT NULL REFERENCES team_knowledge_files(sha256),
  visibility text NOT NULL CHECK(visibility IN ('scope','admin')),
  imported_title text NOT NULL CHECK(length(btrim(imported_title)) BETWEEN 1 AND 200),
  imported_body_sha256 text NOT NULL CHECK(imported_body_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK(source_path=CASE WHEN folder_path='' THEN filename ELSE folder_path || '/' || filename END)
);
CREATE INDEX team_article_imports_file ON team_article_imports(sha256);

-- Metadata is attached to the newly created article, and never retargeted later.
CREATE FUNCTION guard_team_article_import_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xmin xid;
BEGIN
  SELECT xmin INTO parent_xmin FROM team_articles WHERE id=NEW.article_id AND version=1;
  IF parent_xmin IS NULL OR parent_xmin::text::bigint <> mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
    RAISE EXCEPTION 'Import metadata requires the same transaction as the new article' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_article_imports_assembly BEFORE INSERT ON team_article_imports
  FOR EACH ROW EXECUTE FUNCTION guard_team_article_import_assembly();
CREATE TRIGGER team_article_imports_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_article_imports
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER team_knowledge_files_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_knowledge_files
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_knowledge_files,team_article_imports TO transport_app;
