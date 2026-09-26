"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeRepository = void 0;
const common_1 = require("@nestjs/common");
// Every target grant must fit one complete administrator grant, including both flags.
const contains = `a.legal_entity_id=g.legal_entity_id AND a.region_id=g.region_id
  AND a.project_id=g.project_id AND a.responsibility_scope_id=g.responsibility_scope_id
  AND (NOT g.finance_visible OR a.finance_visible)
  AND (NOT g.personal_data_visible OR a.personal_data_visible)`;
const scopeJson = `jsonb_build_object('id',s.id,
  'legalEntity',jsonb_build_object('id',l.id,'name',l.name),
  'region',jsonb_build_object('id',r.id,'name',r.name),
  'project',jsonb_build_object('id',p.id,'name',p.name),
  'responsibilityScope',jsonb_build_object('id',s.id,'name',s.name),
  'inspectionPhotoDelete',g.inspection_photo_delete,
  'personalDataVisible',g.personal_data_visible)`;
let EmployeeRepository = class EmployeeRepository {
    async scopes(client, userId) {
        const result = await client.query(`SELECT ${scopeJson} AS scope
      FROM access_grants g JOIN legal_entities l ON l.id=g.legal_entity_id
      JOIN regions r ON r.id=g.region_id JOIN projects p ON p.id=g.project_id
      JOIN responsibility_scopes s ON s.id=g.responsibility_scope_id
      WHERE g.user_id=$1 ORDER BY l.name,r.name,p.name,s.name,s.id`, [userId]);
        return result.rows.map(row => row.scope);
    }
    async list(client, administratorId, filter) {
        const result = await client.query(`
      WITH manageable AS (
        SELECT u.*,COALESCE(d.source_kind,'existing') AS source_kind,
          CASE WHEN d.employee_number IS NOT NULL THEN 'СОТ-'||lpad(d.employee_number::text,greatest(6,length(d.employee_number::text)),'0')
            ELSE 'УЧ-'||right(replace(u.id::text,'-',''),12) END AS employee_number,
          (u.id=$1 OR d.source_kind IN ('demo_seed','demo_manual') OR NOT EXISTS (
            SELECT FROM access_grants g WHERE g.user_id=u.id AND NOT EXISTS (
              SELECT FROM access_grants a WHERE a.user_id=$1 AND ${contains} AND a.personal_data_visible
            ))) IS TRUE AS name_visible,
          EXISTS(SELECT FROM channel_identities c WHERE c.user_id=u.id AND c.provider='telegram') AS telegram_linked,
          EXISTS(SELECT FROM invitations i WHERE i.user_id=u.id AND i.consumed_at IS NULL
            AND i.expires_at>clock_timestamp()) AS invitation_pending,
          EXISTS(SELECT FROM channel_identities c WHERE c.user_id=u.id AND c.provider='max') AS max_linked,
          EXISTS(SELECT FROM max_invitations i WHERE i.user_id=u.id AND i.consumed_at IS NULL
            AND i.expires_at>clock_timestamp()) AS max_invitation_pending,
          (SELECT c.phone FROM phone_credentials c WHERE c.user_id=u.id) AS phone_login_number,
          (u.id=$1 OR NOT EXISTS (
            SELECT FROM access_grants g WHERE g.user_id=u.id AND NOT EXISTS (
              SELECT FROM access_grants a WHERE a.user_id=$1 AND ${contains} AND a.personal_data_visible
            ))) IS TRUE AS phone_visible
        FROM users u LEFT JOIN employee_directory d ON d.user_id=u.id
        WHERE EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id)
          AND NOT EXISTS(SELECT FROM access_grants g WHERE g.user_id=u.id AND NOT EXISTS (
            SELECT FROM access_grants a WHERE a.user_id=$1 AND ${contains}
          ))
      ), visible AS (
        SELECT *,CASE WHEN name_visible THEN display_name ELSE 'Сотрудник '||employee_number END AS visible_name
        FROM manageable
      )
      SELECT id,employee_number AS "employeeNumber",visible_name AS "displayName",
        NOT name_visible AS "displayNameMasked",role,source_kind AS "sourceKind",active,approved,
        adaptation_required AS "adaptationRequired",adaptation_scope_id AS "adaptationScopeId",
        adaptation_completed_at AS "adaptationCompletedAt",
        telegram_linked AS "telegramLinked",invitation_pending AS "invitationPending",
        active AND approved AND NOT telegram_linked AS "canInvite",
        max_linked AS "maxLinked",max_invitation_pending AS "maxInvitationPending",
        active AND approved AND NOT max_linked AS "canInviteMax",
        phone_login_number IS NOT NULL AS "phoneLoginEnabled",
        CASE WHEN phone_visible AND phone_login_number IS NOT NULL
            THEN '+'||repeat('*',greatest(length(phone_login_number)-5,0))||right(phone_login_number,4)
            ELSE NULL END AS "phoneMasked",
        active AND approved AS "canIssuePassword",
        active AND approved AND id<>$1 AS "canImpersonate",
        active AND id<>$1 AS "canRevoke",
        (SELECT jsonb_agg(${scopeJson} || jsonb_build_object('canManageInspectionPhotoDelete',
            v.role='mechanic' AND v.active AND v.approved AND EXISTS (
              SELECT FROM access_grants a WHERE a.user_id=$1 AND ${contains} AND a.personal_data_visible
            )) ORDER BY l.name,r.name,p.name,s.name,s.id)
          FROM access_grants g JOIN legal_entities l ON l.id=g.legal_entity_id
          JOIN regions r ON r.id=g.region_id JOIN projects p ON p.id=g.project_id
          JOIN responsibility_scopes s ON s.id=g.responsibility_scope_id WHERE g.user_id=v.id) AS scopes
      FROM visible v
      WHERE ($2::text IS NULL OR position(lower($2) IN lower(visible_name||' '||employee_number))>0)
        AND ($3::text IS NULL OR role=$3)
        AND ($4::text='all' OR active=($4='active'))
        AND ($5::uuid IS NULL OR id>$5::uuid)
        AND ($7::uuid IS NULL OR id=$7::uuid)
      ORDER BY id LIMIT $6`, [administratorId, filter.search || null, filter.role || null,
            filter.status ?? "all", filter.cursor || null, filter.limit, filter.targetId || null]);
        return result.rows;
    }
    async creation(client, actorId, key) {
        const result = await client.query(`SELECT payload_hash,user_id FROM employee_creation_requests WHERE actor_id=$1 AND idempotency_key=$2`, [actorId, key]);
        return result.rows[0];
    }
};
exports.EmployeeRepository = EmployeeRepository;
exports.EmployeeRepository = EmployeeRepository = __decorate([
    (0, common_1.Injectable)()
], EmployeeRepository);
//# sourceMappingURL=employee.repository.js.map
