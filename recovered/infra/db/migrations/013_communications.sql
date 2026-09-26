CREATE TABLE communications_memberships (
  user_id uuid NOT NULL REFERENCES users,
  department text NOT NULL CHECK(department IN ('planning','transport','accounting','hr','documents','administration')),
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  enabled boolean NOT NULL,
  updated_by uuid NOT NULL REFERENCES users, updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,department,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE INDEX communications_memberships_routing ON communications_memberships(department,legal_entity_id,region_id,project_id,responsibility_scope_id,user_id) WHERE enabled;
CREATE TABLE communications_tickets (
  id uuid PRIMARY KEY, reference text NOT NULL UNIQUE CHECK(length(reference) BETWEEN 1 AND 60),
  department text NOT NULL CHECK(department IN ('planning','transport','accounting','hr','documents','administration')),
  original_department text NOT NULL CHECK(original_department IN ('planning','transport','accounting','hr','documents','administration')),
  kind text NOT NULL CHECK(kind IN ('question','problem','suggestion')),
  subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 140),
  legal_entity_id uuid NOT NULL, region_id uuid NOT NULL, project_id uuid NOT NULL, responsibility_scope_id uuid NOT NULL,
  requester_id uuid NOT NULL REFERENCES users, assignee_id uuid REFERENCES users,
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','resolved','escalated')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  CHECK(assignee_id IS NULL OR assignee_id<>requester_id),
  CHECK((status IN ('new','escalated') AND assignee_id IS NULL) OR (status IN ('in_progress','resolved') AND assignee_id IS NOT NULL)),
  CHECK(status<>'escalated' OR department='administration')
);
CREATE INDEX communications_tickets_owner ON communications_tickets(requester_id,created_at DESC,id DESC);
CREATE INDEX communications_tickets_queue ON communications_tickets(department,legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC,id DESC);
CREATE TABLE communications_actions (
  id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES communications_tickets, actor_id uuid NOT NULL REFERENCES users,
  action text NOT NULL CHECK(action IN ('created','take','resolve','reopen','escalate')),
  version integer NOT NULL CHECK(version>0), department text NOT NULL,
  reason text CHECK(reason IS NULL OR length(reason) BETWEEN 3 AND 500),
  occurred_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), UNIQUE(ticket_id,version)
);
CREATE TABLE communications_requests (
  actor_id uuid NOT NULL REFERENCES users, idempotency_key uuid NOT NULL,
  operation text NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,idempotency_key)
);
CREATE TABLE communications_telegram_links (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'), ticket_id uuid NOT NULL REFERENCES communications_tickets,
  actor_id uuid NOT NULL REFERENCES users, expires_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX communications_telegram_links_actor ON communications_telegram_links(actor_id,created_at DESC);
CREATE FUNCTION guard_communications_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.reference,NEW.original_department,NEW.kind,NEW.subject,NEW.legal_entity_id,NEW.region_id,NEW.project_id,NEW.responsibility_scope_id,NEW.requester_id,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.reference,OLD.original_department,OLD.kind,OLD.subject,OLD.legal_entity_id,OLD.region_id,OLD.project_id,OLD.responsibility_scope_id,OLD.requester_id,OLD.created_at)
    OR NEW.version<>OLD.version+1 OR (NEW.department<>OLD.department AND NEW.department<>'administration') THEN
    RAISE EXCEPTION 'Communication ticket identity and version must be preserved';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER communications_tickets_guard BEFORE UPDATE ON communications_tickets FOR EACH ROW EXECUTE FUNCTION guard_communications_ticket();
CREATE TRIGGER communications_tickets_no_delete BEFORE DELETE OR TRUNCATE ON communications_tickets FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER communications_actions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON communications_actions FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER communications_requests_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON communications_requests FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
CREATE TRIGGER communications_telegram_links_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON communications_telegram_links FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();
