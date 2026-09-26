-- SPDX-License-Identifier: MIT
-- Explicit mentions are message metadata; recipient rows snapshot the audience.
ALTER TABLE team_messages ADD COLUMN mention_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
  CHECK(cardinality(mention_user_ids)<=100 AND array_position(mention_user_ids,NULL) IS NULL);
ALTER TABLE team_messages ADD COLUMN mention_all boolean NOT NULL DEFAULT false;

ALTER TABLE team_attachments DROP CONSTRAINT team_attachments_byte_size_check;
ALTER TABLE team_attachments ADD CONSTRAINT team_attachments_byte_size_check CHECK(byte_size BETWEEN 0 AND 26214400);
ALTER TABLE team_attachments ADD COLUMN kind text NOT NULL DEFAULT 'file' CHECK(kind IN ('file','image','audio','video','round'));
ALTER TABLE team_attachments ADD CONSTRAINT team_attachments_media_type_check CHECK(kind='file'
  OR (kind='image' AND mime_type IN ('image/jpeg','image/png','image/webp'))
  OR (kind='audio' AND mime_type IN ('audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/mpeg'))
  OR (kind IN ('video','round') AND mime_type IN ('video/webm','video/mp4')));

CREATE OR REPLACE FUNCTION validate_team_message_attachments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE file_count bigint; total_bytes bigint;
BEGIN
  SELECT count(*),coalesce(sum(byte_size),0) INTO file_count,total_bytes FROM team_attachments WHERE message_id=NEW.id;
  IF (length(btrim(NEW.text))=0 AND file_count=0) OR file_count>5 OR total_bytes>26214400 THEN
    RAISE EXCEPTION 'A message requires text or files, with at most five files totaling 25 MiB' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TABLE team_message_mentions (
  message_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  read_at timestamptz,
  PRIMARY KEY(message_id,user_id),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_message_mentions_inbox ON team_message_mentions(user_id,responsibility_scope_id,message_id);
CREATE INDEX team_message_mentions_unread ON team_message_mentions(user_id,responsibility_scope_id,message_id) WHERE read_at IS NULL;

CREATE FUNCTION guard_team_mention_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xmin xid;
BEGIN
  SELECT xmin INTO parent_xmin FROM team_messages WHERE id=NEW.message_id;
  IF parent_xmin IS NULL OR parent_xmin::text::bigint <> mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
    RAISE EXCEPTION 'Mention recipients require the same transaction as the message' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_message_mentions_assembly BEFORE INSERT ON team_message_mentions
  FOR EACH ROW EXECUTE FUNCTION guard_team_mention_assembly();

CREATE FUNCTION guard_team_mention_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(OLD)-'read_at') IS DISTINCT FROM (to_jsonb(NEW)-'read_at') OR
    (OLD.read_at IS NOT NULL AND OLD.read_at IS DISTINCT FROM NEW.read_at) THEN
    RAISE EXCEPTION 'Mention recipients and recorded read times are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_message_mentions_read_guard BEFORE UPDATE ON team_message_mentions
  FOR EACH ROW EXECUTE FUNCTION guard_team_mention_read();
CREATE TRIGGER team_message_mentions_no_delete BEFORE DELETE OR TRUNCATE ON team_message_mentions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_message_mentions TO transport_app;
GRANT UPDATE(read_at) ON team_message_mentions TO transport_app;
