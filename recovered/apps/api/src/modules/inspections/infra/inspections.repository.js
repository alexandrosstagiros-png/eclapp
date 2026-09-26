"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectionsRepository = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../../platform/database.service");
const scopeColumns = (alias) => `${alias}.legal_entity_id AS "legalEntityId",${alias}.region_id AS "regionId",${alias}.project_id AS "projectId",${alias}.responsibility_scope_id AS "responsibilityScopeId"`;
const scopeValues = (scope) => [scope.legalEntityId, scope.regionId, scope.projectId, scope.responsibilityScopeId];
const scopePredicate = (alias, first = 1) => `${alias}.legal_entity_id=$${first} AND ${alias}.region_id=$${first + 1} AND ${alias}.project_id=$${first + 2} AND ${alias}.responsibility_scope_id=$${first + 3}`;
const grantMatch = (source) => `g.legal_entity_id=${source}.legal_entity_id AND g.region_id=${source}.region_id AND g.project_id=${source}.project_id AND g.responsibility_scope_id=${source}.responsibility_scope_id`;
let InspectionsRepository = class InspectionsRepository {
    database;
    constructor(database) {
        this.database = database;
    }
    async trip(client, id) {
        return (await client.query(`SELECT t.id,t.reference,to_char(t.business_date,'YYYY-MM-DD') AS "businessDate",t.vehicle_id AS "vehicleId",v.label AS "vehicleName",${scopeColumns("t")}
      FROM trips t JOIN vehicles v ON v.id=t.vehicle_id WHERE t.id=$1 FOR UPDATE OF t`, [id])).rows[0];
    }
    async assigned(client, tripId, driverId) {
        return (await client.query("SELECT 1 FROM trip_assignments WHERE trip_id=$1 AND user_id=$2 AND active", [tripId, driverId])).rowCount === 1;
    }
    async lockScope(client, scope) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`inspection-template:${scopeValues(scope).join(":")}`]);
    }
    async cached(client, actorId, key) {
        return (await client.query("SELECT operation,request_hash,response FROM inspection_requests WHERE actor_id=$1 AND idempotency_key=$2", [actorId, key])).rows[0];
    }
    async saveResponse(client, actorId, key, operation, hash, response) {
        await client.query("INSERT INTO inspection_requests(actor_id,idempotency_key,operation,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)", [actorId, key, operation, hash, JSON.stringify(response)]);
    }
    async template(client, id) {
        const row = (await client.query(`SELECT t.id,t.version,t.title,t.created_at AS "createdAt",${scopeColumns("t")},
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'section',i.section,'kind',i.kind,'label',i.label,'instruction',i.instruction,'required',i.required,'critical',i.critical) ORDER BY i.position),'[]') FROM inspection_template_items i WHERE i.template_id=t.id) AS items
      FROM inspection_templates t WHERE t.id=$1`, [id])).rows[0];
        if (!row)
            return null;
        return { id: row.id, scope: { legalEntityId: row.legalEntityId, regionId: row.regionId, projectId: row.projectId, responsibilityScopeId: row.responsibilityScopeId }, version: row.version, title: row.title, createdAt: row.createdAt.toISOString(), items: row.items };
    }
    async currentTemplate(client, scope) {
        const id = (await client.query(`SELECT t.id FROM inspection_templates t WHERE ${scopePredicate("t")} ORDER BY version DESC LIMIT 1`, scopeValues(scope))).rows[0]?.id;
        return id ? this.template(client, id) : null;
    }
    async catalog(client, actor) {
        const scopes = (await client.query(`SELECT ${scopeColumns("g")},concat(r.name,' / ',p.name,' / ',rs.name,' / ',le.name) AS name
      FROM access_grants g JOIN legal_entities le ON le.id=g.legal_entity_id JOIN regions r ON r.id=g.region_id JOIN projects p ON p.id=g.project_id JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id
      WHERE g.user_id=$1 AND g.personal_data_visible ORDER BY r.name,p.name,rs.name`, [actor.id])).rows;
        const templates = [];
        for (const scope of scopes) {
            const template = await this.currentTemplate(client, scope);
            if (template)
                templates.push(template);
        }
        return { scopes, templates };
    }
    async insertTemplate(client, id, actorId, input) {
        await client.query(`INSERT INTO inspection_templates(id,legal_entity_id,region_id,project_id,responsibility_scope_id,version,title,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, ...scopeValues(input.scope), input.expectedVersion + 1, input.title, actorId]);
        for (const [position, item] of input.items.entries())
            await client.query(`INSERT INTO inspection_template_items(template_id,id,position,section,kind,label,instruction,required,critical) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, item.id, position, item.section, item.kind, item.label, item.instruction, item.required, item.critical]);
    }
    async latest(client, tripId, driverId) {
        return (await client.query(`SELECT s.id,s.revision,s.template_id AS "templateId",s.occurred_at AS "occurredAt",coalesce(r.decision,'pending') AS status FROM inspection_submissions s LEFT JOIN inspection_reviews r ON r.submission_id=s.id
      WHERE s.trip_id=$1 AND s.driver_id=$2 ORDER BY s.revision DESC LIMIT 1`, [tripId, driverId])).rows[0] ?? null;
    }
    async photoCount(client, tripId, driverId) {
        return Number((await client.query("SELECT count(*) FROM inspection_photos WHERE trip_id=$1 AND driver_id=$2 AND deleted_at IS NULL AND inspection_photo_expiry(uploaded_at)>clock_timestamp()", [tripId, driverId])).rows[0].count);
    }
    async insertPhoto(client, id, tripId, driverId, input) {
        const row = (await client.query(`INSERT INTO inspection_photos(id,trip_id,driver_id,template_id,item_id,mime_type,content,byte_size,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING uploaded_at AS "uploadedAt",inspection_photo_expiry(uploaded_at) AS "autoDeleteAt"`, [id, tripId, driverId, input.templateId, input.itemId, input.mimeType, input.bytes, input.bytes.length, input.sha256])).rows[0];
        return { id, itemId: input.itemId, mimeType: input.mimeType, byteSize: input.bytes.length, originalByteSize: input.bytes.length, sha256: input.sha256, uploadedAt: row.uploadedAt.toISOString(), autoDeleteAt: row.autoDeleteAt.toISOString(), compressedAt: null, deletionReason: null, deletedAt: null, deletedBy: null, deleteAvailableAt: null, canDelete: false };
    }
    async matchingPhotos(client, ids, tripId, driverId, templateId) {
        if (!ids.length)
            return [];
        return (await client.query(`SELECT id,item_id AS "itemId" FROM inspection_photos WHERE id=ANY($1::uuid[]) AND trip_id=$2 AND driver_id=$3 AND template_id=$4 AND deleted_at IS NULL AND content IS NOT NULL AND inspection_photo_expiry(uploaded_at)>clock_timestamp() ORDER BY id FOR SHARE`, [ids, tripId, driverId, templateId])).rows;
    }
    async insertSubmission(client, id, trip, driverId, input, critical) {
        await client.query(`INSERT INTO inspection_submissions(id,trip_id,driver_id,template_id,vehicle_id,business_date,legal_entity_id,region_id,project_id,responsibility_scope_id,revision,comment,occurred_at,has_critical_defects)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [id, trip.id, driverId, input.templateId, trip.vehicleId, trip.businessDate, ...scopeValues(trip), input.expectedRevision + 1, input.comment, input.occurredAt, critical]);
        for (const answer of input.answers) {
            await client.query("INSERT INTO inspection_answers(submission_id,template_id,item_id,result,comment) VALUES($1,$2,$3,$4,$5)", [id, input.templateId, answer.itemId, answer.result, answer.comment]);
            for (const photoId of answer.photoIds)
                await client.query("INSERT INTO inspection_answer_photos(submission_id,item_id,photo_id,trip_id,driver_id,template_id) VALUES($1,$2,$3,$4,$5,$6)", [id, answer.itemId, photoId, trip.id, driverId, input.templateId]);
        }
    }
    async submissionContext(client, id) {
        return (await client.query(`SELECT s.id,s.trip_id AS "tripId",s.driver_id AS "driverId",${scopeColumns("s")} FROM inspection_submissions s WHERE s.id=$1`, [id])).rows[0];
    }
    async submission(client, id, deletionRole = null) {
        const row = (await client.query(`SELECT s.id,s.trip_id AS "tripId",s.template_id AS "templateId",s.revision,s.comment,s.occurred_at AS "occurredAt",s.submitted_at AS "submittedAt",s.has_critical_defects AS "hasCriticalDefects",to_char(s.business_date,'YYYY-MM-DD') AS "businessDate",
      jsonb_build_object('id',s.driver_id,'name',u.display_name) AS driver,jsonb_build_object('id',s.vehicle_id,'name',v.label) AS vehicle,coalesce(r.decision,'pending') AS status,
      CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'decision',r.decision,'reason',r.reason,'reviewedAt',r.reviewed_at) END AS review,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',a.item_id,'result',a.result,'comment',a.comment,'photoIds',(SELECT coalesce(jsonb_agg(ap.photo_id ORDER BY ap.photo_id),'[]') FROM inspection_answer_photos ap WHERE ap.submission_id=a.submission_id AND ap.item_id=a.item_id)) ORDER BY i.position),'[]') FROM inspection_answers a JOIN inspection_template_items i ON i.template_id=a.template_id AND i.id=a.item_id WHERE a.submission_id=s.id) AS answers,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'itemId',p.item_id,'mimeType',p.stored_mime_type,'byteSize',p.stored_byte_size,'originalByteSize',p.byte_size,'sha256',p.stored_sha256,'uploadedAt',p.uploaded_at,'compressedAt',p.compressed_at,'autoDeleteAt',inspection_photo_expiry(p.uploaded_at),
        'deletedAt',coalesce(p.deleted_at,CASE WHEN inspection_photo_expiry(p.uploaded_at)<=clock_timestamp() THEN inspection_photo_expiry(p.uploaded_at) END),'deletedBy',p.deleted_by,'deletionReason',coalesce(p.deletion_reason,CASE WHEN inspection_photo_expiry(p.uploaded_at)<=clock_timestamp() THEN 'retention' END),
        'deleteAvailableAt',CASE WHEN $2::text='access_admin' THEN p.uploaded_at WHEN $2::text='mechanic' THEN p.uploaded_at+interval '1 month' ELSE NULL END,
        'canDelete',p.deleted_at IS NULL AND inspection_photo_expiry(p.uploaded_at)>clock_timestamp() AND coalesce($2::text='access_admin' OR ($2::text='mechanic' AND clock_timestamp()>=p.uploaded_at+interval '1 month'),false)) ORDER BY p.uploaded_at,p.id),'[]') FROM inspection_photos p JOIN inspection_answer_photos ap ON ap.photo_id=p.id WHERE ap.submission_id=s.id) AS photos
      FROM inspection_submissions s JOIN users u ON u.id=s.driver_id JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN inspection_reviews r ON r.submission_id=s.id WHERE s.id=$1`, [id, deletionRole])).rows[0];
        if (!row)
            return null;
        const template = await this.template(client, row.templateId);
        if (!template)
            throw new Error("Inspection template integrity error");
        const { templateId: unused, ...values } = row;
        void unused;
        return { ...values, template, occurredAt: row.occurredAt.toISOString(), submittedAt: row.submittedAt.toISOString(), review: row.review ? { ...row.review, reviewedAt: new Date(row.review.reviewedAt).toISOString() } : null, photos: row.photos.map((photo) => ({ ...photo, uploadedAt: new Date(photo.uploadedAt).toISOString(), autoDeleteAt: new Date(photo.autoDeleteAt).toISOString(), compressedAt: photo.compressedAt ? new Date(photo.compressedAt).toISOString() : null, deletedAt: photo.deletedAt ? new Date(photo.deletedAt).toISOString() : null, deleteAvailableAt: photo.deleteAvailableAt ? new Date(photo.deleteAvailableAt).toISOString() : null })) };
    }
    async submissionIds(client, tripId, driverId) {
        return (await client.query(`SELECT id FROM inspection_submissions WHERE trip_id=$1 AND ($2::uuid IS NULL OR driver_id=$2) ORDER BY submitted_at DESC,id DESC LIMIT 100`, [tripId, driverId])).rows.map((row) => row.id);
    }
    async insertReview(client, id, submissionId, actorId, decision, reason) {
        const row = (await client.query(`INSERT INTO inspection_reviews(id,submission_id,reviewed_by,decision,reason) VALUES($1,$2,$3,$4,$5) RETURNING reviewed_at AS "reviewedAt"`, [id, submissionId, actorId, decision, reason])).rows[0];
        return { id, decision, reason, reviewedAt: row.reviewedAt.toISOString() };
    }
    async queue(client, actorId, status, cursor) {
        const rows = (await client.query(`WITH latest AS (
      SELECT DISTINCT ON (s.trip_id,s.driver_id) s.*,g.personal_data_visible FROM inspection_submissions s JOIN access_grants g ON g.user_id=$1 AND ${grantMatch("s")}
      ORDER BY s.trip_id,s.driver_id,s.revision DESC
    ) SELECT s.id,s.trip_id AS "tripId",CASE WHEN s.personal_data_visible AND current_grant.personal_data_visible THEN t.reference ELSE 'Рейс ' || left(t.id::text,8) END AS "tripReference",s.revision,to_char(s.business_date,'YYYY-MM-DD') AS "businessDate",s.submitted_at AS "submittedAt",s.has_critical_defects AS "hasCriticalDefects",coalesce(r.decision,'pending') AS status,
      jsonb_build_object('id',s.driver_id,'name',CASE WHEN s.personal_data_visible AND current_grant.personal_data_visible THEN u.display_name ELSE 'Водитель ' || left(s.driver_id::text,8) END) AS driver,
      jsonb_build_object('id',s.vehicle_id,'name',CASE WHEN s.personal_data_visible AND current_grant.personal_data_visible THEN v.label ELSE 'ТС ' || left(s.vehicle_id::text,8) END) AS vehicle
      FROM latest s JOIN trips t ON t.id=s.trip_id JOIN users u ON u.id=s.driver_id JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN inspection_reviews r ON r.submission_id=s.id
      JOIN access_grants current_grant ON current_grant.user_id=$1 AND current_grant.legal_entity_id=t.legal_entity_id AND current_grant.region_id=t.region_id AND current_grant.project_id=t.project_id AND current_grant.responsibility_scope_id=t.responsibility_scope_id
      WHERE coalesce(r.decision,'pending')=$2 AND ($3::timestamptz IS NULL OR (s.submitted_at,s.id)<($3::timestamptz,$4::uuid))
      ORDER BY s.submitted_at DESC,s.id DESC LIMIT 51`, [actorId, status, cursor?.submittedAt ?? null, cursor?.id ?? null])).rows;
        return rows.map((row) => ({ ...row, submittedAt: row.submittedAt.toISOString() }));
    }
    async photoContext(client, id) {
        return (await client.query(`SELECT p.id,p.trip_id AS "tripId",p.driver_id AS "driverId",p.template_id AS "templateId",p.item_id AS "itemId",p.stored_mime_type AS "mimeType",p.stored_sha256 AS sha256,coalesce(p.deleted_at,CASE WHEN inspection_photo_expiry(p.uploaded_at)<=clock_timestamp() THEN inspection_photo_expiry(p.uploaded_at) END) AS "deletedAt",${scopeColumns("t")},EXISTS(SELECT 1 FROM inspection_answer_photos ap WHERE ap.photo_id=p.id) AS linked
      FROM inspection_photos p JOIN inspection_templates t ON t.id=p.template_id WHERE p.id=$1`, [id])).rows[0];
    }
    async lockPhoto(client, id, deletionRole) {
        return (await client.query(`SELECT id,coalesce(deleted_at,CASE WHEN inspection_photo_expiry(uploaded_at)<=clock_timestamp() THEN inspection_photo_expiry(uploaded_at) END) AS "deletedAt",deleted_by AS "deletedBy",coalesce(deletion_reason,CASE WHEN inspection_photo_expiry(uploaded_at)<=clock_timestamp() THEN 'retention' END) AS "deletionReason",inspection_photo_expiry(uploaded_at) AS "autoDeleteAt",
          CASE WHEN $2::text='access_admin' THEN uploaded_at ELSE uploaded_at+interval '1 month' END AS "deleteAvailableAt",
          ($2::text='access_admin' OR clock_timestamp()>=uploaded_at+interval '1 month') AS "ageEligible"
          FROM inspection_photos WHERE id=$1 FOR UPDATE`, [id, deletionRole])).rows[0];
    }
    async deletePhoto(client, id, actorId) {
        return (await client.query(`UPDATE inspection_photos SET content=NULL,deleted_at=clock_timestamp(),deleted_by=$2,deletion_reason='manual'
          WHERE id=$1 AND deleted_at IS NULL RETURNING id,deleted_at AS "deletedAt",deleted_by AS "deletedBy",deletion_reason AS "deletionReason"`, [id, actorId])).rows[0];
    }
    async photoBytes(client, id) {
        return (await client.query(`SELECT content,stored_mime_type AS "mimeType",stored_byte_size AS "byteSize",stored_sha256 AS sha256 FROM inspection_photos WHERE id=$1 AND deleted_at IS NULL AND content IS NOT NULL AND inspection_photo_expiry(uploaded_at)>clock_timestamp() FOR SHARE`, [id])).rows[0] ?? null;
    }
    async attention(client, actorId) {
        const rows = (await client.query(`WITH latest AS (
          SELECT DISTINCT ON (s.trip_id) s.* FROM inspection_submissions s WHERE s.driver_id=$1 ORDER BY s.trip_id,s.revision DESC
        ) SELECT s.trip_id AS "tripId",t.reference AS "tripReference",s.id AS "submissionId",s.revision,r.reason,r.reviewed_at AS "reviewedAt"
          FROM latest s JOIN trips t ON t.id=s.trip_id JOIN inspection_reviews r ON r.submission_id=s.id AND r.decision='returned'
          WHERE EXISTS(SELECT 1 FROM trip_assignments a WHERE a.trip_id=t.id AND a.user_id=$1 AND a.active)
            AND EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=$1 AND ${grantMatch("s")})
            AND EXISTS(SELECT 1 FROM access_grants g WHERE g.user_id=$1 AND ${grantMatch("t")})
          ORDER BY r.reviewed_at DESC,s.id DESC`, [actorId])).rows;
        const items = rows.map((row) => ({ ...row, reviewedAt: row.reviewedAt.toISOString() }));
        return { count: items.length, items };
    }
};
exports.InspectionsRepository = InspectionsRepository;
exports.InspectionsRepository = InspectionsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], InspectionsRepository);
//# sourceMappingURL=inspections.repository.js.map
