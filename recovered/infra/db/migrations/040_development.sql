-- SPDX-License-Identifier: MIT
-- Tickets use existing access tuples and roles. A pipeline is derived from status.
CREATE TABLE development_tickets (
  id uuid PRIMARY KEY,
  number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 6000),
  section text NOT NULL CHECK(section IN ('tenders','recruitment','fleet','planning','access','other')),
  status text NOT NULL CHECK(status IN ('new','clarifying','ready','in_progress','review','done')),
  author_id uuid NOT NULL REFERENCES users(id),
  author_name text NOT NULL CHECK(length(btrim(author_name))>0),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE development_events (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  type text NOT NULL CHECK(type IN ('created','updated','status','comment')),
  text text NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 4000),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL CHECK(length(btrim(actor_name))>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  from_status text CHECK(from_status IN ('new','clarifying','ready','in_progress','review','done')),
  to_status text CHECK(to_status IN ('new','clarifying','ready','in_progress','review','done')),
  CHECK((type='created' AND from_status IS NULL AND to_status IS NOT NULL AND to_status='new')
    OR (type='status' AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status<>to_status)
    OR (type IN ('updated','comment') AND from_status IS NULL AND to_status IS NULL)),
  FOREIGN KEY(ticket_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES development_tickets(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX development_tickets_scope ON development_tickets(legal_entity_id,region_id,project_id,responsibility_scope_id,updated_at DESC,id);
CREATE INDEX development_tickets_author ON development_tickets(legal_entity_id,region_id,project_id,responsibility_scope_id,author_id,updated_at DESC,id);
CREATE INDEX development_events_ticket ON development_events(ticket_id,created_at,id);
GRANT SELECT,INSERT ON development_tickets,development_events TO transport_app;
GRANT USAGE,SELECT ON SEQUENCE development_tickets_number_seq TO transport_app;
GRANT UPDATE(title,description,section,status,version,updated_by,updated_at) ON development_tickets TO transport_app;
-- Authors, scope tuples, ticket numbers and chronology are immutable.
