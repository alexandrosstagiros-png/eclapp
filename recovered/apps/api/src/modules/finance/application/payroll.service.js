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
exports.PayrollService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const payroll_rules_1 = require("../domain/payroll-rules");
const payroll_repository_1 = require("../infra/payroll.repository");
let PayrollService = class PayrollService {
    database;
    audit;
    identity;
    repository;
    constructor(database, audit, identity, repository) {
        this.database = database;
        this.audit = audit;
        this.identity = identity;
        this.repository = repository;
    }
    grants(actor) {
        const grants = (0, payroll_rules_1.payrollGrants)(actor);
        if (!grants.length)
            throw new common_1.ForbiddenException({ code: "PAYROLL_FORBIDDEN", message: "Расчёт зарплаты доступен только водителю в своей области доступа." });
        return grants;
    }
    async read(actor, operation) {
        this.grants(actor);
        return this.database.transaction(async (client) => {
            // Identity changes use the same user lock, closing the guard-to-read revocation gap.
            await this.identity.lockUsers(client, [actor.id]);
            const current = await this.identity.actorBySession(client, actor.sessionId);
            if (!current || current.id !== actor.id || current.authVersion !== actor.authVersion || current.role !== actor.role)
                throw new common_1.UnauthorizedException({ code: "SESSION_EXPIRED", message: "Сессия недействительна." });
            this.grants(current);
            return operation(client, current);
        });
    }
    async list(actor) {
        return this.read(actor, async (client, current) => {
            const details = await this.repository.list(client, current.id, this.grants(current));
            await this.audit.append(client, { actorId: current.id, channel: current.channel,
                action: "payroll.self_list_viewed", entityType: "driver_payroll", correlationId: (0, node_crypto_1.randomUUID)(),
                metadata: { count: details.length } });
            return { items: details.map(({ openingBalanceExplanation, earnings, deductions, payments, settlement, ...summary }) => summary) };
        });
    }
    async detail(actor, id) {
        return this.read(actor, async (client, current) => {
            const statement = await this.repository.detail(client, current.id, this.grants(current), id);
            if (!statement)
                throw new common_1.NotFoundException({ code: "PAYROLL_NOT_FOUND", message: "Расчёт зарплаты не найден." });
            const grant = this.grants(current).find(g => g.legalEntityId === statement.legalEntity.id &&
                g.projectId === statement.project.id && g.responsibilityScopeId === statement.responsibilityScope.id);
            await this.audit.append(client, { actorId: current.id, channel: current.channel,
                action: "payroll.self_statement_viewed", entityType: "driver_payroll", entityId: id,
                correlationId: (0, node_crypto_1.randomUUID)(),
                scope: { legalEntityId: grant.legalEntityId, regionId: grant.regionId,
                    projectId: grant.projectId, responsibilityScopeId: grant.responsibilityScopeId },
                metadata: { revision: statement.revision } });
            return statement;
        });
    }
};
exports.PayrollService = PayrollService;
exports.PayrollService = PayrollService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, audit_service_1.AuditService,
        identity_repository_1.IdentityRepository, payroll_repository_1.PayrollRepository])
], PayrollService);
//# sourceMappingURL=payroll.service.js.map