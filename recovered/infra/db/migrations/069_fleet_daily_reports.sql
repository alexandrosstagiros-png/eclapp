-- Reuse the durable Team scheduler and ordinary chat messages for daily release reports.
ALTER TABLE team_summary_schedules ADD COLUMN report_kind text NOT NULL DEFAULT 'conversation_summary'
  CHECK(report_kind IN ('conversation_summary','fleet_release'));
ALTER TABLE team_summary_schedules ADD COLUMN source_scope_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE team_summary_schedules ADD COLUMN report_day_offset integer NOT NULL DEFAULT 0 CHECK(report_day_offset IN (0,1));
ALTER TABLE team_summary_schedules ADD COLUMN target_conversation_id uuid REFERENCES team_conversations(id);
ALTER TABLE team_summary_schedules ADD CONSTRAINT team_schedule_report_sources CHECK(
  (report_kind='conversation_summary' AND cardinality(source_scope_ids)=0 AND report_day_offset=0 AND target_conversation_id IS NULL) OR
  (report_kind='fleet_release' AND cardinality(source_scope_ids) BETWEEN 1 AND 100 AND array_position(source_scope_ids,NULL) IS NULL
    AND frequency='daily' AND cardinality(recipient_ids)=0));
CREATE UNIQUE INDEX team_fleet_schedule_company ON team_summary_schedules(legal_entity_id) WHERE report_kind='fleet_release';
ALTER TABLE team_summary_runs ADD COLUMN message_id uuid REFERENCES team_messages(id);
ALTER TABLE team_summary_runs ADD CONSTRAINT team_summary_run_one_result CHECK(summary_id IS NULL OR message_id IS NULL);
GRANT UPDATE(source_scope_ids,report_day_offset,target_conversation_id) ON team_summary_schedules TO transport_app;
GRANT UPDATE(message_id) ON team_summary_runs TO transport_app;

-- Scheduled publication runs inside a savepoint so a failed generation can
-- retain a durable retry. Inserts there have a subtransaction xmin. Its XID is
-- still held exclusively by this backend; committed or other-backend rows are
-- not accepted. Keep the existing assembly invariant across savepoints.
CREATE OR REPLACE FUNCTION guard_team_attachment_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_xmin xid;
BEGIN
  SELECT xmin INTO parent_xmin FROM team_messages WHERE id=NEW.message_id;
  IF parent_xmin IS NULL OR NOT EXISTS(SELECT FROM pg_locks WHERE locktype='transactionid'
    AND transactionid=parent_xmin AND pid=pg_backend_pid() AND mode='ExclusiveLock' AND granted) THEN
    RAISE EXCEPTION 'Message attachments require the same transaction as their message' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION guard_team_conversation_assembly() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT FROM team_conversations c JOIN pg_locks l ON l.transactionid=c.xmin
    WHERE c.id=NEW.conversation_id AND l.locktype='transactionid' AND l.pid=pg_backend_pid() AND l.mode='ExclusiveLock' AND l.granted) THEN
    RAISE EXCEPTION 'Conversation snapshot must be saved with its creation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
