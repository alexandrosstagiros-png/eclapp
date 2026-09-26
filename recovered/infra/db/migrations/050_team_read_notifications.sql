-- SPDX-License-Identifier: MIT
-- Receipts name the exact messages actually displayed, including their revision.
-- A cursor is informational only: it must never acknowledge hidden branches.
CREATE TABLE team_message_reads (
  user_id uuid NOT NULL REFERENCES users(id),
  message_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_version integer NOT NULL CHECK(message_version>0),
  read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,message_id),
  FOREIGN KEY(message_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX team_message_reads_conversation ON team_message_reads(user_id,conversation_id,message_id);
-- Preserve explicit mention acknowledgments recorded before general receipts existed.
INSERT INTO team_message_reads(user_id,message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,message_version,read_at)
SELECT user_id,message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id,max(message_version),min(read_at)
FROM team_message_mentions WHERE read_at IS NOT NULL
GROUP BY user_id,message_id,legal_entity_id,region_id,project_id,responsibility_scope_id,conversation_id;

CREATE FUNCTION guard_team_message_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND ((to_jsonb(OLD)-'message_version') IS DISTINCT FROM (to_jsonb(NEW)-'message_version') OR NEW.message_version<OLD.message_version) THEN
    RAISE EXCEPTION 'Message receipt cannot be reassigned or moved backwards' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT FROM team_messages WHERE id=NEW.message_id AND version>=NEW.message_version) THEN
    RAISE EXCEPTION 'Message receipt cannot acknowledge a future revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_message_reads_guard BEFORE INSERT OR UPDATE ON team_message_reads
  FOR EACH ROW EXECUTE FUNCTION guard_team_message_read();
CREATE TRIGGER team_message_reads_no_delete BEFORE DELETE OR TRUNCATE ON team_message_reads
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON team_message_reads TO transport_app;
GRANT UPDATE(message_version) ON team_message_reads TO transport_app;

CREATE TABLE team_conversation_user_state (
  user_id uuid NOT NULL REFERENCES users(id),
  conversation_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  last_read_cursor bigint NOT NULL DEFAULT 0 CHECK(last_read_cursor>=0),
  last_read_at timestamptz,
  mute_notifications boolean NOT NULL DEFAULT false,
  mute_sound boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id,conversation_id),
  FOREIGN KEY(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE FUNCTION guard_team_conversation_read_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.user_id,NEW.conversation_id,NEW.legal_entity_id,NEW.region_id,NEW.project_id,NEW.responsibility_scope_id)
    IS DISTINCT FROM (OLD.user_id,OLD.conversation_id,OLD.legal_entity_id,OLD.region_id,OLD.project_id,OLD.responsibility_scope_id)
    OR NEW.last_read_cursor<OLD.last_read_cursor OR (OLD.last_read_at IS NOT NULL AND (NEW.last_read_at IS NULL OR NEW.last_read_at<OLD.last_read_at)) THEN
    RAISE EXCEPTION 'Conversation read state cannot be reassigned or moved backwards' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_conversation_user_state_guard BEFORE UPDATE ON team_conversation_user_state
  FOR EACH ROW EXECUTE FUNCTION guard_team_conversation_read_state();
GRANT SELECT,INSERT ON team_conversation_user_state TO transport_app;
GRANT UPDATE(last_read_cursor,last_read_at,mute_notifications,mute_sound) ON team_conversation_user_state TO transport_app;

CREATE TABLE team_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  mute_notifications boolean NOT NULL DEFAULT false,
  mute_sound boolean NOT NULL DEFAULT false
);
GRANT SELECT,INSERT ON team_notification_preferences TO transport_app;
GRANT UPDATE(mute_notifications,mute_sound) ON team_notification_preferences TO transport_app;
