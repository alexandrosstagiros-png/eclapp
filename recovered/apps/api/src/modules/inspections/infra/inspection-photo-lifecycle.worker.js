"use strict";
const { randomUUID } = require("node:crypto");
const { Injectable, Inject } = require("@nestjs/common");
const { DatabaseService } = require("../../../platform/database.service");
const { AuditService } = require("../../audit/application/audit.service");
const { compressInspectionPhoto } = require("../domain/photo-compression");

const SCOPE = `t.legal_entity_id,t.region_id,t.project_id,t.responsibility_scope_id`;
class InspectionPhotoLifecycleWorker {
  constructor(database, audit, compressor = compressInspectionPhoto) {
    this.database = database; this.audit = audit; this.compressor = compressor; this.closing = false;
  }
  onModuleInit() {
    const enabled = process.env.INSPECTION_PHOTO_MAINTENANCE_ENABLED;
    if (enabled === "false" || (enabled !== "true" && process.env.NODE_ENV === "test")) return;
    const tick = () => this.runOnce().catch(() => process.stderr.write("Inspection photo maintenance temporarily unavailable\n"));
    this.timer = setInterval(tick, 60000);
    this.timer.unref();
    tick();
  }
  async onModuleDestroy() { this.closing = true; clearInterval(this.timer); await this.running?.catch(() => {}); }
  runOnce() {
    if (this.running) return this.running;
    this.running = this.processBatch().finally(() => { this.running = undefined; });
    return this.running;
  }
  async event(client, photo, action, metadata) {
    await this.audit.append(client, { actorId: null, channel: "system", correlationId: randomUUID(),
      action, entityType: "inspection_photo", entityId: photo.id,
      scope: { legalEntityId: photo.legal_entity_id, regionId: photo.region_id, projectId: photo.project_id, responsibilityScopeId: photo.responsibility_scope_id },
      metadata: { tripId: photo.trip_id, templateId: photo.template_id, itemId: photo.item_id, originalSha256: photo.sha256, ...metadata } });
  }
  async processBatch() {
    const result = { deleted: 0, compressed: 0, unchanged: 0, failed: 0 };
    // Small, independent transactions make restarts and multiple API processes
    // safe. A locked row is skipped, and every byte change shares its audit commit.
    for (let count = 0; count < 100 && !this.closing; count++) {
      const deleted = await this.database.transaction(async client => {
        const photo = (await client.query(`SELECT p.id,p.trip_id,p.template_id,p.item_id,p.sha256,p.stored_byte_size,p.uploaded_at,${SCOPE}
          FROM inspection_photos p JOIN inspection_templates t ON t.id=p.template_id
          WHERE p.deleted_at IS NULL AND inspection_photo_expiry(p.uploaded_at)<=clock_timestamp()
          ORDER BY p.uploaded_at,p.id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`)).rows[0];
        if (!photo) return false;
        await client.query(`UPDATE inspection_photos SET content=NULL,deleted_at=clock_timestamp(),deleted_by=NULL,deletion_reason='retention' WHERE id=$1`, [photo.id]);
        await this.event(client, photo, "inspections.photo_retention_deleted", { reason: "retention", uploadedAt: photo.uploaded_at.toISOString(), removedByteSize: photo.stored_byte_size });
        return true;
      });
      if (!deleted) break;
      result.deleted++;
    }
    for (let count = 0; count < 20 && !this.closing; count++) {
      const state = await this.database.transaction(async client => {
        const photo = (await client.query(`SELECT p.id,p.trip_id,p.template_id,p.item_id,p.sha256,p.content,p.stored_mime_type,p.stored_byte_size,p.compression_attempts,${SCOPE}
          FROM inspection_photos p JOIN inspection_templates t ON t.id=p.template_id
          WHERE p.deleted_at IS NULL AND p.content IS NOT NULL AND p.compression_status='pending'
            AND inspection_photo_expiry(p.uploaded_at)>clock_timestamp()
            AND (p.compression_next_attempt_at IS NULL OR p.compression_next_attempt_at<=clock_timestamp())
            AND EXISTS(SELECT 1 FROM inspection_answer_photos ap JOIN inspection_reviews r ON r.submission_id=ap.submission_id
              WHERE ap.photo_id=p.id AND r.decision='accepted')
          ORDER BY p.uploaded_at,p.id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`)).rows[0];
        if (!photo) return null;
        let compressed;
        try { compressed = await this.compressor({ content: photo.content, mimeType: photo.stored_mime_type }); }
        catch (error) {
          const code = ["INSPECTION_PHOTO_INVALID_IMAGE", "INSPECTION_PHOTO_COMPRESSION_TIMEOUT"].includes(error?.code) ? error.code : "INSPECTION_PHOTO_COMPRESSION_FAILED";
          const terminal = error?.retryable === false || photo.compression_attempts + 1 >= 5;
          await client.query(`UPDATE inspection_photos SET compression_status=$2,compression_attempts=compression_attempts+1,
            compression_checked_at=clock_timestamp(),compression_error=$3,
            compression_next_attempt_at=CASE WHEN $2='failed' THEN NULL ELSE clock_timestamp()+($4::int*interval '1 minute') END
            WHERE id=$1`, [photo.id, terminal ? "failed" : "pending", code, 5 * (2 ** photo.compression_attempts)]);
          await this.event(client, photo, "inspections.photo_compression_failed", { code, attempts: photo.compression_attempts + 1, terminal });
          return "failed";
        }
        if (compressed.changed) {
          await client.query(`UPDATE inspection_photos SET content=$2,stored_mime_type=$3,stored_byte_size=$4,stored_sha256=$5,
            compressed_at=clock_timestamp(),compression_status='complete',compression_attempts=compression_attempts+1,
            compression_checked_at=clock_timestamp(),compression_error=NULL,compression_next_attempt_at=NULL WHERE id=$1`,
            [photo.id, compressed.content, compressed.mimeType, compressed.byteSize, compressed.sha256]);
        } else {
          await client.query(`UPDATE inspection_photos SET compression_status='complete',compression_attempts=compression_attempts+1,
            compression_checked_at=clock_timestamp(),compression_error=NULL,compression_next_attempt_at=NULL WHERE id=$1`, [photo.id]);
        }
        await this.event(client, photo, "inspections.photo_compressed", { changed: compressed.changed, previousByteSize: photo.stored_byte_size,
          byteSize: compressed.byteSize, sha256: compressed.sha256, mimeType: compressed.mimeType, width: compressed.width, height: compressed.height });
        return compressed.changed ? "compressed" : "unchanged";
      });
      if (!state) break;
      result[state]++;
    }
    return result;
  }
}
Injectable()(InspectionPhotoLifecycleWorker);
Inject(DatabaseService)(InspectionPhotoLifecycleWorker, undefined, 0);
Inject(AuditService)(InspectionPhotoLifecycleWorker, undefined, 1);
module.exports = { InspectionPhotoLifecycleWorker };
