-- Preserve the original ticket/action history while fixing driver routing durably.
CREATE TABLE communications_driver_requests (
  ticket_id uuid PRIMARY KEY REFERENCES communications_tickets(id),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO communications_driver_requests(ticket_id)
  SELECT t.id FROM communications_tickets t JOIN users u ON u.id=t.requester_id WHERE u.role='driver';
CREATE TRIGGER communications_driver_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON communications_driver_requests
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
GRANT SELECT,INSERT ON communications_driver_requests TO transport_app;

ALTER TABLE communications_messages ALTER COLUMN update_id DROP NOT NULL;
ALTER TABLE communications_messages ADD COLUMN origin text NOT NULL DEFAULT 'telegram' CHECK(origin IN ('telegram','application'));
ALTER TABLE communications_messages ADD CONSTRAINT communications_messages_transport_check
  CHECK((origin='telegram' AND update_id IS NOT NULL) OR (origin='application' AND update_id IS NULL));

-- Old pending deliveries must not disclose driver conversations after migration.
UPDATE telegram_deliveries SET status='failed',error_code='ACCESS_REVOKED'
  WHERE status='pending' AND (
    ticket_id IN (SELECT ticket_id FROM communications_driver_requests)
    OR sender_id IN (SELECT id FROM users WHERE role='driver')
    OR recipient_id IN (SELECT id FROM users WHERE role='driver')
  );
