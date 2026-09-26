-- Bearer invitations authorize one external account to the explicitly selected requests.
-- Only the hash is durable; the one-time raw secret is returned at creation.
CREATE TABLE recruitment_invitations (
 id uuid PRIMARY KEY,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 legal_entity_id uuid NOT NULL,
 region_id uuid NOT NULL,
 project_id uuid NOT NULL,
 responsibility_scope_id uuid NOT NULL,
 request_ids uuid[] NOT NULL CHECK(cardinality(request_ids) BETWEEN 1 AND 10000),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 access_expires_at timestamptz,
 revoked_at timestamptz,
 consumed_at timestamptz,
 accepted_user_id uuid REFERENCES users(id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
 CHECK(access_expires_at IS NULL OR access_expires_at>=expires_at),
 CHECK((consumed_at IS NULL)=(accepted_user_id IS NULL)),
 FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
 FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE INDEX recruitment_invitations_scope ON recruitment_invitations(responsibility_scope_id,created_at);
GRANT SELECT,INSERT ON recruitment_invitations TO transport_app;
GRANT UPDATE(revoked_at,consumed_at,accepted_user_id) ON recruitment_invitations TO transport_app;

ALTER TABLE employee_directory DROP CONSTRAINT employee_directory_source_kind_check;
ALTER TABLE employee_directory DROP CONSTRAINT employee_directory_check;
ALTER TABLE employee_directory ADD CONSTRAINT employee_directory_source_kind_check
 CHECK(source_kind IN ('existing','demo_seed','demo_manual','external_manual','external_invitation'));
ALTER TABLE employee_directory ADD CONSTRAINT employee_directory_check
 CHECK((source_kind IN ('demo_manual','external_manual','external_invitation') AND created_by IS NOT NULL AND created_at IS NOT NULL)
 OR (source_kind NOT IN ('demo_manual','external_manual','external_invitation') AND created_by IS NULL AND created_at IS NULL));
