-- SPDX-License-Identifier: MIT
-- Keep channel order independent of activity and retain deletion audit references.
CREATE SEQUENCE team_conversation_order_sequence MAXVALUE 9007199254740991;
ALTER TABLE team_conversations ADD COLUMN sort_order bigint;
WITH ranked AS (
  SELECT id,row_number() OVER(ORDER BY legal_entity_id,updated_at DESC,id) AS position
  FROM team_conversations
)
UPDATE team_conversations c SET sort_order=r.position FROM ranked r WHERE r.id=c.id;
SELECT setval('team_conversation_order_sequence',coalesce(max(sort_order),1),count(*)>0) FROM team_conversations;
ALTER TABLE team_conversations ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE team_conversations ALTER COLUMN sort_order SET DEFAULT nextval('team_conversation_order_sequence');
ALTER TABLE team_conversations ADD CHECK(sort_order>0 AND sort_order<=9007199254740991);
ALTER TABLE team_conversations ADD CONSTRAINT team_conversation_order_unique UNIQUE(sort_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE team_conversations ADD COLUMN archived_at timestamptz;
ALTER TABLE team_conversations ADD COLUMN archived_by uuid REFERENCES users(id);
ALTER TABLE team_conversations ADD COLUMN deleted_at timestamptz;
ALTER TABLE team_conversations ADD COLUMN deleted_by uuid REFERENCES users(id);
ALTER TABLE team_conversations ADD CHECK((archived_at IS NULL)=(archived_by IS NULL));
ALTER TABLE team_conversations ADD CHECK((deleted_at IS NULL)=(deleted_by IS NULL));
ALTER TABLE team_conversations ADD CHECK(kind='channel' OR (archived_at IS NULL AND deleted_at IS NULL));
CREATE INDEX team_channels_company_order ON team_conversations(legal_entity_id,sort_order,id)
  WHERE kind='channel' AND archived_at IS NULL AND deleted_at IS NULL;
GRANT USAGE,SELECT ON SEQUENCE team_conversation_order_sequence TO transport_app;
GRANT UPDATE(sort_order,archived_at,archived_by,deleted_at,deleted_by) ON team_conversations TO transport_app;

ALTER TABLE team_control_operations DROP CONSTRAINT team_control_operations_action_check;
ALTER TABLE team_control_operations DROP CONSTRAINT team_control_operations_check;
ALTER TABLE team_control_operations ADD CHECK(action IN ('edit','delete','moderation','access','channel_archive','channel_restore','channel_delete','channel_order'));
ALTER TABLE team_control_operations ADD CHECK((action IN ('moderation','access','channel_archive','channel_restore','channel_delete','channel_order'))=(message_id IS NULL));

CREATE FUNCTION guard_team_channel_tombstone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Deleted channels cannot be restored or revised' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_channels_tombstone_guard BEFORE UPDATE ON team_conversations
  FOR EACH ROW EXECUTE FUNCTION guard_team_channel_tombstone();
