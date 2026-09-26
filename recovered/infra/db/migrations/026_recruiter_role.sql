ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK(role IN ('driver','dispatcher','manager','recruiter','document_specialist','mechanic','access_admin','auditor'));
