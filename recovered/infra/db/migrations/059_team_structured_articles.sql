-- SPDX-License-Identifier: MIT
-- Existing instructions keep their original content and remain unstructured.
ALTER TABLE team_articles ADD COLUMN structured boolean NOT NULL DEFAULT false;
ALTER TABLE team_articles ADD COLUMN reason text CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 4000);
ALTER TABLE team_articles ADD COLUMN purpose text CHECK(purpose IS NULL OR length(btrim(purpose)) BETWEEN 1 AND 4000);
ALTER TABLE team_articles ADD COLUMN result text CHECK(result IS NULL OR length(btrim(result)) BETWEEN 1 AND 4000);
ALTER TABLE team_articles ADD CHECK((structured AND reason IS NOT NULL AND purpose IS NOT NULL AND result IS NOT NULL)
  OR (NOT structured AND reason IS NULL AND purpose IS NULL AND result IS NULL));
ALTER TABLE team_articles ADD CONSTRAINT team_articles_company_identity UNIQUE(id,legal_entity_id);
ALTER TABLE team_organization_positions ADD CONSTRAINT team_organization_positions_company_identity UNIQUE(id,legal_entity_id);
GRANT UPDATE(structured,reason,purpose,result) ON team_articles TO transport_app;

CREATE TABLE team_article_audience_positions (
  article_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  position_id uuid NOT NULL,
  position_title text NOT NULL CHECK(length(btrim(position_title)) BETWEEN 1 AND 120),
  PRIMARY KEY(article_id,position_id),
  FOREIGN KEY(article_id,legal_entity_id) REFERENCES team_articles(id,legal_entity_id),
  FOREIGN KEY(position_id,legal_entity_id) REFERENCES team_organization_positions(id,legal_entity_id)
);
GRANT SELECT,INSERT,DELETE ON team_article_audience_positions TO transport_app;

CREATE FUNCTION guard_team_article_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.author_id,NEW.author_name,NEW.created_at) IS DISTINCT FROM (OLD.author_id,OLD.author_name,OLD.created_at) THEN
    RAISE EXCEPTION 'Article authorship and creation date are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.structured AND NOT NEW.structured THEN
    RAISE EXCEPTION 'Structured articles cannot lose their required metadata' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_articles_identity_guard BEFORE UPDATE ON team_articles
  FOR EACH ROW EXECUTE FUNCTION guard_team_article_identity();
