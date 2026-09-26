CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE legal_entities (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE regions (id uuid PRIMARY KEY, name text NOT NULL, time_zone text NOT NULL);
CREATE TABLE projects (
  id uuid PRIMARY KEY, name text NOT NULL,
  legal_entity_id uuid NOT NULL REFERENCES legal_entities,
  region_id uuid NOT NULL REFERENCES regions,
  UNIQUE(id, legal_entity_id, region_id)
);
CREATE TABLE responsibility_scopes (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects,
  name text NOT NULL, UNIQUE(id, project_id)
);
CREATE TABLE users (
  id uuid PRIMARY KEY, display_name text NOT NULL,
  role text NOT NULL CHECK(role IN ('driver','dispatcher','document_specialist','access_admin','auditor')),
  active boolean NOT NULL DEFAULT true, approved boolean NOT NULL DEFAULT false,
  auth_version integer NOT NULL DEFAULT 1 CHECK(auth_version > 0)
);
CREATE TABLE access_grants (
  user_id uuid NOT NULL REFERENCES users,
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  finance_visible boolean NOT NULL DEFAULT false, personal_data_visible boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id, legal_entity_id, region_id, project_id, responsibility_scope_id),
  FOREIGN KEY(project_id, legal_entity_id, region_id) REFERENCES projects(id, legal_entity_id, region_id),
  FOREIGN KEY(responsibility_scope_id, project_id) REFERENCES responsibility_scopes(id, project_id)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  auth_version integer NOT NULL CHECK(auth_version > 0),
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  channel text NOT NULL CHECK(channel IN ('dev','telegram','web'))
);
CREATE INDEX sessions_active_user ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE channel_identities (
  provider text NOT NULL CHECK(provider = 'telegram'), provider_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users,
  PRIMARY KEY(provider, provider_user_id), UNIQUE(provider, user_id)
);
CREATE TABLE invitations (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users,
  telegram_user_id text NOT NULL CHECK(telegram_user_id ~ '^[1-9][0-9]{0,15}$'),
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL, consumed_at timestamptz, created_by uuid NOT NULL REFERENCES users
);
CREATE INDEX invitations_user ON invitations(user_id) WHERE consumed_at IS NULL;
CREATE TABLE auth_replays (replay_hash text PRIMARY KEY CHECK(replay_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL);
CREATE INDEX auth_replays_expiry ON auth_replays(expires_at);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY, label text NOT NULL,
  body_type text NOT NULL CHECK(body_type IN ('refrigerated','box')),
  capacity_kg integer NOT NULL CHECK(capacity_kg > 0 AND capacity_kg <= 100000),
  fleet_type text NOT NULL CHECK(fleet_type IN ('own','subcontracted'))
);
CREATE TABLE trips (
  id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, business_date date NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK(status = 'assigned'),
  project_id uuid NOT NULL, region_id uuid NOT NULL, legal_entity_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL, vehicle_id uuid NOT NULL REFERENCES vehicles,
  route_summary text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  FOREIGN KEY(project_id, legal_entity_id, region_id) REFERENCES projects(id, legal_entity_id, region_id),
  FOREIGN KEY(responsibility_scope_id, project_id) REFERENCES responsibility_scopes(id, project_id)
);
CREATE INDEX trips_scope_date ON trips(legal_entity_id, region_id, project_id, responsibility_scope_id, business_date, id);
CREATE INDEX trips_date ON trips(business_date, id);
CREATE TABLE trip_assignments (
  trip_id uuid NOT NULL REFERENCES trips, user_id uuid NOT NULL REFERENCES users,
  active boolean NOT NULL DEFAULT true, PRIMARY KEY(trip_id, user_id)
);
CREATE INDEX assignments_active_user ON trip_assignments(user_id, trip_id) WHERE active;
CREATE TABLE trip_stops (
  trip_id uuid NOT NULL REFERENCES trips, sequence integer NOT NULL CHECK(sequence > 0),
  label text NOT NULL, planned_arrival_at timestamptz,
  PRIMARY KEY(trip_id, sequence)
);

CREATE TABLE audit_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  sequence bigint NOT NULL, event_hash text NOT NULL
);
INSERT INTO audit_head VALUES(true, 0, repeat('0',64));
CREATE TABLE audit_events (
  sequence bigint PRIMARY KEY, id uuid NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL, payload jsonb NOT NULL,
  previous_hash text NOT NULL CHECK(length(previous_hash)=64),
  event_hash text NOT NULL CHECK(length(event_hash)=64)
);
CREATE INDEX audit_entity ON audit_events((payload->>'entityType'), (payload->>'entityId'), sequence);
CREATE INDEX audit_actor_time ON audit_events((payload->>'actorId'), occurred_at);
CREATE INDEX audit_scope ON audit_events USING gin ((payload->'scope'));
CREATE TABLE outbox (
  id uuid PRIMARY KEY, event_type text NOT NULL, schema_version integer NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz
);
CREATE INDEX outbox_pending ON outbox(next_attempt_at, created_at) WHERE status='pending';

CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

-- PostgreSQL jsonb text is the canonical byte representation for this schema version.
-- Serialize sequence allocation and insertion under a single transactional row lock.
CREATE FUNCTION append_audit(event jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  next_sequence bigint; previous text; new_hash text; event_id uuid;
  event_time timestamptz; canonical jsonb;
BEGIN
  IF jsonb_typeof(event) <> 'object' OR coalesce(event->>'action','') = ''
     OR coalesce(event->>'correlationId','') = '' THEN
    RAISE EXCEPTION 'Invalid audit event';
  END IF;
  SELECT sequence + 1, event_hash INTO next_sequence, previous FROM public.audit_head WHERE singleton FOR UPDATE;
  event_id := public.gen_random_uuid(); event_time := clock_timestamp();
  canonical := event || jsonb_build_object('eventId',event_id,'serverOccurredAt',event_time,'sequence',next_sequence);
  new_hash := encode(public.digest(convert_to(previous || ':' || next_sequence::text || ':' || canonical::text,'UTF8'),'sha256'),'hex');
  INSERT INTO public.audit_events VALUES(next_sequence,event_id,event_time,canonical,previous,new_hash);
  UPDATE public.audit_head SET sequence=next_sequence,event_hash=new_hash WHERE singleton;
  INSERT INTO public.outbox(id,event_type,schema_version,payload,created_at)
    VALUES(event_id,event->>'action',1,canonical,event_time);
END;
$$;
REVOKE ALL ON FUNCTION append_audit(jsonb) FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
