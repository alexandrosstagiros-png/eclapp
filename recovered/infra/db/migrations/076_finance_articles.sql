-- Extend the existing shared finance catalog; operations keep immutable article snapshots.
ALTER TABLE finance_ledger_catalogs DROP CONSTRAINT finance_ledger_catalogs_kind_check;
ALTER TABLE finance_ledger_catalogs ADD CONSTRAINT finance_ledger_catalogs_kind_check
  CHECK (kind IN ('parties','directions','articles','accounts','allocation_rules','plans','import_previews','settings','classification_rules','reconciliations'));
-- Names/codes are unique only within overlapping access scopes. API writes take
-- existing entity advisory locks before checking, including restores and edits.
CREATE INDEX finance_ledger_article_name ON finance_ledger_catalogs ((data->>'normalizedName'))
  WHERE kind='articles' AND NOT archived;
CREATE INDEX finance_ledger_article_code ON finance_ledger_catalogs ((data->>'normalizedCode'))
  WHERE kind='articles' AND NOT archived;
