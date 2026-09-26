CREATE TABLE notification_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled_at timestamptz
);
INSERT INTO notification_settings(singleton) VALUES(true);
CREATE TABLE notification_events (
  id uuid PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK(length(event_key) BETWEEN 1 AND 200),
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  type text NOT NULL CHECK(type IN ('trip_assigned','trip_changed','dispatcher_message','documents_overdue','escalation')),
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  entity_type text NOT NULL CHECK(length(entity_type) BETWEEN 1 AND 64),
  entity_id uuid NOT NULL, actor_id uuid REFERENCES users,
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES notification_events,
  recipient_id uuid NOT NULL REFERENCES users,
  parent_notification_id uuid REFERENCES notifications,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz, first_sent_at timestamptz, reminded_at timestamptz, escalated_at timestamptz,
  UNIQUE(event_id,recipient_id)
);
CREATE INDEX notifications_recipient ON notifications(recipient_id,created_at DESC);
CREATE INDEX notifications_pending ON notifications(created_at) WHERE acknowledged_at IS NULL;
CREATE TABLE max_notification_dialogs (
  provider_user_id text PRIMARY KEY CHECK(provider_user_id ~ '^[1-9][0-9]{0,15}$'),
  chat_id text, bot_started boolean NOT NULL DEFAULT false, muted boolean,
  lifecycle_at timestamptz, mute_at timestamptz,
  next_send_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY, notification_id uuid NOT NULL REFERENCES notifications,
  kind text NOT NULL CHECK(kind IN ('initial','reminder')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  provider_user_id text, provider_message_id text,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid, lease_until timestamptz,
  last_error text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), sent_at timestamptz,
  UNIQUE(notification_id,kind)
);
CREATE INDEX notification_deliveries_due ON notification_deliveries(next_attempt_at,created_at) WHERE status IN ('pending','sending');
CREATE TABLE notification_ack_tokens (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  delivery_id uuid NOT NULL REFERENCES notification_deliveries,
  provider_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days'
);
CREATE INDEX notification_ack_tokens_delivery ON notification_ack_tokens(delivery_id);
CREATE TABLE max_notification_updates (
  update_hash text PRIMARY KEY CHECK(update_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE max_callback_answers (
  callback_id text PRIMARY KEY CHECK(length(callback_id) BETWEEN 1 AND 256),
  notification_id uuid NOT NULL REFERENCES notifications,
  provider_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds',
  lease_token uuid, lease_until timestamptz, last_error text
);
CREATE INDEX max_callback_answers_due ON max_callback_answers(next_attempt_at) WHERE status IN ('pending','sending');
GRANT SELECT,INSERT,UPDATE ON notification_settings,notification_events,notifications,max_notification_dialogs,
  notification_deliveries,notification_ack_tokens,max_notification_updates,max_callback_answers TO transport_app;
GRANT DELETE ON notification_ack_tokens,max_notification_updates,max_callback_answers TO transport_app;
