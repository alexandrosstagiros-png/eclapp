-- Acceptance is a separate immutable event. Existing starts stay valid evidence;
-- no acceptance events are backfilled or inferred from historical attendance.
ALTER TABLE workflow_attendance DROP CONSTRAINT workflow_attendance_kind_check;
ALTER TABLE workflow_attendance ADD CONSTRAINT workflow_attendance_kind_check
  CHECK(kind IN ('accept','check_in','check_out'));
