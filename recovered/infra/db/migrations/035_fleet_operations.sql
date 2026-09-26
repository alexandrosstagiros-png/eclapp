-- SPDX-License-Identifier: MIT
CREATE TABLE fleet_ops_records (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('vehicles','contractors','parts','warehouses','orders','maintenance','purchases','fuel','assignments','driverReports')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id),
  UNIQUE(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE fleet_ops_events (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  record_id uuid NOT NULL,
  record_version integer NOT NULL CHECK(record_version>0),
  action text NOT NULL,
  details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(record_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES fleet_ops_records(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE TABLE fleet_ops_actions (
  idempotency_key uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,legal_entity_id,region_id) REFERENCES projects(id,legal_entity_id,region_id),
  FOREIGN KEY(responsibility_scope_id,project_id) REFERENCES responsibility_scopes(id,project_id)
);
CREATE TABLE fleet_stock_movements (
  id uuid PRIMARY KEY,
  legal_entity_id uuid NOT NULL,
  region_id uuid NOT NULL,
  project_id uuid NOT NULL,
  responsibility_scope_id uuid NOT NULL,
  part_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity_milli bigint NOT NULL CHECK(quantity_milli<>0 AND abs(quantity_milli)<=100000000000),
  unit_cost_cents bigint NOT NULL CHECK(unit_cost_cents>=0 AND unit_cost_cents<=9007199254740991),
  amount_cents bigint NOT NULL CHECK(abs(amount_cents)<=9007199254740991),
  kind text NOT NULL CHECK(kind IN ('opening','receipt','issue')),
  document_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((kind='issue' AND quantity_milli<0 AND amount_cents<=0) OR (kind IN ('opening','receipt') AND quantity_milli>0 AND amount_cents>=0)),
  FOREIGN KEY(part_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES fleet_ops_records(id,legal_entity_id,region_id,project_id,responsibility_scope_id),
  FOREIGN KEY(warehouse_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
    REFERENCES fleet_ops_records(id,legal_entity_id,region_id,project_id,responsibility_scope_id)
);
CREATE INDEX fleet_ops_records_scope ON fleet_ops_records(legal_entity_id,region_id,project_id,responsibility_scope_id,kind,updated_at DESC);
CREATE INDEX fleet_ops_events_scope ON fleet_ops_events(legal_entity_id,region_id,project_id,responsibility_scope_id,created_at DESC);
CREATE INDEX fleet_stock_movements_balance ON fleet_stock_movements(legal_entity_id,region_id,project_id,responsibility_scope_id,part_id,warehouse_id);
GRANT SELECT,INSERT ON fleet_ops_records,fleet_ops_events,fleet_ops_actions,fleet_stock_movements TO transport_app;
GRANT UPDATE(payload,version,updated_by,updated_at) ON fleet_ops_records TO transport_app;
