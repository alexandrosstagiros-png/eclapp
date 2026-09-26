-- Incoming bodies are never retained wholesale. Text evidence and routing have separate storage.
CREATE TABLE telegram_inbound_updates (
  update_id bigint PRIMARY KEY CHECK(update_id >= 0 AND update_id <= 9007199254740991),
  received_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE communications_messages (
  id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES communications_tickets,
  sender_id uuid NOT NULL REFERENCES users, department text NOT NULL,
  update_id bigint NOT NULL UNIQUE REFERENCES telegram_inbound_updates,
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3500),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,ticket_id,sender_id,department),
  CHECK(encode(digest(content,'sha256'),'hex')=sha256),
  CHECK(department IN ('planning','transport','accounting','hr','documents','administration'))
);
CREATE INDEX communications_messages_ticket ON communications_messages(ticket_id,created_at,id);
CREATE TABLE telegram_deliveries (
  id uuid PRIMARY KEY, ticket_id uuid REFERENCES communications_tickets,
  message_id uuid REFERENCES communications_messages,
  sender_id uuid NOT NULL REFERENCES users, recipient_id uuid NOT NULL REFERENCES users,
  origin text NOT NULL DEFAULT 'telegram' CHECK(origin IN ('telegram','application')),
  chat_id text NOT NULL CHECK(chat_id ~ '^[1-9][0-9]{0,15}$'),
  department text CHECK(department IN ('planning','transport','accounting','hr','documents','administration')),
  content text NOT NULL CHECK(length(content) BETWEEN 1 AND 4096),
  force_reply boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  telegram_message_id bigint CHECK(telegram_message_id BETWEEN 1 AND 4503599627370495),
  error_code text CHECK(error_code IN ('NETWORK_OR_TIMEOUT','RATE_LIMITED','CHAT_UNAVAILABLE','API_REJECTED','INVALID_RECEIPT','ACCESS_REVOKED','ROUTING_CHANGED')),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), sent_at timestamptz(3),
  UNIQUE(chat_id,telegram_message_id),
  FOREIGN KEY(message_id,ticket_id,sender_id,department) REFERENCES communications_messages(id,ticket_id,sender_id,department),
  CHECK((ticket_id IS NULL) = (department IS NULL)),
  CHECK(NOT force_reply OR ticket_id IS NOT NULL),
  CHECK(message_id IS NULL OR ticket_id IS NOT NULL),
  CHECK(message_id IS NULL OR origin='telegram'),
  CHECK(status <> 'sent' OR (telegram_message_id IS NOT NULL AND telegram_message_id > 0 AND sent_at IS NOT NULL)),
  CHECK(status = 'sent' OR (telegram_message_id IS NULL AND sent_at IS NULL))
);
CREATE INDEX telegram_deliveries_pending ON telegram_deliveries(next_attempt_at,created_at,id) WHERE status='pending';
CREATE INDEX telegram_deliveries_ticket ON telegram_deliveries(ticket_id,created_at DESC,id DESC);
CREATE INDEX telegram_deliveries_recipient ON telegram_deliveries(recipient_id,ticket_id);
CREATE INDEX telegram_deliveries_message ON telegram_deliveries(message_id) WHERE message_id IS NOT NULL;
CREATE FUNCTION guard_telegram_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.ticket_id,NEW.message_id,NEW.sender_id,NEW.recipient_id,NEW.origin,NEW.chat_id,NEW.department,NEW.content,NEW.force_reply,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.ticket_id,OLD.message_id,OLD.sender_id,OLD.recipient_id,OLD.origin,OLD.chat_id,OLD.department,OLD.content,OLD.force_reply,OLD.created_at)
    OR OLD.status <> 'pending' OR NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'Telegram delivery evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER telegram_delivery_evidence BEFORE UPDATE ON telegram_deliveries FOR EACH ROW EXECUTE FUNCTION guard_telegram_delivery();
CREATE TRIGGER telegram_deliveries_no_delete BEFORE DELETE OR TRUNCATE ON telegram_deliveries FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER communications_messages_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON communications_messages FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER telegram_inbound_updates_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON telegram_inbound_updates FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
