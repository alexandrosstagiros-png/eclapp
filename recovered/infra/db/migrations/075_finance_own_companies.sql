-- Own companies are existing application legal entities, not a parallel catalog.
-- Legacy entities retain their identity and may complete these details later.
ALTER TABLE legal_entities
  ADD COLUMN organization_kind text,
  ADD COLUMN inn text,
  ADD COLUMN kpp text,
  ADD COLUMN ogrn text,
  ADD COLUMN full_name text,
  ADD COLUMN address text,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD CONSTRAINT legal_entities_organization_kind CHECK (
    organization_kind IS NULL OR organization_kind IN ('legal_entity','sole_proprietor')
  ),
  ADD CONSTRAINT legal_entities_inn_format CHECK (
    inn IS NULL OR (inn !~ '^0+$' AND organization_kind IS NOT NULL AND (
      (organization_kind='legal_entity' AND inn ~ '^[0-9]{10}$') OR
      (organization_kind='sole_proprietor' AND inn ~ '^[0-9]{12}$')
    ))
  ),
  ADD CONSTRAINT legal_entities_kpp_format CHECK (
    kpp IS NULL OR (organization_kind IS NOT NULL AND organization_kind='legal_entity' AND kpp ~ '^[0-9]{9}$')
  ),
  ADD CONSTRAINT legal_entities_ogrn_format CHECK (
    ogrn IS NULL OR (organization_kind IS NOT NULL AND (
      (organization_kind='legal_entity' AND ogrn ~ '^[0-9]{13}$') OR
      (organization_kind='sole_proprietor' AND ogrn ~ '^[0-9]{15}$')
    ))
  );
CREATE UNIQUE INDEX legal_entities_inn_unique ON legal_entities(inn) WHERE inn IS NOT NULL;

-- API authorization requires a current, non-impersonated administrator session.
-- No existing grants or company relationships are changed by this migration.
GRANT INSERT ON legal_entities,projects,responsibility_scopes TO transport_app;
GRANT UPDATE(name,organization_kind,inn,kpp,ogrn,full_name,address,version) ON legal_entities TO transport_app;
