-- Real external accounts are separate from synthetic demonstration employees.
ALTER TABLE employee_directory DROP CONSTRAINT employee_directory_source_kind_check;
ALTER TABLE employee_directory DROP CONSTRAINT employee_directory_check;
ALTER TABLE employee_directory ADD CONSTRAINT employee_directory_source_kind_check
  CHECK (source_kind IN ('existing','demo_seed','demo_manual','external_manual'));
ALTER TABLE employee_directory ADD CONSTRAINT employee_directory_check
  CHECK ((source_kind IN ('demo_manual','external_manual') AND created_by IS NOT NULL AND created_at IS NOT NULL)
    OR (source_kind NOT IN ('demo_manual','external_manual') AND created_by IS NULL AND created_at IS NULL));
