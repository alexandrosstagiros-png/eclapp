-- Capture committed operational changes, including edits performed by future
-- interfaces/imports. Draft planning rows intentionally do not create alerts.
CREATE TABLE notification_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK(kind IN ('trip','dispatcher_message')),
  aggregate_id uuid NOT NULL,
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  new_trip boolean NOT NULL DEFAULT false,
  new_assignment boolean NOT NULL DEFAULT false,
  removed_user_ids uuid[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  UNIQUE(kind,aggregate_id,transaction_id)
);
CREATE INDEX notification_sources_pending ON notification_sources(occurred_at,id) WHERE processed_at IS NULL;
GRANT SELECT,INSERT,UPDATE,DELETE ON notification_sources TO transport_app;

CREATE FUNCTION capture_trip_notification() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE trip_id uuid; created boolean := false; assigned boolean := false; removed uuid[] := '{}';
BEGIN
  IF NOT EXISTS(SELECT FROM notification_settings WHERE singleton AND enabled_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME='trips' THEN
    IF TG_OP='UPDATE' AND ROW(NEW.reference,NEW.business_date,NEW.vehicle_id,NEW.route_summary,
       NEW.project_id,NEW.region_id,NEW.legal_entity_id,NEW.responsibility_scope_id)
       IS NOT DISTINCT FROM ROW(OLD.reference,OLD.business_date,OLD.vehicle_id,OLD.route_summary,
       OLD.project_id,OLD.region_id,OLD.legal_entity_id,OLD.responsibility_scope_id) THEN RETURN NULL; END IF;
    trip_id := NEW.id; created := TG_OP='INSERT';
  ELSIF TG_TABLE_NAME='trip_assignments' THEN
    IF TG_OP='UPDATE' AND ROW(NEW.user_id,NEW.active,NEW.trip_id) IS NOT DISTINCT FROM ROW(OLD.user_id,OLD.active,OLD.trip_id) THEN RETURN NULL; END IF;
    trip_id := CASE WHEN TG_OP='DELETE' THEN OLD.trip_id ELSE NEW.trip_id END;
    IF TG_OP='INSERT' THEN assigned := NEW.active;
    ELSIF TG_OP='DELETE' THEN IF OLD.active THEN removed := ARRAY[OLD.user_id]; END IF;
    ELSE
      assigned := NEW.active AND (NOT OLD.active OR NEW.user_id<>OLD.user_id);
      IF OLD.active AND (NOT NEW.active OR NEW.user_id<>OLD.user_id) THEN removed := ARRAY[OLD.user_id]; END IF;
    END IF;
  ELSE
    IF TG_OP='UPDATE' AND ROW(NEW.label,NEW.planned_arrival_at,NEW.sequence,NEW.trip_id)
      IS NOT DISTINCT FROM ROW(OLD.label,OLD.planned_arrival_at,OLD.sequence,OLD.trip_id) THEN RETURN NULL; END IF;
    trip_id := CASE WHEN TG_OP='DELETE' THEN OLD.trip_id ELSE NEW.trip_id END;
  END IF;
  IF TG_TABLE_NAME<>'trips' AND TG_OP='UPDATE' THEN
    IF OLD.trip_id<>NEW.trip_id THEN
      IF TG_TABLE_NAME='trip_assignments' THEN
        assigned := NEW.active;
        removed := CASE WHEN OLD.active THEN ARRAY[OLD.user_id] ELSE '{}'::uuid[] END;
      END IF;
      INSERT INTO notification_sources(kind,aggregate_id,removed_user_ids) VALUES('trip',OLD.trip_id,removed)
        ON CONFLICT(kind,aggregate_id,transaction_id) DO UPDATE
          SET removed_user_ids=notification_sources.removed_user_ids||EXCLUDED.removed_user_ids;
      removed := '{}';
    END IF;
  END IF;
  INSERT INTO notification_sources(kind,aggregate_id,new_trip,new_assignment,removed_user_ids) VALUES('trip',trip_id,created,assigned,removed)
    ON CONFLICT(kind,aggregate_id,transaction_id) DO UPDATE
      SET new_trip=notification_sources.new_trip OR EXCLUDED.new_trip,
          new_assignment=notification_sources.new_assignment OR EXCLUDED.new_assignment,
          removed_user_ids=notification_sources.removed_user_ids||EXCLUDED.removed_user_ids;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trips_notify AFTER INSERT OR UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION capture_trip_notification();
CREATE TRIGGER assignments_notify AFTER INSERT OR UPDATE OR DELETE ON trip_assignments FOR EACH ROW EXECUTE FUNCTION capture_trip_notification();
CREATE TRIGGER stops_notify AFTER INSERT OR UPDATE OR DELETE ON trip_stops FOR EACH ROW EXECUTE FUNCTION capture_trip_notification();

CREATE FUNCTION capture_dispatcher_notification() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT FROM notification_settings WHERE singleton AND enabled_at IS NOT NULL)
    AND EXISTS(SELECT FROM users WHERE id=NEW.sender_id AND role='dispatcher' AND active AND approved) THEN
    INSERT INTO notification_sources(kind,aggregate_id) VALUES('dispatcher_message',NEW.id)
      ON CONFLICT(kind,aggregate_id,transaction_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER dispatcher_messages_notify AFTER INSERT ON communications_messages
FOR EACH ROW EXECUTE FUNCTION capture_dispatcher_notification();
