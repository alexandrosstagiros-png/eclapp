CREATE FUNCTION inspection_photo_expiry(uploaded_at timestamptz) RETURNS timestamptz
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT ((uploaded_at AT TIME ZONE 'Europe/Moscow')+interval '3 months') AT TIME ZONE 'Europe/Moscow';
$$;

-- Upload evidence remains immutable; only its stored representation may shrink
-- after acceptance, or be erased after the retention deadline.
DROP TRIGGER inspection_photos_lifecycle ON inspection_photos;
ALTER TABLE inspection_photos
  ADD COLUMN stored_mime_type text,
  ADD COLUMN stored_byte_size integer,
  ADD COLUMN stored_sha256 text,
  ADD COLUMN compressed_at timestamptz(3),
  ADD COLUMN compression_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN compression_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN compression_next_attempt_at timestamptz(3),
  ADD COLUMN compression_error text,
  ADD COLUMN compression_checked_at timestamptz(3),
  ADD COLUMN deletion_reason text;
UPDATE inspection_photos SET stored_mime_type=mime_type,stored_byte_size=byte_size,stored_sha256=sha256,
  deletion_reason=CASE WHEN deleted_at IS NOT NULL THEN 'manual' ELSE NULL END;

-- Replace the checks against original bytes, not the original metadata checks.
DO $$ DECLARE constraint_row record; BEGIN
  FOR constraint_row IN SELECT conname FROM pg_constraint WHERE conrelid='inspection_photos'::regclass
    AND contype='c' AND (pg_get_constraintdef(oid) LIKE '%octet_length(content)%'
      OR pg_get_constraintdef(oid) LIKE '%digest(content,%') LOOP
    EXECUTE format('ALTER TABLE inspection_photos DROP CONSTRAINT %I',constraint_row.conname);
  END LOOP;
END; $$;
ALTER TABLE inspection_photos DROP CONSTRAINT inspection_photos_deletion_state;
ALTER TABLE inspection_photos
  ALTER COLUMN stored_mime_type SET NOT NULL,
  ALTER COLUMN stored_byte_size SET NOT NULL,
  ALTER COLUMN stored_sha256 SET NOT NULL,
  ADD CONSTRAINT inspection_photos_stored_metadata CHECK (
    stored_mime_type IN ('image/jpeg','image/png','image/webp')
    AND stored_byte_size BETWEEN 1 AND byte_size AND stored_sha256 ~ '^[a-f0-9]{64}$'
    AND (content IS NULL OR (octet_length(content)=stored_byte_size AND encode(digest(content,'sha256'),'hex')=stored_sha256))
  ),
  ADD CONSTRAINT inspection_photos_compression_state CHECK (
    compression_status IN ('pending','complete','failed') AND compression_attempts BETWEEN 0 AND 5
    AND (compression_error IS NULL OR compression_error IN ('INSPECTION_PHOTO_INVALID_IMAGE','INSPECTION_PHOTO_COMPRESSION_TIMEOUT','INSPECTION_PHOTO_COMPRESSION_FAILED'))
    AND (compression_status='pending' OR compression_next_attempt_at IS NULL)
    AND (compressed_at IS NULL OR (compression_status='complete' AND compressed_at>=uploaded_at AND stored_byte_size<byte_size AND stored_mime_type='image/webp'))
  ),
  ADD CONSTRAINT inspection_photos_deletion_state CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL AND content IS NOT NULL)
    OR (deleted_at IS NOT NULL AND content IS NULL AND deleted_at>=uploaded_at
      AND ((deletion_reason='manual' AND deleted_by IS NOT NULL)
        OR (deletion_reason='retention' AND deleted_by IS NULL AND deleted_at>=inspection_photo_expiry(uploaded_at))))
  );
CREATE INDEX inspection_photos_retention_due ON inspection_photos(uploaded_at,id) WHERE deleted_at IS NULL;
CREATE INDEX inspection_photos_compression_pending ON inspection_photos(compression_next_attempt_at,uploaded_at,id)
  WHERE deleted_at IS NULL AND compression_status='pending';

CREATE OR REPLACE FUNCTION guard_inspection_photo_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.stored_mime_type:=coalesce(NEW.stored_mime_type,NEW.mime_type);
    NEW.stored_byte_size:=coalesce(NEW.stored_byte_size,NEW.byte_size);
    NEW.stored_sha256:=coalesce(NEW.stored_sha256,NEW.sha256);
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL OR NEW.deletion_reason IS NOT NULL OR NEW.content IS NULL
      OR ROW(NEW.stored_mime_type,NEW.stored_byte_size,NEW.stored_sha256) IS DISTINCT FROM ROW(NEW.mime_type,NEW.byte_size,NEW.sha256)
      OR NEW.compressed_at IS NOT NULL OR NEW.compression_status<>'pending' OR NEW.compression_attempts<>0
      OR NEW.compression_next_attempt_at IS NOT NULL OR NEW.compression_error IS NOT NULL OR NEW.compression_checked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Inspection photos must be uploaded with original content';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.deleted_at IS NOT NULL OR OLD.content IS NULL
    OR ROW(NEW.id,NEW.trip_id,NEW.driver_id,NEW.template_id,NEW.item_id,NEW.mime_type,NEW.byte_size,NEW.sha256,NEW.uploaded_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.trip_id,OLD.driver_id,OLD.template_id,OLD.item_id,OLD.mime_type,OLD.byte_size,OLD.sha256,OLD.uploaded_at) THEN
    RAISE EXCEPTION 'Inspection upload evidence and deleted photos are immutable';
  END IF;
  IF NEW.content IS NULL THEN
    -- Keep compatibility with callers that used the established manual operation.
    IF NEW.deletion_reason IS NULL AND NEW.deleted_by IS NOT NULL THEN NEW.deletion_reason:='manual'; END IF;
    IF NEW.deleted_at IS NULL OR NEW.deleted_at<OLD.uploaded_at
      OR (NEW.deletion_reason='retention' AND (NEW.deleted_by IS NOT NULL OR clock_timestamp()<inspection_photo_expiry(OLD.uploaded_at)))
      OR (NEW.deletion_reason='manual' AND NEW.deleted_by IS NULL)
      OR NEW.deletion_reason NOT IN ('manual','retention') OR NEW.deletion_reason IS NULL
      OR ROW(NEW.stored_mime_type,NEW.stored_byte_size,NEW.stored_sha256,NEW.compressed_at,NEW.compression_status,NEW.compression_attempts,NEW.compression_next_attempt_at,NEW.compression_error,NEW.compression_checked_at)
        IS DISTINCT FROM ROW(OLD.stored_mime_type,OLD.stored_byte_size,OLD.stored_sha256,OLD.compressed_at,OLD.compression_status,OLD.compression_attempts,OLD.compression_next_attempt_at,OLD.compression_error,OLD.compression_checked_at) THEN
      RAISE EXCEPTION 'Only one-way removal of inspection photo content is allowed';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL OR NEW.deletion_reason IS NOT NULL
    OR OLD.compression_status<>'pending' OR NEW.compression_attempts<>OLD.compression_attempts+1
    OR NEW.compression_checked_at IS NULL OR NEW.compression_checked_at<OLD.uploaded_at
    OR clock_timestamp()>=inspection_photo_expiry(OLD.uploaded_at)
    OR NOT EXISTS(SELECT 1 FROM inspection_answer_photos ap JOIN inspection_reviews r ON r.submission_id=ap.submission_id
      WHERE ap.photo_id=OLD.id AND r.decision='accepted') THEN
    RAISE EXCEPTION 'Only accepted live inspection photos can be compressed';
  END IF;
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF NEW.compression_status<>'complete' OR NEW.compressed_at IS NULL OR NEW.stored_mime_type<>'image/webp'
      OR NEW.stored_byte_size>=OLD.stored_byte_size OR NEW.compression_error IS NOT NULL THEN
      RAISE EXCEPTION 'Inspection compression must reduce stored bytes';
    END IF;
  ELSIF ROW(NEW.stored_mime_type,NEW.stored_byte_size,NEW.stored_sha256,NEW.compressed_at)
    IS DISTINCT FROM ROW(OLD.stored_mime_type,OLD.stored_byte_size,OLD.stored_sha256,OLD.compressed_at) THEN
    RAISE EXCEPTION 'Unchanged inspection bytes must retain their representation metadata';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inspection_photos_lifecycle BEFORE INSERT OR UPDATE ON inspection_photos
  FOR EACH ROW EXECUTE FUNCTION guard_inspection_photo_lifecycle();

CREATE OR REPLACE FUNCTION guard_inspection_live_photo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE live_photo uuid;
BEGIN
  SELECT id INTO live_photo FROM inspection_photos WHERE id=NEW.photo_id AND deleted_at IS NULL AND content IS NOT NULL
    AND inspection_photo_expiry(uploaded_at)>clock_timestamp() FOR SHARE;
  IF live_photo IS NULL THEN RAISE EXCEPTION 'Deleted or expired inspection photo cannot be used in a new submission'; END IF;
  RETURN NEW;
END;
$$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='transport_app') THEN
    GRANT UPDATE(content,deleted_at,deleted_by,deletion_reason,stored_mime_type,stored_byte_size,stored_sha256,
      compressed_at,compression_status,compression_attempts,compression_next_attempt_at,compression_error,compression_checked_at)
      ON inspection_photos TO transport_app;
  END IF;
END; $$;
