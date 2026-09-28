-- Summaries can use a configured model while keeping their exact source excerpts.
ALTER TABLE team_summaries DROP CONSTRAINT team_summaries_mode_check;
ALTER TABLE team_summaries ADD CONSTRAINT team_summaries_mode_check CHECK(mode IN ('extractive','ai'));
ALTER TABLE team_summaries ADD COLUMN ai_metadata jsonb CHECK(ai_metadata IS NULL OR jsonb_typeof(ai_metadata) IN ('object','null'));
ALTER TABLE team_summary_schedules DROP CONSTRAINT team_schedule_report_sources;
ALTER TABLE team_summary_schedules ADD CONSTRAINT team_schedule_report_sources CHECK(
  (report_kind='conversation_summary' AND cardinality(source_scope_ids)=0 AND report_day_offset=0) OR
  (report_kind='fleet_release' AND cardinality(source_scope_ids) BETWEEN 1 AND 100 AND array_position(source_scope_ids,NULL) IS NULL
    AND frequency='daily' AND cardinality(recipient_ids)=0));
ALTER TABLE team_summary_runs DROP CONSTRAINT team_summary_run_one_result;
CREATE TABLE team_summary_publications (
  summary_id uuid NOT NULL REFERENCES team_summaries(id),
  conversation_id uuid NOT NULL REFERENCES team_conversations(id),
  message_id uuid NOT NULL UNIQUE REFERENCES team_messages(id),
  published_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(summary_id,conversation_id)
);
GRANT SELECT,INSERT ON team_summary_publications TO transport_app;
