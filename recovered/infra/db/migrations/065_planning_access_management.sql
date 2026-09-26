-- Planning access administration may change the personal-data flag in retained
-- areas and revoke an omitted area. Other grant columns remain independently
-- protected; these statements do not change any existing employee permissions.
GRANT UPDATE(personal_data_visible) ON access_grants TO transport_app;
GRANT DELETE ON access_grants TO transport_app;
