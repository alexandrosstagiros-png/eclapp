-- SPDX-License-Identifier: MIT
-- Corporate channels, direct conversations, immutable messages and versioned knowledge.
CREATE TABLE team_conversations (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('channel','direct')),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE team_members (
  conversation_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(conversation_id,user_id),
  FOREIGN KEY(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE team_messages (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  parent_id uuid,
  text text NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 12000),
  author_id uuid NOT NULL REFERENCES users(id),
  author_name text NOT NULL CHECK(length(btrim(author_name))>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(parent_id IS NULL OR parent_id<>id),
  UNIQUE(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_conversations(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(parent_id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES team_messages(id,conversation_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE team_articles (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 60000),
  author_id uuid NOT NULL REFERENCES users(id),
  author_name text NOT NULL CHECK(length(btrim(author_name))>0),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE INDEX team_conversations_scope ON team_conversations(legal_entity_id,region_id,project_id,responsibility_scope_id,updated_at DESC,id);
CREATE INDEX team_members_user ON team_members(user_id,conversation_id);
CREATE INDEX team_messages_chronology ON team_messages(conversation_id,created_at DESC,id DESC);
CREATE INDEX team_messages_scope_chronology ON team_messages(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at,id);
CREATE INDEX team_messages_parent ON team_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX team_articles_scope ON team_articles(legal_entity_id,region_id,project_id,responsibility_scope_id,updated_at DESC,id);
GRANT SELECT,INSERT ON team_conversations,team_members,team_messages,team_articles TO transport_app;
GRANT UPDATE(updated_at) ON team_conversations TO transport_app;
GRANT UPDATE(title,body,version,updated_by,updated_at) ON team_articles TO transport_app;
-- Memberships, messages, original authors and scope tuples are immutable to the app.
