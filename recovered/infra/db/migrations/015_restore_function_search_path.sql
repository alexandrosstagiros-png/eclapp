-- pg_restore clears the session search_path while loading rows. CHECK constraints
-- bind their entry function by OID, but nested PL/pgSQL calls resolve at runtime.
-- Keep the complete tariff/payroll validation chain independent of that session.
-- Public CREATE was revoked in 001; runtime roles cannot replace these functions.
-- These remain SECURITY INVOKER: no role, privilege, rule or evidence is changed.
ALTER FUNCTION public.pricing_json_integer(jsonb, numeric, boolean) SET search_path = pg_catalog, public;
ALTER FUNCTION public.pricing_valid_rules(jsonb) SET search_path = pg_catalog, public;
ALTER FUNCTION public.pricing_valid_result(jsonb) SET search_path = pg_catalog, public;
ALTER FUNCTION public.pricing_valid_snapshot(jsonb) SET search_path = pg_catalog, public;
ALTER FUNCTION public.payroll_valid_lines(jsonb) SET search_path = pg_catalog, public;
ALTER FUNCTION public.payroll_deposit_valid_snapshot(jsonb) SET search_path = pg_catalog, public;
