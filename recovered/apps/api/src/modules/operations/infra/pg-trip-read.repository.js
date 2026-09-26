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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgTripReadRepository = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../../platform/database.service");
const trip_read_repository_1 = require("../application/trip-read.repository");
const TRIP_COLUMNS = `t.id, t.reference, to_char(t.business_date, 'YYYY-MM-DD') AS business_date,
  t.status, t.project_id, p.name AS project_name, t.region_id, r.name AS region_name,
  t.legal_entity_id, le.name AS legal_entity_name,
  t.responsibility_scope_id, rs.name AS responsibility_scope_name,
  v.label AS vehicle_label, v.body_type, v.capacity_kg, v.fleet_type,
  t.route_summary, t.version`;
const TRIP_RELATIONS = `FROM trips t
  JOIN projects p ON p.id = t.project_id
  JOIN regions r ON r.id = t.region_id
  JOIN legal_entities le ON le.id = t.legal_entity_id
  JOIN responsibility_scopes rs ON rs.id = t.responsibility_scope_id
  JOIN vehicles v ON v.id = t.vehicle_id`;
/** SQL predicates are applied before ordering, pagination, and detail projection. */
function scopedPredicate(access, values) {
    if (access.scopeTuples.length === 0)
        return "FALSE";
    const scopes = access.scopeTuples.map((scope) => {
        const first = values.length + 1;
        values.push(scope.legalEntityId, scope.regionId, scope.projectId, scope.responsibilityScopeId);
        return `(t.legal_entity_id = $${first}::uuid AND t.region_id = $${first + 1}::uuid
      AND t.project_id = $${first + 2}::uuid AND t.responsibility_scope_id = $${first + 3}::uuid)`;
    });
    let predicate = `(${scopes.join(" OR ")})`;
    const principalIndex = values.length + 1;
    values.push(access.principal.id, access.principal.sessionId, access.principal.authVersion, access.principal.role);
    // Close the gap between guard authentication and this statement. A committed access
    // revocation, grant removal or role change must also constrain an already prepared read.
    predicate += ` AND EXISTS (
    SELECT 1 FROM sessions current_session
    JOIN users current_user_record ON current_user_record.id = current_session.user_id
    JOIN access_grants current_grant ON current_grant.user_id = current_user_record.id
    WHERE current_user_record.id = $${principalIndex}::uuid
      AND current_session.id = $${principalIndex + 1}::uuid
      AND current_user_record.auth_version = $${principalIndex + 2}::integer
      AND current_user_record.role = $${principalIndex + 3}::text
      AND current_user_record.active AND current_user_record.approved
      AND current_session.auth_version = current_user_record.auth_version
      AND current_session.revoked_at IS NULL AND current_session.expires_at > clock_timestamp()
      AND current_grant.legal_entity_id = t.legal_entity_id
      AND current_grant.region_id = t.region_id
      AND current_grant.project_id = t.project_id
      AND current_grant.responsibility_scope_id = t.responsibility_scope_id
  )`;
    if (access.assignmentUserId !== null) {
        values.push(access.assignmentUserId);
        predicate += ` AND EXISTS (SELECT 1 FROM trip_assignments ta
      WHERE ta.trip_id = t.id AND ta.user_id = $${values.length}::uuid AND ta.active = TRUE)`;
    }
    return predicate;
}
/** Progress and current visibility share the trip authorization statement snapshot. */
function driverProgressColumn(access, values) {
    values.push(access.principal.id, access.principal.role === "driver");
    const principal = `$${values.length - 1}::uuid`;
    const driverOnly = `$${values.length}::boolean`;
    const visibleName = `(${driverOnly} OR EXISTS (
    SELECT 1 FROM access_grants personal_grant
    WHERE personal_grant.user_id = ${principal} AND personal_grant.personal_data_visible
      AND personal_grant.legal_entity_id = t.legal_entity_id
      AND personal_grant.region_id = t.region_id
      AND personal_grant.project_id = t.project_id
      AND personal_grant.responsibility_scope_id = t.responsibility_scope_id
  ))`;
    return `COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'driver', jsonb_build_object('id', progress.user_id, 'name',
        CASE WHEN ${visibleName} THEN progress.display_name
          ELSE 'Водитель ' || left(progress.user_id::text,8) END),
      'acceptedAt', to_char(progress.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'startedAt', to_char(progress.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'completedAt', to_char(progress.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY progress.user_id)
    FROM (
      SELECT participants.user_id, u.display_name,
        max(a.occurred_at) FILTER (WHERE a.kind='accept') AS accepted_at,
        max(a.occurred_at) FILTER (WHERE a.kind='check_in') AS started_at,
        max(a.occurred_at) FILTER (WHERE a.kind='check_out') AS completed_at
      FROM (
        SELECT assignment.user_id FROM trip_assignments assignment WHERE assignment.trip_id=t.id AND assignment.active
        UNION
        SELECT event.actor_id FROM workflow_attendance event WHERE event.trip_id=t.id
      ) participants
      JOIN users u ON u.id=participants.user_id
      LEFT JOIN workflow_attendance a ON a.trip_id=t.id AND a.actor_id=participants.user_id
      WHERE NOT ${driverOnly} OR participants.user_id=${principal}
      GROUP BY participants.user_id,u.display_name
    ) progress
  ), '[]'::jsonb) AS driver_progress`;
}
function toSummary(row) {
    // Explicit projection prevents accidental exposure when database columns grow.
    return {
        id: row.id,
        reference: row.reference,
        businessDate: row.business_date,
        status: row.status,
        project: { id: row.project_id, name: row.project_name },
        region: { id: row.region_id, name: row.region_name },
        legalEntity: { id: row.legal_entity_id, name: row.legal_entity_name },
        responsibilityScope: {
            id: row.responsibility_scope_id,
            name: row.responsibility_scope_name,
        },
        vehicle: {
            label: row.vehicle_label,
            bodyType: row.body_type,
            capacityKg: row.capacity_kg,
            fleetType: row.fleet_type,
        },
        routeSummary: row.route_summary,
        driverProgress: row.driver_progress,
    };
}
let PgTripReadRepository = class PgTripReadRepository extends trip_read_repository_1.TripReadRepository {
    database;
    constructor(database) {
        super();
        this.database = database;
    }
    async findPage(access, page) {
        const values = [];
        let predicate = scopedPredicate(access, values);
        const progressColumn = driverProgressColumn(access, values);
        if (page.after) {
            values.push(page.after.businessDate, page.after.id);
            predicate += ` AND (t.business_date, t.id) > ($${values.length - 1}::date, $${values.length}::uuid)`;
        }
        values.push(page.limit + 1);
        const result = await this.database.pool.query(`SELECT ${TRIP_COLUMNS}, ${progressColumn} ${TRIP_RELATIONS}
       WHERE ${predicate} ORDER BY t.business_date ASC, t.id ASC LIMIT $${values.length}::integer`, values);
        return result.rows.map(toSummary);
    }
    async findById(access, id) {
        const values = [];
        const predicate = scopedPredicate(access, values);
        const progressColumn = driverProgressColumn(access, values);
        values.push(id);
        // Stops and the authorization predicate share one PostgreSQL statement snapshot.
        const result = await this.database.pool.query(`SELECT ${TRIP_COLUMNS}, ${progressColumn}, COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sequence', ts.sequence,
          'label', ts.label,
          'plannedArrivalAt', CASE WHEN ts.planned_arrival_at IS NULL THEN NULL ELSE
            to_char(ts.planned_arrival_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
        ) ORDER BY ts.sequence) FROM trip_stops ts WHERE ts.trip_id = t.id
       ), '[]'::jsonb) AS stops
       ${TRIP_RELATIONS} WHERE ${predicate} AND t.id = $${values.length}::uuid`, values);
        const row = result.rows[0];
        return row
            ? { ...toSummary(row), stops: row.stops ?? [], version: row.version }
            : null;
    }
};
exports.PgTripReadRepository = PgTripReadRepository;
exports.PgTripReadRepository = PgTripReadRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], PgTripReadRepository);
//# sourceMappingURL=pg-trip-read.repository.js.map