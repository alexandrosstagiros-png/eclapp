-- SPDX-License-Identifier: MIT
-- A candidate belongs to the company. Its original project remains provenance;
-- applications, linked tasks and contacts retain the destination request project.
-- No rows are moved, merged or duplicated, including historic equal phone numbers.
ALTER TABLE recruitment_candidates ADD CONSTRAINT recruitment_candidates_company_key UNIQUE(id,legal_entity_id);
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint
    WHERE contype='f' AND confrelid='recruitment_candidates'::regclass
      AND conrelid IN ('recruitment_applications'::regclass,'recruitment_tasks'::regclass,'recruitment_contacts'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.relation,fk.conname);
  END LOOP;
END $$;
ALTER TABLE recruitment_applications ADD CONSTRAINT recruitment_applications_candidate_company_fk
  FOREIGN KEY(candidate_id,legal_entity_id) REFERENCES recruitment_candidates(id,legal_entity_id);
ALTER TABLE recruitment_tasks ADD CONSTRAINT recruitment_tasks_candidate_company_fk
  FOREIGN KEY(candidate_id,legal_entity_id) REFERENCES recruitment_candidates(id,legal_entity_id);
ALTER TABLE recruitment_contacts ADD CONSTRAINT recruitment_contacts_candidate_company_fk
  FOREIGN KEY(candidate_id,legal_entity_id) REFERENCES recruitment_candidates(id,legal_entity_id);
CREATE INDEX recruitment_candidates_company_phone ON recruitment_candidates(legal_entity_id,phone);
