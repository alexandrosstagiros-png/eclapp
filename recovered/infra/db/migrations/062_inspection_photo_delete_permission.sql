-- Chief mechanics are appointed explicitly per existing responsibility scope.
-- Existing and future grants remain ordinary grants unless an administrator opts in.
ALTER TABLE access_grants
  ADD COLUMN inspection_photo_delete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN access_grants.inspection_photo_delete IS
  'Explicit chief-mechanic capability to delete control-inspection photos after one calendar month; effective only for mechanics in this scope';

GRANT UPDATE(inspection_photo_delete) ON access_grants TO transport_app;
