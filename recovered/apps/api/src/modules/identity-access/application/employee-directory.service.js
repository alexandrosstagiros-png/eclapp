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
exports.EmployeeDirectoryService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const config_1 = require("../../../platform/config");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../infrastructure/identity.repository");
const employee_repository_1 = require("../infrastructure/employee.repository");
const auth_service_1 = require("./auth.service");
const { mayManageAccess } = require("../domain/access-policy");
const roles = ["driver", "dispatcher", "manager", "recruiter", "tender_specialist", "document_specialist", "mechanic"];
const labels = { driver: "Тестовый водитель", dispatcher: "Тестовый диспетчер", manager: "Тестовый менеджер", recruiter: "Тестовый рекрутер",
    tender_specialist: "Тестовый тендерный специалист", document_specialist: "Тестовый документовед", mechanic: "Тестовый механик" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plannerRoles = ["dispatcher", "manager"];
const maximumPlanningScopes = 100;
function planningVersion(employeeId, grants) {
    // Include every loaded dimension/permission, including finance and photo deletion.
    // Updating the editor must never silently overwrite a concurrently changed grant.
    const state = grants.map(grant => Object.fromEntries(Object.keys(grant).sort().map(key => [key, grant[key]])))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify({ employeeId, grants: state })).digest("hex");
}
function planningScope(scope, grants) {
    const { id, legalEntity, region, project, responsibilityScope } = scope;
    const grant = grants.find(row => row.responsibilityScopeId === id && row.legalEntityId === legalEntity.id
        && row.regionId === region.id && row.projectId === project.id);
    return { id, legalEntity, region, project, responsibilityScope, personalDataVisible: Boolean(grant?.personalDataVisible) };
}
function planningInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).some(key => !["version", "grants"].includes(key))
        || typeof input.version !== "string" || !/^[0-9a-f]{64}$/.test(input.version)
        || !Array.isArray(input.grants) || input.grants.length < 1 || input.grants.length > maximumPlanningScopes)
        throw new common_1.BadRequestException("Укажите текущую версию и от 1 до 100 областей работы.");
    const seen = new Set();
    return input.grants.map(grant => {
        if (!grant || typeof grant !== "object" || Array.isArray(grant)
            || Object.keys(grant).some(key => !["scopeId", "personalDataVisible"].includes(key))
            || typeof grant.scopeId !== "string" || !uuid.test(grant.scopeId) || typeof grant.personalDataVisible !== "boolean")
            throw new common_1.BadRequestException("Укажите область работы и разрешение на персональные данные.");
        const scopeId = grant.scopeId.toLowerCase();
        if (seen.has(scopeId)) throw new common_1.BadRequestException("Области работы не должны повторяться.");
        seen.add(scopeId);
        return { scopeId, personalDataVisible: grant.personalDataVisible };
    });
}
function requiredAdaptation(input, role) {
    if (input.adaptationRequired !== undefined && typeof input.adaptationRequired !== "boolean")
        throw new common_1.BadRequestException("Параметр адаптации должен быть логическим значением.");
    const required = input.adaptationRequired === true;
    if (required && (role === "driver" || role === "external_recruiter"))
        throw new common_1.BadRequestException("Адаптация недоступна для водителей и внешних рекрутеров.");
    return required;
}
let EmployeeDirectoryService = class EmployeeDirectoryService {
    database;
    config;
    identity;
    employees;
    auth;
    audit;
    constructor(database, config, identity, employees, auth, audit) {
        this.database = database;
        this.config = config;
        this.identity = identity;
        this.employees = employees;
        this.auth = auth;
        this.audit = audit;
    }
    async currentAdministrator(client, actor) {
        await this.identity.lockUsers(client, [actor.id]);
        const current = await this.auth.requireCurrentActor(client, actor);
        if (current.impersonation || current.role !== "access_admin" || current.grants.length === 0)
            throw new common_1.ForbiddenException("Employee administration is outside the permitted scope");
        return current;
    }
    async options(actor) {
        return this.database.transaction(async (client) => {
            const current = await this.currentAdministrator(client, actor);
            const enabled = this.config.value.demoEmployeeCreationEnabled;
            const scopes = await this.employees.scopes(client, current.id);
            const recruiterScopes = scopes.filter(scope => current.grants.some(grant => grant.responsibilityScopeId === scope.id && grant.personalDataVisible));
            const plannerScopes = scopes.map(scope => planningScope(scope, current.grants));
            return { demoCreationEnabled: enabled, tenderCreationEnabled: true, recruiterCreationEnabled: recruiterScopes.length > 0,
                recruiterScopes, plannerCreationEnabled: plannerScopes.length > 0, plannerRoles: [...plannerRoles], plannerScopes,
                roles: enabled ? [...roles] : [], scopes, oneCStatus: "not_connected" };
        });
    }
    async list(actor, query) {
        return this.database.transaction(async (client) => {
            const current = await this.currentAdministrator(client, actor);
            const rows = await this.employees.list(client, current.id, { ...query, search: query.search?.trim(), limit: query.limit + 1 });
            const more = rows.length > query.limit;
            const items = rows.slice(0, query.limit);
            return { items, nextCursor: more ? items[items.length - 1].id : null };
        });
    }
    async createPlanner(actor, input, correlationId) {
        const displayName = typeof input?.displayName === "string" ? input.displayName.trim() : "";
        if (!input || typeof input !== "object" || Array.isArray(input)
            || Object.keys(input).some(key => !["displayName", "role", "scopeId", "personalDataVisible", "idempotencyKey"].includes(key))
            || !displayName || displayName.length > 160 || /[\u0000-\u001f\u007f]/.test(displayName)
            || !plannerRoles.includes(input.role) || typeof input.scopeId !== "string" || !uuid.test(input.scopeId)
            || typeof input.idempotencyKey !== "string" || !uuid.test(input.idempotencyKey)
            || typeof input.personalDataVisible !== "boolean")
            throw new common_1.BadRequestException("Укажите имя, роль, область работы и разрешение на персональные данные.");
        const scopeId = input.scopeId.toLowerCase(), key = input.idempotencyKey.toLowerCase();
        const payloadHash = (0, node_crypto_1.createHash)("sha256").update(JSON.stringify({
            kind: "planner", role: input.role, scopeId, displayName, personalDataVisible: input.personalDataVisible, sourceKind: "internal_manual"
        })).digest("hex");
        return this.database.transaction(async client => {
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId);
            if (!grant || (input.personalDataVisible && !grant.personalDataVisible))
                throw new common_1.ForbiddenException("Область работы или доступ к персональным данным вне ваших полномочий.");
            const previous = await this.employees.creation(client, current.id, key);
            if (previous) {
                if (previous.payload_hash !== payloadHash)
                    throw new common_1.ConflictException("Параметры создаваемой учётной записи изменились.");
                return this.summary(client, current.id, previous.user_id);
            }
            const id = (0, node_crypto_1.randomUUID)();
            await client.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)",
                [id, displayName, input.role]);
            await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,$6)`,
                [id, grant.legalEntityId, grant.regionId, grant.projectId, scopeId, input.personalDataVisible]);
            await client.query(`INSERT INTO employee_directory(user_id,source_kind,created_by,created_at)
                VALUES($1,'internal_manual',$2,clock_timestamp())`, [id, current.id]);
            await client.query(`INSERT INTO employee_creation_requests(actor_id,idempotency_key,payload_hash,user_id)
                VALUES($1,$2,$3,$4)`, [current.id, key, payloadHash, id]);
            await this.audit.append(client, { actorId: current.id, action: "access.planner_created", entityType: "user",
                entityId: id, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: scopeId },
                metadata: { role: input.role, sourceKind: "internal_manual", financeVisible: false, personalDataVisible: input.personalDataVisible } });
            return this.summary(client, current.id, id);
        });
    }
    async planningContext(client, actor, employeeId) {
        if (typeof employeeId !== "string" || !uuid.test(employeeId))
            throw new common_1.BadRequestException("Укажите сотрудника.");
        const targetId = employeeId.toLowerCase();
        if (actor.impersonation || targetId === actor.id)
            throw new common_1.ForbiddenException("Управление этим сотрудником недоступно.");
        // Share the same ordered user locks as revocation and every other identity mutation.
        // Read the session and complete target grant set only after these locks are held.
        await this.identity.lockUsers(client, [actor.id, targetId]);
        const current = await this.currentAdministrator(client, actor);
        const target = await this.identity.user(client, targetId);
        const grants = await this.identity.grants(targetId, client);
        if (!target?.active || !target.approved || !plannerRoles.includes(target.role) || !mayManageAccess(current, grants))
            throw new common_1.ForbiddenException("Сотрудник недоступен для настройки областей работы.");
        const scopes = (await this.employees.scopes(client, current.id)).map(scope => planningScope(scope, current.grants));
        return { current, targetId, grants, scopes };
    }
    planningResponse(employeeId, grants, scopes) {
        return { employeeId, version: planningVersion(employeeId, grants),
            grants: grants.map(grant => ({ scopeId: grant.responsibilityScopeId, personalDataVisible: grant.personalDataVisible })), scopes };
    }
    async planningAccess(actor, employeeId) {
        return this.database.transaction(async client => {
            const { targetId, grants, scopes } = await this.planningContext(client, actor, employeeId);
            return this.planningResponse(targetId, grants, scopes);
        });
    }
    async updatePlanningAccess(actor, employeeId, input, correlationId) {
        const requested = planningInput(input);
        return this.database.transaction(async client => {
            const { current, targetId, grants, scopes } = await this.planningContext(client, actor, employeeId);
            if (input.version !== planningVersion(targetId, grants))
                throw new common_1.ConflictException("Права сотрудника уже изменились. Обновите данные и повторите настройку.");
            for (const selected of requested) {
                const allowed = scopes.find(scope => scope.id === selected.scopeId);
                if (!allowed || (selected.personalDataVisible && !allowed.personalDataVisible))
                    throw new common_1.ForbiddenException("Область работы или доступ к персональным данным вне ваших полномочий.");
            }
            const changes = [];
            for (const previous of grants) {
                const selected = requested.find(grant => grant.scopeId === previous.responsibilityScopeId);
                if (!selected) {
                    // Removing a selected area explicitly revokes the complete grant, not only planning.
                    await client.query("DELETE FROM access_grants WHERE user_id=$1 AND responsibility_scope_id=$2", [targetId, previous.responsibilityScopeId]);
                    changes.push({ scope: previous, change: "removed", previous, next: null });
                } else if (selected.personalDataVisible !== previous.personalDataVisible) {
                    // Retain finance, photo deletion and any future independent permission columns.
                    await client.query("UPDATE access_grants SET personal_data_visible=$3 WHERE user_id=$1 AND responsibility_scope_id=$2",
                        [targetId, selected.scopeId, selected.personalDataVisible]);
                    changes.push({ scope: previous, change: "updated", previous, next: { ...previous, personalDataVisible: selected.personalDataVisible } });
                }
            }
            for (const selected of requested) {
                if (grants.some(grant => grant.responsibilityScopeId === selected.scopeId)) continue;
                const allowed = current.grants.find(grant => grant.responsibilityScopeId === selected.scopeId);
                await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                    responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,$6)`,
                    [targetId, allowed.legalEntityId, allowed.regionId, allowed.projectId, selected.scopeId, selected.personalDataVisible]);
                const next = { legalEntityId: allowed.legalEntityId, regionId: allowed.regionId, projectId: allowed.projectId,
                    responsibilityScopeId: selected.scopeId, financeVisible: false, personalDataVisible: selected.personalDataVisible, inspectionPhotoDelete: false };
                changes.push({ scope: next, change: "added", previous: null, next });
            }
            for (const change of changes) {
                const { legalEntityId, regionId, projectId, responsibilityScopeId } = change.scope;
                await this.audit.append(client, { actorId: current.id, action: "access.planning_access_changed", entityType: "user",
                    entityId: targetId, channel: current.channel, correlationId,
                    scope: { legalEntityId, regionId, projectId, responsibilityScopeId },
                    metadata: { change: change.change, previous: change.previous, next: change.next } });
            }
            const refreshed = await this.identity.grants(targetId, client);
            return this.planningResponse(targetId, refreshed, scopes);
        });
    }
    async createDemo(actor, input, correlationId) {
        if (!this.config.value.demoEmployeeCreationEnabled)
            throw new common_1.ForbiddenException("Demo employee creation is disabled");
        if (!roles.includes(input.role) || !uuid.test(input.scopeId) || !uuid.test(input.idempotencyKey))
            throw new common_1.BadRequestException("Invalid demo employee parameters");
        const scopeId = input.scopeId.toLowerCase();
        const key = input.idempotencyKey.toLowerCase();
        const adaptationRequired = requiredAdaptation(input, input.role);
        // Omitted and false preserve the original request hash for existing retries.
        const payloadHash = (0, node_crypto_1.createHash)("sha256").update(JSON.stringify({ role: input.role, scopeId,
            ...(adaptationRequired ? { adaptationRequired: true } : {}) })).digest("hex");
        return this.database.transaction(async (client) => {
            // Serializing on the administrator also makes concurrent retries deterministic.
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId);
            if (!grant)
                throw new common_1.ForbiddenException("Employee scope is outside the permitted scope");
            const previous = await this.employees.creation(client, current.id, key);
            if (previous) {
                if (previous.payload_hash !== payloadHash)
                    throw new common_1.ConflictException("Creation request changed");
                return this.summary(client, current.id, previous.user_id);
            }
            const id = (0, node_crypto_1.randomUUID)();
            const personalDataVisible = input.role === "recruiter" && grant.personalDataVisible;
            await client.query(`INSERT INTO users(id,display_name,role,active,approved,adaptation_required,adaptation_scope_id)
                VALUES($1,$2,$3,true,true,$4,$5)`, [id, labels[input.role], input.role, adaptationRequired, adaptationRequired ? scopeId : null]);
            await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
        responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,$6)`, [id, grant.legalEntityId, grant.regionId, grant.projectId, grant.responsibilityScopeId, personalDataVisible]);
            const profile = await client.query(`INSERT INTO employee_directory
        (user_id,source_kind,created_by,created_at) VALUES($1,'demo_manual',$2,clock_timestamp()) RETURNING employee_number::text`, [id, current.id]);
            await client.query("UPDATE users SET display_name=$2 WHERE id=$1", [id, `${labels[input.role]} ${profile.rows[0].employee_number}`]);
            await client.query(`INSERT INTO employee_creation_requests(actor_id,idempotency_key,payload_hash,user_id)
        VALUES($1,$2,$3,$4)`, [current.id, key, payloadHash, id]);
            await this.audit.append(client, { actorId: current.id, action: "access.demo_user_created", entityType: "user",
                entityId: id, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: grant.responsibilityScopeId },
                metadata: { role: input.role, sourceKind: "demo_manual", active: true, approved: true, financeVisible: false, personalDataVisible,
                    adaptationRequired, adaptationScopeId: adaptationRequired ? scopeId : null } });
            return this.summary(client, current.id, id);
        });
    }
    async createTenderSpecialist(actor, input, correlationId) {
        const adaptationRequired = requiredAdaptation(input, "tender_specialist");
        const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
        if (!displayName || displayName.length > 160 || /[\u0000-\u001f\u007f]/.test(displayName)
            || !uuid.test(input.scopeId) || !uuid.test(input.idempotencyKey))
            throw new common_1.BadRequestException("Укажите имя специалиста и доступную область работы.");
        const scopeId = input.scopeId.toLowerCase(), key = input.idempotencyKey.toLowerCase();
        const payloadHash = (0, node_crypto_1.createHash)("sha256")
            .update(JSON.stringify({ role: "tender_specialist", scopeId, displayName, sourceKind: "internal_manual",
                ...(adaptationRequired ? { adaptationRequired: true } : {}) })).digest("hex");
        return this.database.transaction(async client => {
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId);
            if (!grant) throw new common_1.ForbiddenException("Область работы вне ваших полномочий.");
            const previous = await this.employees.creation(client, current.id, key);
            if (previous) {
                if (previous.payload_hash !== payloadHash)
                    throw new common_1.ConflictException("Параметры создаваемой учётной записи изменились.");
                return this.summary(client, current.id, previous.user_id);
            }
            const id = (0, node_crypto_1.randomUUID)();
            await client.query(`INSERT INTO users(id,display_name,role,active,approved,adaptation_required,adaptation_scope_id)
                VALUES($1,$2,'tender_specialist',true,true,$3,$4)`, [id, displayName, adaptationRequired, adaptationRequired ? scopeId : null]);
            await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,false)`,
                [id, grant.legalEntityId, grant.regionId, grant.projectId, scopeId]);
            await client.query(`INSERT INTO employee_directory(user_id,source_kind,created_by,created_at)
                VALUES($1,'internal_manual',$2,clock_timestamp())`, [id, current.id]);
            await client.query(`INSERT INTO employee_creation_requests(actor_id,idempotency_key,payload_hash,user_id)
                VALUES($1,$2,$3,$4)`, [current.id, key, payloadHash, id]);
            await this.audit.append(client, { actorId: current.id, action: "access.tender_specialist_created", entityType: "user",
                entityId: id, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: scopeId },
                metadata: { role: "tender_specialist", sourceKind: "internal_manual", financeVisible: false, personalDataVisible: false,
                    adaptationRequired, adaptationScopeId: adaptationRequired ? scopeId : null } });
            return this.summary(client, current.id, id);
        });
    }
    async createRecruiter(actor, input, correlationId) {
        const adaptationRequired = requiredAdaptation(input, "recruiter");
        const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
        if (!displayName || displayName.length > 160 || /[\u0000-\u001f\u007f]/.test(displayName)
            || !uuid.test(input.scopeId) || !uuid.test(input.idempotencyKey))
            throw new common_1.BadRequestException("Укажите имя рекрутера и доступную область работы.");
        const scopeId = input.scopeId.toLowerCase(), key = input.idempotencyKey.toLowerCase();
        const payloadHash = (0, node_crypto_1.createHash)("sha256")
            .update(JSON.stringify({ role: "recruiter", scopeId, displayName, sourceKind: "internal_manual",
                ...(adaptationRequired ? { adaptationRequired: true } : {}) })).digest("hex");
        return this.database.transaction(async client => {
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId && row.personalDataVisible);
            if (!grant) throw new common_1.ForbiddenException("Нужен доступ к персональным данным выбранной области.");
            const previous = await this.employees.creation(client, current.id, key);
            if (previous) {
                if (previous.payload_hash !== payloadHash)
                    throw new common_1.ConflictException("Параметры создаваемой учётной записи изменились.");
                return this.summary(client, current.id, previous.user_id);
            }
            const id = (0, node_crypto_1.randomUUID)();
            await client.query(`INSERT INTO users(id,display_name,role,active,approved,adaptation_required,adaptation_scope_id)
                VALUES($1,$2,'recruiter',true,true,$3,$4)`, [id, displayName, adaptationRequired, adaptationRequired ? scopeId : null]);
            await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,true)`,
                [id, grant.legalEntityId, grant.regionId, grant.projectId, scopeId]);
            await client.query(`INSERT INTO employee_directory(user_id,source_kind,created_by,created_at)
                VALUES($1,'internal_manual',$2,clock_timestamp())`, [id, current.id]);
            await client.query(`INSERT INTO employee_creation_requests(actor_id,idempotency_key,payload_hash,user_id)
                VALUES($1,$2,$3,$4)`, [current.id, key, payloadHash, id]);
            await this.audit.append(client, { actorId: current.id, action: "access.recruiter_created", entityType: "user",
                entityId: id, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: scopeId },
                metadata: { role: "recruiter", sourceKind: "internal_manual", financeVisible: false, personalDataVisible: true,
                    adaptationRequired, adaptationScopeId: adaptationRequired ? scopeId : null } });
            return this.summary(client, current.id, id);
        });
    }
    async attachRecruiterScope(actor, input, correlationId) {
        if (!uuid.test(input.userId) || !uuid.test(input.scopeId))
            throw new common_1.BadRequestException("Укажите рекрутера и область работы.");
        const userId = input.userId.toLowerCase(), scopeId = input.scopeId.toLowerCase();
        return this.database.transaction(async client => {
            await this.identity.lockUsers(client, [actor.id, userId]);
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId && row.personalDataVisible);
            const target = await this.identity.user(client, userId);
            const targetGrants = await this.identity.grants(userId, client);
            if (!grant || target?.role !== "recruiter" || !target.active || !target.approved || !mayManageAccess(current, targetGrants))
                throw new common_1.ForbiddenException("Учётная запись или область работы вне ваших полномочий.");
            const existing = targetGrants.find(row => row.responsibilityScopeId === scopeId);
            if (existing && (!existing.personalDataVisible || existing.financeVisible))
                throw new common_1.ConflictException("В этой области уже есть другое разрешение. Обновите его отдельно.");
            const saved = await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,true)
                ON CONFLICT DO NOTHING RETURNING user_id`, [userId, grant.legalEntityId, grant.regionId, grant.projectId, scopeId]);
            if (saved.rowCount) await this.audit.append(client, { actorId: current.id, action: "access.recruiter_scope_added", entityType: "user",
                entityId: userId, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: scopeId },
                metadata: { financeVisible: false, personalDataVisible: true } });
            return this.summary(client, current.id, userId);
        });
    }
    async summary(client, actorId, userId) {
        const [employee] = await this.employees.list(client, actorId, { targetId: userId, limit: 1 });
        if (!employee)
            throw new common_1.ForbiddenException("Employee is outside the permitted scope");
        return employee;
    }
    async setInspectionPhotoPermission(actor, employeeId, input, correlationId) {
        if (!uuid.test(employeeId) || !uuid.test(input.scopeId) || typeof input.enabled !== "boolean")
            throw new common_1.BadRequestException("Укажите механика, область работы и состояние права удаления фото.");
        const userId = employeeId.toLowerCase(), scopeId = input.scopeId.toLowerCase();
        return this.database.transaction(async client => {
            // Match the lock order used by all access administration. Re-read the
            // session and every grant after locking, so revoked authority cannot race a save.
            await this.identity.lockUsers(client, [actor.id, userId]);
            const current = await this.currentAdministrator(client, actor);
            const target = await this.identity.user(client, userId);
            const targetGrants = await this.identity.grants(userId, client);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId && row.personalDataVisible);
            const targetGrant = targetGrants.find(row => row.responsibilityScopeId === scopeId);
            if (!grant || !targetGrant || target?.role !== "mechanic" || !target.active || !target.approved
                || !mayManageAccess(current, targetGrants))
                throw new common_1.ForbiddenException("Механик или область работы вне ваших полномочий.");
            const previous = targetGrant.inspectionPhotoDelete === true;
            if (previous !== input.enabled) {
                const saved = await client.query(`UPDATE access_grants SET inspection_photo_delete=$3
                    WHERE user_id=$1 AND responsibility_scope_id=$2
                      AND legal_entity_id=$4 AND region_id=$5 AND project_id=$6
                    RETURNING user_id`, [userId, scopeId, input.enabled,
                    targetGrant.legalEntityId, targetGrant.regionId, targetGrant.projectId]);
                if (saved.rowCount !== 1)
                    throw new common_1.ConflictException("Область доступа изменилась. Обновите карточку сотрудника.");
                await this.audit.append(client, { actorId: current.id, action: "access.inspection_photo_permission_changed",
                    entityType: "user", entityId: userId, channel: current.channel, correlationId,
                    scope: { legalEntityId: targetGrant.legalEntityId, regionId: targetGrant.regionId,
                        projectId: targetGrant.projectId, responsibilityScopeId: scopeId },
                    metadata: { previousInspectionPhotoDelete: previous, inspectionPhotoDelete: input.enabled } });
            }
            // Grants are loaded for every authenticated request. Updating this
            // flag takes effect immediately without terminating the mechanic's session.
            return this.summary(client, current.id, userId);
        });
    }
    async createExternal(actor, input, correlationId) {
        requiredAdaptation(input, "external_recruiter");
        const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
        if (!displayName || displayName.length > 160 || /[\u0000-\u001f\u007f]/.test(displayName)
            || !uuid.test(input.scopeId) || !uuid.test(input.idempotencyKey))
            throw new common_1.BadRequestException("Укажите имя рекрутера и доступную область работы.");
        const scopeId = input.scopeId.toLowerCase(), key = input.idempotencyKey.toLowerCase();
        const payloadHash = (0, node_crypto_1.createHash)("sha256")
            .update(JSON.stringify({ role: "external_recruiter", scopeId, displayName })).digest("hex");
        return this.database.transaction(async client => {
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId && row.personalDataVisible);
            if (!grant) throw new common_1.ForbiddenException("Нужен доступ к персональным данным выбранной области.");
            const previous = await this.employees.creation(client, current.id, key);
            if (previous) {
                if (previous.payload_hash !== payloadHash)
                    throw new common_1.ConflictException("Параметры создаваемой учётной записи изменились.");
                return this.summary(client, current.id, previous.user_id);
            }
            const id = (0, node_crypto_1.randomUUID)();
            await client.query("INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,'external_recruiter',true,true)", [id, displayName]);
            await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,true)`,
                [id, grant.legalEntityId, grant.regionId, grant.projectId, scopeId]);
            await client.query(`INSERT INTO employee_directory(user_id,source_kind,created_by,created_at)
                VALUES($1,'external_manual',$2,clock_timestamp())`, [id, current.id]);
            await client.query(`INSERT INTO employee_creation_requests(actor_id,idempotency_key,payload_hash,user_id)
                VALUES($1,$2,$3,$4)`, [current.id, key, payloadHash, id]);
            await this.audit.append(client, { actorId: current.id, action: "access.external_recruiter_created", entityType: "user",
                entityId: id, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: scopeId },
                metadata: { role: "external_recruiter", sourceKind: "external_manual", financeVisible: false, personalDataVisible: true } });
            // Creating the account does not publish any request: explicit scoped
            // recruitment access must be configured before this user sees data.
            return this.summary(client, current.id, id);
        });
    }
    async attachExternalScope(actor, input, correlationId) {
        if (!uuid.test(input.userId) || !uuid.test(input.scopeId))
            throw new common_1.BadRequestException("Укажите рекрутера и область работы.");
        const userId = input.userId.toLowerCase(), scopeId = input.scopeId.toLowerCase();
        return this.database.transaction(async client => {
            await this.identity.lockUsers(client, [actor.id, userId]);
            const current = await this.currentAdministrator(client, actor);
            const grant = current.grants.find(row => row.responsibilityScopeId === scopeId && row.personalDataVisible);
            const target = await this.identity.user(client, userId);
            const targetGrants = await this.identity.grants(userId, client);
            if (!grant || target?.role !== "external_recruiter" || !target.active || !target.approved || !mayManageAccess(current, targetGrants))
                throw new common_1.ForbiddenException("Учётная запись или область работы вне ваших полномочий.");
            const saved = await client.query(`INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,
                responsibility_scope_id,finance_visible,personal_data_visible) VALUES($1,$2,$3,$4,$5,false,true)
                ON CONFLICT DO NOTHING RETURNING user_id`, [userId, grant.legalEntityId, grant.regionId, grant.projectId, scopeId]);
            const existing = targetGrants.find(row => row.responsibilityScopeId === scopeId);
            if (!saved.rowCount && !existing?.personalDataVisible)
                throw new common_1.ConflictException("В этой области уже есть другое разрешение. Обновите его отдельно.");
            if (saved.rowCount) await this.audit.append(client, { actorId: current.id, action: "access.external_recruiter_scope_added", entityType: "user",
                entityId: userId, channel: current.channel, correlationId,
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId, projectId: grant.projectId, responsibilityScopeId: scopeId },
                metadata: { financeVisible: false, personalDataVisible: true } });
            return this.summary(client, current.id, userId);
        });
    }
};
exports.EmployeeDirectoryService = EmployeeDirectoryService;
exports.EmployeeDirectoryService = EmployeeDirectoryService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(config_1.ConfigService)),
    __param(2, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(3, (0, common_1.Inject)(employee_repository_1.EmployeeRepository)),
    __param(4, (0, common_1.Inject)(auth_service_1.AuthService)),
    __param(5, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        config_1.ConfigService,
        identity_repository_1.IdentityRepository,
        employee_repository_1.EmployeeRepository,
        auth_service_1.AuthService,
        audit_service_1.AuditService])
], EmployeeDirectoryService);
//# sourceMappingURL=employee-directory.service.js.map
