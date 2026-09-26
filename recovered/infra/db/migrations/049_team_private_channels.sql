-- SPDX-License-Identifier: MIT
-- Direct conversations retain their existing fixed membership; channels may be closed.
ALTER TABLE team_conversations ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private'));
UPDATE team_conversations SET visibility='private' WHERE kind='direct';
ALTER TABLE team_conversations ADD CONSTRAINT team_direct_private CHECK(kind<>'direct' OR visibility='private');
ALTER TABLE team_conversations ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
GRANT UPDATE(visibility,version) ON team_conversations TO transport_app;
GRANT DELETE ON team_members TO transport_app;

CREATE TABLE team_conversation_originals (
  conversation_id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  FOREIGN KEY(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
INSERT INTO team_conversation_originals
SELECT c.id,c.legal_entity_id,c.region_id,c.project_id,c.responsibility_scope_id,
  jsonb_build_object('kind',c.kind,'title',c.title,'visibility',c.visibility,'memberIds',
    ARRAY(SELECT m.user_id FROM team_members m WHERE m.conversation_id=c.id ORDER BY m.user_id))
FROM team_conversations c;
CREATE TRIGGER team_conversation_originals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON team_conversation_originals
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_conversation_originals TO transport_app;

-- Access operations share the immutable operation ledger used by other controls.
ALTER TABLE team_control_operations DROP CONSTRAINT team_control_operations_action_check;
ALTER TABLE team_control_operations DROP CONSTRAINT team_control_operations_check;
ALTER TABLE team_control_operations ADD CHECK(action IN ('edit','delete','moderation','access'));
ALTER TABLE team_control_operations ADD CHECK((action IN ('moderation','access'))=(message_id IS NULL));

CREATE FUNCTION guard_team_conversation_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM team_conversations WHERE id=NEW.conversation_id AND xmin::text=pg_current_xact_id()::text) THEN
    RAISE EXCEPTION 'Conversation snapshot must be saved with its creation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_conversation_originals_assembly BEFORE INSERT ON team_conversation_originals
  FOR EACH ROW EXECUTE FUNCTION guard_team_conversation_assembly();

CREATE FUNCTION guard_team_direct_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation uuid;
BEGIN
  conversation := CASE WHEN TG_OP='DELETE' THEN OLD.conversation_id ELSE NEW.conversation_id END;
  IF EXISTS(SELECT FROM team_conversations c WHERE c.id=conversation AND c.kind='direct') AND
    EXISTS(SELECT FROM team_conversation_originals o WHERE o.conversation_id=conversation) THEN
    RAISE EXCEPTION 'Direct conversation membership is immutable' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER team_direct_membership_immutable BEFORE INSERT OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION guard_team_direct_membership();
