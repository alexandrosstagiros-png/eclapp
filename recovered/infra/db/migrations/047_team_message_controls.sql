-- SPDX-License-Identifier: MIT
-- Mutable presentation keeps an immutable send snapshot and mutation history.
CREATE SEQUENCE team_message_change_sequence;
ALTER TABLE team_messages ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE team_messages ADD COLUMN edited_at timestamptz;
ALTER TABLE team_messages ADD COLUMN edited_by uuid REFERENCES users(id);
ALTER TABLE team_messages ADD COLUMN deleted_at timestamptz;
ALTER TABLE team_messages ADD COLUMN deleted_by uuid REFERENCES users(id);
ALTER TABLE team_messages ADD COLUMN change_seq bigint NOT NULL DEFAULT nextval('team_message_change_sequence');
ALTER TABLE team_messages ADD CONSTRAINT team_messages_edit_actor CHECK((edited_at IS NULL)=(edited_by IS NULL));
ALTER TABLE team_messages ADD CONSTRAINT team_messages_delete_actor CHECK((deleted_at IS NULL)=(deleted_by IS NULL));
ALTER TABLE team_messages ADD CONSTRAINT team_messages_tombstone CHECK(deleted_at IS NULL OR (text='' AND cardinality(mention_user_ids)=0 AND NOT mention_all));
CREATE INDEX team_messages_changes ON team_messages(conversation_id,change_seq);
CREATE INDEX team_messages_sender_time ON team_messages(conversation_id,author_id,created_at DESC);
GRANT USAGE,SELECT ON SEQUENCE team_message_change_sequence TO transport_app;
GRANT UPDATE(text,mention_user_ids,mention_all,version,edited_at,edited_by,deleted_at,deleted_by,change_seq) ON team_messages TO transport_app;

CREATE TABLE team_message_originals (
  message_id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
INSERT INTO team_message_originals(message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,payload)
SELECT m.id,m.legal_entity_id,m.region_id,m.project_id,m.responsibility_scope_id,m.conversation_id,
  jsonb_build_object('conversationId',m.conversation_id,'parentId',m.parent_id,'text',m.text,
    'mentions',jsonb_build_object('userIds',m.mention_user_ids,'all',m.mention_all),
    'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mimeType',a.mime_type,'byteSize',a.byte_size,'sha256',a.sha256)
      || CASE WHEN a.kind='file' THEN '{}'::jsonb ELSE jsonb_build_object('kind',a.kind) END ORDER BY a.position)
      FROM team_attachments a WHERE a.message_id=m.id),'[]'::jsonb))
FROM team_messages m;
CREATE TRIGGER team_message_originals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_message_originals
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER team_message_originals_assembly BEFORE INSERT ON team_message_originals
  FOR EACH ROW EXECUTE FUNCTION guard_team_attachment_assembly();
GRANT SELECT,INSERT ON team_message_originals TO transport_app;

CREATE TABLE team_control_operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid,
  action text NOT NULL CHECK(action IN ('edit','delete','moderation')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((action='moderation')=(message_id IS NULL)),
  FOREIGN KEY(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TRIGGER team_control_operations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_control_operations
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_control_operations TO transport_app;

CREATE TABLE team_message_reactions (
  message_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  emoji text NOT NULL CHECK(emoji IN ('👍','❤️','😂','🎉','👀','✅','🙏')),
  PRIMARY KEY(message_id,user_id,emoji),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
GRANT SELECT,INSERT,DELETE ON team_message_reactions TO transport_app;

ALTER TABLE team_message_mentions ADD COLUMN message_version integer NOT NULL DEFAULT 1 CHECK(message_version>0);
ALTER TABLE team_message_mentions DROP CONSTRAINT team_message_mentions_pkey;
ALTER TABLE team_message_mentions ADD PRIMARY KEY(message_id,user_id,message_version);

CREATE TABLE team_conversation_moderation (
  conversation_id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'interval' CHECK(mode='interval'),
  enabled_until timestamptz,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
GRANT SELECT,INSERT ON team_conversation_moderation TO transport_app;
GRANT UPDATE(enabled_until,updated_by,updated_at) ON team_conversation_moderation TO transport_app;

CREATE FUNCTION guard_team_message_tombstone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND (NEW.text,NEW.mention_user_ids,NEW.mention_all,NEW.deleted_at,NEW.deleted_by,NEW.version)
    IS DISTINCT FROM (OLD.text,OLD.mention_user_ids,OLD.mention_all,OLD.deleted_at,OLD.deleted_by,OLD.version) THEN
    RAISE EXCEPTION 'Deleted messages cannot be restored or revised' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_messages_tombstone_guard BEFORE UPDATE ON team_messages
  FOR EACH ROW EXECUTE FUNCTION guard_team_message_tombstone();
