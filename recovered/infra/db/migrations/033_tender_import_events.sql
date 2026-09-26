-- Imported notes retain their unknown original author/date and must not count
-- as freshly written specialist comments in the work report.
ALTER TABLE tender_events DROP CONSTRAINT tender_events_type_check;
ALTER TABLE tender_events ADD CONSTRAINT tender_events_type_check
  CHECK(type IN ('created','updated','status','comment','import'));
ALTER TABLE tender_events DROP CONSTRAINT tender_events_check;
ALTER TABLE tender_events ADD CONSTRAINT tender_events_check
  CHECK((type='created' AND from_status IS NULL AND to_status IS NOT NULL)
    OR (type='status' AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status<>to_status)
    OR (type IN ('updated','comment','import') AND from_status IS NULL AND to_status IS NULL));
