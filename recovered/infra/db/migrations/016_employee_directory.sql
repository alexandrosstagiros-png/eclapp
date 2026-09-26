-- Provenance is separate from authentication and grants. No 1C import is implied.
CREATE TABLE employee_directory (
  user_id uuid PRIMARY KEY REFERENCES users,
  employee_number bigserial NOT NULL UNIQUE,
  source_kind text NOT NULL CHECK (source_kind IN ('existing','demo_seed','demo_manual')),
  created_by uuid REFERENCES users,
  created_at timestamptz,
  CHECK ((source_kind = 'demo_manual' AND created_by IS NOT NULL AND created_at IS NOT NULL)
    OR (source_kind <> 'demo_manual' AND created_by IS NULL AND created_at IS NULL))
);
INSERT INTO employee_directory (user_id, source_kind)
SELECT u.id, CASE WHEN EXISTS (
  SELECT FROM (VALUES
    ('10000000-0000-4000-8000-000000000001'::uuid,'Водитель 01','driver'),
    ('10000000-0000-4000-8000-000000000002'::uuid,'Водитель 02','driver'),
    ('10000000-0000-4000-8000-000000000003'::uuid,'Документовед','document_specialist'),
    ('10000000-0000-4000-8000-000000000004'::uuid,'Диспетчер','dispatcher'),
    ('10000000-0000-4000-8000-000000000005'::uuid,'Администратор доступа','access_admin'),
    ('10000000-0000-4000-8000-000000000006'::uuid,'Механик','mechanic')
  ) AS seed(id, name, role)
  WHERE seed.id=u.id AND seed.name=u.display_name AND seed.role=u.role
) THEN 'demo_seed' ELSE 'existing' END
FROM users u ORDER BY u.id;

CREATE TABLE employee_creation_requests (
  actor_id uuid NOT NULL REFERENCES users,
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL UNIQUE REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,idempotency_key)
);
CREATE INDEX employee_directory_source ON employee_directory(source_kind,user_id);
CREATE INDEX users_directory_role_status ON users(role,active,id);
