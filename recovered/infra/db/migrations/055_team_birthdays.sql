-- SPDX-License-Identifier: MIT
-- Completion belongs to the administrator and to one annual occurrence.
-- Birth dates stay in user_profiles; this ledger does not duplicate birth years.
CREATE TABLE team_birthday_congratulations (
  administrator_id uuid NOT NULL REFERENCES users(id),
  employee_id uuid NOT NULL REFERENCES users(id),
  occurrence_date date NOT NULL,
  congratulated boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(administrator_id,employee_id,occurrence_date)
);
GRANT SELECT,INSERT ON team_birthday_congratulations TO transport_app;
GRANT UPDATE(congratulated,updated_at) ON team_birthday_congratulations TO transport_app;
