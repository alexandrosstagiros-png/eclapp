-- SPDX-License-Identifier: MIT
-- Attachments are private immutable message children, assembled in one transaction.
ALTER TABLE team_messages DROP CONSTRAINT team_messages_text_check;
ALTER TABLE team_messages ADD CONSTRAINT team_messages_text_check CHECK(length(btrim(text)) BETWEEN 0 AND 12000);

CREATE TABLE team_attachments (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  filename text NOT NULL CHECK(octet_length(filename) BETWEEN 1 AND 255 AND filename=btrim(filename)
    AND filename NOT IN ('.','..') AND filename !~ '[[:cntrl:]]' AND position('/' in filename)=0 AND position(chr(92) in filename)=0),
  mime_type text NOT NULL CHECK(length(mime_type)<=127 AND mime_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 0 AND 8388608),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL,
  position smallint NOT NULL CHECK(position BETWEEN 0 AND 4),
  UNIQUE(message_id,position),
  CHECK(octet_length(content)=byte_size),
  CHECK(encode(digest(content,'sha256'),'hex')=sha256),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);

-- A committed message cannot acquire files later. This also makes replay metadata
-- immutable and prevents concurrent additions from escaping the aggregate limit.
CREATE FUNCTION guard_team_attachment_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xmin xid;
BEGIN
  SELECT xmin INTO parent_xmin FROM team_messages WHERE id=NEW.message_id;
  IF parent_xmin IS NULL OR parent_xmin::text::bigint <> mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
    RAISE EXCEPTION 'Message attachments require the same transaction as their message' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_attachments_assembly BEFORE INSERT ON team_attachments
  FOR EACH ROW EXECUTE FUNCTION guard_team_attachment_assembly();
CREATE TRIGGER team_attachments_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_attachments
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

-- File-only messages become valid only when their files have been inserted.
-- The deferred constraint sees the complete transaction before committing it.
CREATE FUNCTION validate_team_message_attachments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE file_count bigint; total_bytes bigint;
BEGIN
  SELECT count(*),coalesce(sum(byte_size),0) INTO file_count,total_bytes FROM team_attachments WHERE message_id=NEW.id;
  IF (length(btrim(NEW.text))=0 AND file_count=0) OR file_count>5 OR total_bytes>8388608 THEN
    RAISE EXCEPTION 'A message requires text or files, with at most five files totaling 8 MiB' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER team_messages_attachment_content AFTER INSERT ON team_messages
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_team_message_attachments();

GRANT SELECT,INSERT ON team_attachments TO transport_app;
