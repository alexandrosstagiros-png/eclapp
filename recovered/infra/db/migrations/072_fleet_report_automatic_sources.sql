-- Empty source lists resolve the existing operational data on each run.
-- Preserve explicit lists from older clients and the conversation-summary rules.
ALTER TABLE team_summary_schedules DROP CONSTRAINT team_schedule_report_sources;
ALTER TABLE team_summary_schedules ADD CONSTRAINT team_schedule_report_sources CHECK(
  (report_kind='conversation_summary' AND cardinality(source_scope_ids)=0 AND report_day_offset=0) OR
  (report_kind='fleet_release' AND cardinality(source_scope_ids) BETWEEN 0 AND 100 AND array_position(source_scope_ids,NULL) IS NULL
    AND frequency='daily' AND cardinality(recipient_ids)=0));
