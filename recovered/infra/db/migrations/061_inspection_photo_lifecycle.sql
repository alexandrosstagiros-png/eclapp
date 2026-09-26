-- Keep the immutable inspection history while permitting irreversible removal
-- of photo bytes. The original checksum, size and links remain as evidence.
ALTER TABLE inspection_photos
  ALTER COLUMN content DROP NOT NULL,
  ADD COLUMN deleted_at timestamptz(3),
  ADD COLUMN deleted_by uuid REFERENCES users,
  ADD CONSTRAINT inspection_photos_deletion_state CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL AND content IS NOT NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND content IS NULL AND deleted_at >= uploaded_at)
  );

DROP TRIGGER inspection_photos_immutable ON inspection_photos;
CREATE TRIGGER inspection_photos_immutable
  BEFORE DELETE OR TRUNCATE ON inspection_photos
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_mutation();

CREATE FUNCTION guard_inspection_photo_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL OR NEW.content IS NULL THEN
      RAISE EXCEPTION 'Inspection photos must be uploaded with content';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.deleted_at IS NOT NULL OR OLD.content IS NULL
    OR NEW.content IS NOT NULL OR NEW.deleted_at IS NULL OR NEW.deleted_by IS NULL
    OR NEW.deleted_at < OLD.uploaded_at
    OR ROW(NEW.id,NEW.trip_id,NEW.driver_id,NEW.template_id,NEW.item_id,NEW.mime_type,NEW.byte_size,NEW.sha256,NEW.uploaded_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.trip_id,OLD.driver_id,OLD.template_id,OLD.item_id,OLD.mime_type,OLD.byte_size,OLD.sha256,OLD.uploaded_at) THEN
    RAISE EXCEPTION 'Only one-way removal of inspection photo content is allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inspection_photos_lifecycle
  BEFORE INSERT OR UPDATE ON inspection_photos
  FOR EACH ROW EXECUTE FUNCTION guard_inspection_photo_lifecycle();

-- A correction can retain the exact occurrence time of the immediately prior
-- returned revision. New timestamps still use the existing seven-day window.
ALTER TABLE inspection_submissions DROP CONSTRAINT inspection_submissions_check;
ALTER TABLE inspection_submissions ADD CONSTRAINT inspection_submissions_time_ceiling
  CHECK(occurred_at <= submitted_at + interval '5 minutes');
CREATE FUNCTION guard_inspection_submission_time() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous record;
BEGIN
  IF NEW.occurred_at >= NEW.submitted_at - interval '7 days' THEN
    RETURN NEW;
  END IF;
  SELECT s.revision,s.occurred_at,r.decision INTO previous
    FROM inspection_submissions s LEFT JOIN inspection_reviews r ON r.submission_id=s.id
    WHERE s.trip_id=NEW.trip_id AND s.driver_id=NEW.driver_id
    ORDER BY s.revision DESC LIMIT 1;
  IF previous.revision IS NULL OR previous.revision <> NEW.revision-1
    OR previous.decision IS DISTINCT FROM 'returned'
    OR previous.occurred_at IS DISTINCT FROM NEW.occurred_at THEN
    RAISE EXCEPTION 'An old inspection time must match the latest returned revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inspection_submissions_time
  BEFORE INSERT ON inspection_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_inspection_submission_time();

-- New revisions may reuse live photos. Historical links to deleted photos are
-- preserved, but cannot be copied into a new revision.
CREATE FUNCTION guard_inspection_live_photo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE live_photo uuid;
BEGIN
  SELECT id INTO live_photo FROM inspection_photos
    WHERE id=NEW.photo_id AND deleted_at IS NULL AND content IS NOT NULL FOR SHARE;
  IF live_photo IS NULL THEN
    RAISE EXCEPTION 'Deleted inspection photo cannot be used in a new submission';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inspection_answer_photos_live
  BEFORE INSERT ON inspection_answer_photos
  FOR EACH ROW EXECUTE FUNCTION guard_inspection_live_photo();

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='transport_app') THEN
    GRANT UPDATE(content,deleted_at,deleted_by) ON inspection_photos TO transport_app;
  END IF;
END;
$$;
