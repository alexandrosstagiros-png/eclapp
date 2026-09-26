-- SPDX-License-Identifier: MIT
-- A source workbook may retain paused projects without a known requirement or
-- city. Opening them still requires complete operational recruiting data.
ALTER TABLE recruitment_requests
 DROP CONSTRAINT recruitment_requests_quantity_check,
 DROP CONSTRAINT recruitment_requests_city_check,
 ALTER COLUMN quantity DROP NOT NULL,
 ADD CONSTRAINT recruitment_requests_quantity_check CHECK(
   (status='open' AND quantity IS NOT NULL AND quantity BETWEEN 1 AND 10000)
   OR (status IN ('paused','closed') AND (quantity IS NULL OR quantity BETWEEN 0 AND 10000))
 ),
 ADD CONSTRAINT recruitment_requests_city_check CHECK(
   length(city)<=100 AND (status<>'open' OR length(btrim(city))>0)
 ),
 ADD COLUMN source_details text NOT NULL DEFAULT '' CHECK(length(source_details)<=100000);

-- source_details is populated by the administrative import. Ordinary API
-- updates intentionally have no column privilege and preserve this reference.
