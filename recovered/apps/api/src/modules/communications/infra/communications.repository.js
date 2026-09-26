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
exports.CommunicationsRepository = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../../platform/database.service");
const scopeColumns = (alias) => `${alias}.legal_entity_id AS "legalEntityId",${alias}.region_id AS "regionId",${alias}.project_id AS "projectId",${alias}.responsibility_scope_id AS "responsibilityScopeId"`;
const scopeValues = (scope) => [scope.legalEntityId, scope.regionId, scope.projectId, scope.responsibilityScopeId];
const scopeMatch = (left, right) => `${left}.legal_entity_id=${right}.legal_entity_id AND ${left}.region_id=${right}.region_id AND ${left}.project_id=${right}.project_id AND ${left}.responsibility_scope_id=${right}.responsibility_scope_id`;
const scopePredicate = (alias, first) => `${alias}.legal_entity_id=$${first} AND ${alias}.region_id=$${first + 1} AND ${alias}.project_id=$${first + 2} AND ${alias}.responsibility_scope_id=$${first + 3}`;
const ticketColumns = `t.id,t.reference,t.department,t.original_department AS "originalDepartment",t.kind,t.subject,t.status,t.requester_id AS "requesterId",u.display_name AS "requesterName",t.assignee_id AS "assigneeId",a.display_name AS "assigneeName",t.created_at AS "createdAt",t.updated_at AS "updatedAt",t.version,${scopeColumns("t")},
  (u.role='driver' OR EXISTS(SELECT 1 FROM communications_driver_requests dr WHERE dr.ticket_id=t.id)) AS "applicationOnly",
  (SELECT CASE WHEN count(*)=0 THEN NULL WHEN bool_or(d.status='failed') THEN 'failed' WHEN bool_or(d.status='pending') THEN 'pending' ELSE 'sent' END FROM telegram_deliveries d
    WHERE d.message_id=(SELECT m.id FROM communications_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)) AS "lastDeliveryStatus"`;
const memberMatch = `m.user_id=$1 AND m.enabled AND m.department=t.department AND ${scopeMatch("m", "t")}`;
const grantMatch = `${scopeMatch("g", "t")} AND g.user_id=$1`;
const memberSensitive = `g.personal_data_visible AND ((t.department<>'accounting' AND t.original_department<>'accounting') OR g.finance_visible)`;
let CommunicationsRepository = class CommunicationsRepository {
    database;
    constructor(database) {
        this.database = database;
    }
    async ticket(client, id, lock = false) {
        return (await client.query(`SELECT ${ticketColumns} FROM communications_tickets t JOIN users u ON u.id=t.requester_id LEFT JOIN users a ON a.id=t.assignee_id WHERE t.id=$1 ${lock ? "FOR UPDATE OF t" : ""}`, [id])).rows[0];
    }
    async assigneeId(client, id) {
        return (await client.query("SELECT assignee_id FROM communications_tickets WHERE id=$1", [id])).rows[0]?.assignee_id;
    }
    async history(client, ticketId) {
        const rows = (await client.query(`SELECT h.action,jsonb_build_object('id',h.actor_id,'name',u.display_name) AS actor,h.department,h.reason,h.version,h.occurred_at AS "occurredAt"
      FROM (SELECT * FROM communications_actions WHERE ticket_id=$1 ORDER BY version DESC LIMIT 100) h JOIN users u ON u.id=h.actor_id ORDER BY h.version`, [ticketId])).rows;
        return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
    }
    async member(client, actorId, department, scope) {
        return (await client.query(`SELECT 1 FROM communications_memberships m WHERE m.user_id=$1 AND m.department=$2 AND m.enabled AND ${scopePredicate("m", 3)}`, [actorId, department, ...scopeValues(scope)])).rowCount === 1;
    }
    async scopes(client, actorId) {
        return (await client.query(`SELECT ${scopeColumns("g")},concat(r.name,' / ',p.name,' / ',rs.name,' / ',le.name) AS label FROM access_grants g
      JOIN regions r ON r.id=g.region_id JOIN projects p ON p.id=g.project_id JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id JOIN legal_entities le ON le.id=g.legal_entity_id
      WHERE g.user_id=$1 ORDER BY r.name,p.name,rs.name,le.name`, [actorId])).rows;
    }
    async memberships(client, actor) {
        if (["driver", "external_recruiter"].includes(actor.role))
            return [];
        const rows = (await client.query(`SELECT m.department,${scopeColumns("m")} FROM communications_memberships m JOIN access_grants g ON g.user_id=m.user_id AND ${scopeMatch("g", "m")}
      WHERE m.user_id=$1 AND m.enabled AND g.personal_data_visible AND (m.department<>'accounting' OR g.finance_visible) ORDER BY m.department,m.legal_entity_id,m.region_id,m.project_id,m.responsibility_scope_id`, [actor.id])).rows;
        return rows.map(({ department, ...scope }) => ({ department, scope }));
    }
    async list(client, actor, view, cursor) {
        return (await client.query(`SELECT ${ticketColumns} FROM communications_tickets t JOIN users u ON u.id=t.requester_id LEFT JOIN users a ON a.id=t.assignee_id
      WHERE EXISTS(SELECT 1 FROM access_grants g WHERE ${grantMatch} ${view === "department" ? `AND ${memberSensitive}` : ""})
      AND ${view === "mine" ? "t.requester_id=$1" : `EXISTS(SELECT 1 FROM communications_memberships m WHERE ${memberMatch})`}
      AND ($2::timestamptz IS NULL OR (t.created_at,t.id)<($2::timestamptz,$3::uuid)) ORDER BY t.created_at DESC,t.id DESC LIMIT 51`, [actor.id, cursor?.createdAt ?? null, cursor?.id ?? null])).rows;
    }
    async driverRequests(client, actor, scopeId, cursor) {
        return (await client.query(`SELECT ${ticketColumns} FROM communications_tickets t
          JOIN users u ON u.id=t.requester_id LEFT JOIN users a ON a.id=t.assignee_id
          WHERE t.responsibility_scope_id=$2 AND (u.role='driver' OR EXISTS(SELECT 1 FROM communications_driver_requests dr WHERE dr.ticket_id=t.id))
          AND EXISTS(SELECT 1 FROM access_grants g WHERE ${grantMatch} AND ${memberSensitive})
          AND ($3::boolean OR EXISTS(SELECT 1 FROM communications_memberships m WHERE ${memberMatch}))
          AND ($4::timestamptz IS NULL OR (t.created_at,t.id)<($4::timestamptz,$5::uuid))
          ORDER BY t.created_at DESC,t.id DESC LIMIT 51`, [actor.id, scopeId, actor.role === 'access_admin' && !actor.impersonation,
          cursor?.createdAt ?? null, cursor?.id ?? null])).rows;
    }
    async messages(client, ticketId, before) {
        const rows = (await client.query(`SELECT m.id,m.content AS text,m.sender_id AS "authorId",u.display_name AS "authorName",
          m.created_at AS "createdAt",m.origin FROM communications_messages m JOIN users u ON u.id=m.sender_id
          WHERE m.ticket_id=$1 AND ($2::timestamptz IS NULL OR (m.created_at,m.id)<($2::timestamptz,$3::uuid))
          ORDER BY m.created_at DESC,m.id DESC LIMIT 101`, [ticketId, before?.createdAt ?? null, before?.id ?? null])).rows;
        return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
    }
    async insertMessage(client, ticket, actor, text) {
        const { randomUUID, createHash } = require('node:crypto');
        const message = (await client.query(`INSERT INTO communications_messages(id,ticket_id,sender_id,department,content,sha256,origin)
          VALUES($1,$2,$3,$4,$5,$6,'application') RETURNING id,content AS text,sender_id AS "authorId",created_at AS "createdAt",origin`,
          [randomUUID(), ticket.id, actor.id, ticket.department, text, createHash('sha256').update(text).digest('hex')])).rows[0];
        return { ...message, authorName: actor.displayName, createdAt: message.createdAt.toISOString() };
    }
    async insertTicket(client, id, reference, actorId, input) {
        await client.query(`INSERT INTO communications_tickets(id,reference,department,original_department,kind,subject,requester_id,legal_entity_id,region_id,project_id,responsibility_scope_id)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, reference, input.department, input.kind, input.subject, actorId, ...scopeValues(input.scope)]);
    }
    async updateTicket(client, ticket, status, department, assigneeId) {
        const result = await client.query(`UPDATE communications_tickets SET status=$2,department=$3,assignee_id=$4,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$5`, [ticket.id, status, department, assigneeId, ticket.version]);
        return result.rowCount === 1;
    }
    async action(client, id, ticketId, actorId, action, version, department, reason) {
        await client.query("INSERT INTO communications_actions(id,ticket_id,actor_id,action,version,department,reason) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, ticketId, actorId, action, version, department, reason]);
    }
    async cached(client, actorId, key) {
        return (await client.query("SELECT operation,request_hash,response FROM communications_requests WHERE actor_id=$1 AND idempotency_key=$2", [actorId, key])).rows[0];
    }
    async saveResponse(client, actorId, key, operation, hash, response) {
        await client.query("INSERT INTO communications_requests(actor_id,idempotency_key,operation,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)", [actorId, key, operation, hash, JSON.stringify(response)]);
    }
    async setMembership(client, userId, department, scope, enabled, actorId) {
        await client.query(`INSERT INTO communications_memberships(user_id,department,legal_entity_id,region_id,project_id,responsibility_scope_id,enabled,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(user_id,department,legal_entity_id,region_id,project_id,responsibility_scope_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=clock_timestamp()`, [userId, department, ...scopeValues(scope), enabled, actorId]);
    }
    async saveLink(client, hash, ticketId, actorId, expiresAt) {
        await client.query("INSERT INTO communications_telegram_links(token_hash,ticket_id,actor_id,expires_at) VALUES($1,$2,$3,$4)", [hash, ticketId, actorId, expiresAt]);
    }
    async linkTicketId(client, hash, actorId) {
        return (await client.query("SELECT ticket_id FROM communications_telegram_links WHERE token_hash=$1 AND actor_id=$2 AND expires_at>clock_timestamp()", [hash, actorId])).rows[0]?.ticket_id;
    }
    async recipientIds(client, ticket, sender) {
        if (sender.id !== ticket.requesterId)
            return [ticket.requesterId];
        const rows = (await client.query(`SELECT m.user_id FROM communications_memberships m JOIN users u ON u.id=m.user_id
      JOIN access_grants g ON g.user_id=m.user_id AND ${scopeMatch("g", "m")}
      WHERE m.department=$1 AND ${scopePredicate("m", 2)} AND m.enabled AND u.active AND u.approved AND u.role NOT IN ('driver','external_recruiter') AND m.user_id<>$6
      AND g.personal_data_visible AND ($7::boolean=false OR g.finance_visible) ORDER BY m.user_id`, [ticket.department, ...scopeValues(ticket), sender.id, ticket.department === "accounting" || ticket.originalDepartment === "accounting"])).rows.map((row) => row.user_id);
        return ticket.assigneeId && rows.includes(ticket.assigneeId) ? [ticket.assigneeId] : rows;
    }
};
exports.CommunicationsRepository = CommunicationsRepository;
exports.CommunicationsRepository = CommunicationsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], CommunicationsRepository);
//# sourceMappingURL=communications.repository.js.map
