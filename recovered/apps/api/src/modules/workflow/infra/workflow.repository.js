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
exports.WorkflowRepository = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../../platform/database.service");
const validation_1 = require("../domain/validation");
let WorkflowRepository = class WorkflowRepository {
    database;
    constructor(database) {
        this.database = database;
    }
    async trip(client, id) {
        const result = await client.query(`SELECT id,to_char(business_date,'YYYY-MM-DD') AS "businessDate",
      legal_entity_id AS "legalEntityId",region_id AS "regionId",project_id AS "projectId",
      responsibility_scope_id AS "responsibilityScopeId" FROM trips WHERE id=$1 FOR UPDATE`, [id]);
        return result.rows[0];
    }
    async assigned(client, tripId, userId) {
        return (await client.query("SELECT 1 FROM trip_assignments WHERE trip_id=$1 AND user_id=$2 AND active", [tripId, userId])).rowCount === 1;
    }
    async cached(client, actorId, key) {
        return (await client.query("SELECT operation,request_hash,response FROM workflow_requests WHERE actor_id=$1 AND idempotency_key=$2", [actorId, key])).rows[0];
    }
    async saveResponse(client, actorId, key, operation, hash, result) {
        await client.query("INSERT INTO workflow_requests(actor_id,idempotency_key,operation,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)", [actorId, key, operation, hash, JSON.stringify(result)]);
    }
    async catalog(client, actor) {
        const scopes = await client.query(`SELECT g.legal_entity_id AS "legalEntityId",g.region_id AS "regionId",g.project_id AS "projectId",g.responsibility_scope_id AS "responsibilityScopeId",
      le.name AS "legalEntityName",r.name AS "regionName",p.name AS "projectName",rs.name AS "responsibilityScopeName"
      FROM access_grants g JOIN legal_entities le ON le.id=g.legal_entity_id JOIN regions r ON r.id=g.region_id
      JOIN projects p ON p.id=g.project_id JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id
      WHERE g.user_id=$1 ORDER BY r.name,p.name,rs.name`, [actor.id]);
        const vehicles = await client.query(`SELECT v.id,v.label,v.body_type AS "bodyType",v.capacity_kg AS "capacityKg",v.fleet_type AS "fleetType"
      FROM vehicles v WHERE EXISTS(SELECT 1 FROM trips t JOIN access_grants g ON g.user_id=$1
        AND g.legal_entity_id=t.legal_entity_id AND g.region_id=t.region_id AND g.project_id=t.project_id
        AND g.responsibility_scope_id=t.responsibility_scope_id WHERE t.vehicle_id=v.id)
      ORDER BY v.label,v.id LIMIT 500`, [actor.id]);
        const drivers = await client.query(`SELECT u.id,
      CASE WHEN own.personal_data_visible THEN u.display_name ELSE 'Водитель ' || left(u.id::text,8) END AS name,
      jsonb_build_object('legalEntityId',g.legal_entity_id,'regionId',g.region_id,'projectId',g.project_id,'responsibilityScopeId',g.responsibility_scope_id) AS scope
      FROM users u JOIN access_grants g ON g.user_id=u.id JOIN access_grants own ON own.user_id=$1
      AND own.legal_entity_id=g.legal_entity_id AND own.region_id=g.region_id AND own.project_id=g.project_id
      AND own.responsibility_scope_id=g.responsibility_scope_id
      WHERE u.role='driver' AND u.active AND u.approved ORDER BY u.id,g.project_id LIMIT 1000`, [actor.id]);
        const byId = new Map();
        for (const driver of drivers.rows) {
            const existing = byId.get(driver.id);
            if (existing)
                existing.scopes.push(driver.scope);
            else
                byId.set(driver.id, { id: driver.id, name: driver.name, scopes: [driver.scope] });
        }
        return { scopes: scopes.rows, vehicles: vehicles.rows, drivers: [...byId.values()], csvTemplate: validation_1.CSV_TEMPLATE };
    }
    async tripDependenciesExist(client, input) {
        const result = await client.query(`SELECT 1 FROM projects p JOIN responsibility_scopes rs ON rs.project_id=p.id
      WHERE p.id=$1 AND p.legal_entity_id=$2 AND p.region_id=$3 AND rs.id=$4
      AND EXISTS(SELECT 1 FROM vehicles v JOIN trips vt ON vt.vehicle_id=v.id WHERE v.id=$5
        AND vt.legal_entity_id=p.legal_entity_id AND vt.region_id=p.region_id AND vt.project_id=p.id AND vt.responsibility_scope_id=rs.id)
      AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM users u JOIN access_grants g ON g.user_id=u.id
        WHERE u.id=$6 AND u.role='driver' AND u.active AND u.approved
        AND g.project_id=p.id AND g.legal_entity_id=p.legal_entity_id AND g.region_id=p.region_id AND g.responsibility_scope_id=rs.id))`, [input.scope.projectId, input.scope.legalEntityId, input.scope.regionId, input.scope.responsibilityScopeId, input.vehicleId, input.driverId ?? null]);
        return result.rowCount === 1;
    }
    async referenceExists(client, reference) {
        return (await client.query("SELECT 1 FROM trips WHERE reference=$1", [reference])).rowCount === 1;
    }
    async insertTrip(client, id, input) {
        const result = await client.query(`INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(reference) DO NOTHING RETURNING id`, [id, input.reference, input.businessDate, input.scope.projectId, input.scope.regionId, input.scope.legalEntityId, input.scope.responsibilityScopeId, input.vehicleId, input.routeSummary]);
        if (result.rowCount !== 1)
            return false;
        if (input.driverId)
            await client.query("INSERT INTO trip_assignments(trip_id,user_id) VALUES($1,$2)", [id, input.driverId]);
        const stops = input.routeSummary.split("→").map((stop) => stop.trim());
        for (const [index, label] of stops.entries())
            await client.query("INSERT INTO trip_stops(trip_id,sequence,label) VALUES($1,$2,$3)", [id, index + 1, label]);
        return true;
    }
    async attendance(client, tripId) {
        return (await client.query(`SELECT a.id,a.actor_id,u.display_name AS actor_name,a.kind,a.occurred_at,a.received_at,a.channel
      FROM workflow_attendance a JOIN users u ON u.id=a.actor_id
      WHERE a.trip_id=$1 ORDER BY a.occurred_at,a.id`, [tripId])).rows;
    }
    async insertAttendance(client, id, tripId, actor, kind, occurredAt) {
        await client.query("INSERT INTO workflow_attendance(id,trip_id,actor_id,kind,occurred_at,channel) VALUES($1,$2,$3,$4,$5,$6)", [id, tripId, actor.id, kind, occurredAt, actor.channel]);
    }
    async documents(client, tripId) {
        return (await client.query("SELECT * FROM workflow_current_documents WHERE trip_id=$1 ORDER BY kind", [tripId])).rows;
    }
    async facts(client, tripId) {
        return (await client.query("SELECT * FROM workflow_current_facts WHERE trip_id=$1", [tripId])).rows[0];
    }
    async entityTrip(client, entity, id) {
        const query = entity === "document" ? "SELECT trip_id FROM workflow_documents WHERE id=$1" : "SELECT trip_id FROM workflow_facts WHERE id=$1";
        return (await client.query(query, [id])).rows[0]?.trip_id;
    }
    async documentBytes(client, id) {
        return (await client.query("SELECT content,mime_type,filename,sha256 FROM workflow_documents WHERE id=$1", [id])).rows[0];
    }
    async confirmed(client, tripId) {
        return (await client.query(`SELECT 1 FROM finance_registry_rows rr JOIN finance_registries r ON r.id=rr.registry_id
      WHERE rr.trip_id=$1 AND r.status='confirmed' LIMIT 1`, [tripId])).rowCount === 1;
    }
    async insertDocument(client, input) {
        await client.query(`INSERT INTO workflow_documents(id,trip_id,kind,revision,filename,mime_type,content,byte_size,sha256,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [input.id, input.tripId, input.kind, input.revision, input.filename, input.mimeType, input.bytes, input.bytes.length, input.sha256, input.actorId]);
    }
    async insertFacts(client, input) {
        await client.query(`INSERT INTO workflow_facts(id,trip_id,revision,minutes,stops,kilometers_hundredths,waiting_minutes,submitted_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [input.id, input.tripId, input.revision, input.minutes, input.stops, input.kilometersHundredths, input.waitingMinutes, input.actorId]);
    }
    async insertReview(client, entity, input) {
        const query = entity === "document" ? "INSERT INTO workflow_document_reviews(id,document_id,decision,reason,reviewed_by) VALUES($1,$2,$3,$4,$5)" : "INSERT INTO workflow_fact_reviews(id,facts_id,decision,reason,reviewed_by) VALUES($1,$2,$3,$4,$5)";
        await client.query(query, [input.id, input.entityId, input.decision, input.reason, input.actorId]);
    }
};
exports.WorkflowRepository = WorkflowRepository;
exports.WorkflowRepository = WorkflowRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], WorkflowRepository);
//# sourceMappingURL=workflow.repository.js.map