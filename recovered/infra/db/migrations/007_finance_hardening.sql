-- Lock the parent before checking status so INSERT cannot race a concurrent confirmation.
CREATE OR REPLACE FUNCTION prevent_confirmed_finance_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM finance_registries WHERE id=NEW.registry_id FOR UPDATE;
  IF parent_status='confirmed' THEN
    RAISE EXCEPTION 'Confirmed registry cannot receive additional rows';
  END IF;
  RETURN NEW;
END; $$;
