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
exports.CommunicationsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const contracts_1 = require("@transport/contracts");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const access_policy_1 = require("../../identity-access/domain/access-policy");
const validation_1 = require("../../workflow/domain/validation");
const communication_rules_1 = require("../domain/communication-rules");
const telegram_config_1 = require("../domain/telegram-config");
const communications_repository_1 = require("../infra/communications.repository");
const telegram_status_queue_1 = require("../infra/telegram-status.queue");
let CommunicationsService = class CommunicationsService {
    repository;
    identity;
    audit;
    constructor(repository, identity, audit) {
        this.repository = repository;
        this.identity = identity;
        this.audit = audit;
    }
    async current(client, supplied) {
        await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId].filter(Boolean));
        const actor = await this.identity.actorBySession(client, supplied.sessionId);
        if (!actor || actor.id !== supplied.id || actor.role !== supplied.role || actor.authVersion !== supplied.authVersion)
            throw new common_1.UnauthorizedException("Сессия недействительна.");
        if (actor.role === "external_recruiter")
            throw new common_1.ForbiddenException("Стороннему рекрутеру доступен только раздел рекрутинга.");
        return actor;
    }
    async member(client, actor, ticket) {
        return (0, communication_rules_1.hasDepartmentScope)(actor, ticket, ticket.department === "accounting" || ticket.originalDepartment === "accounting") &&
            (this.driverAdministrator(actor, ticket) || this.repository.member(client, actor.id, ticket.department, ticket));
    }
    driverAdministrator(actor, ticket) { return ticket.applicationOnly && actor.role === 'access_admin' && !actor.impersonation; }
    async assigneeAvailable(client, ticket) {
        if (!ticket.assigneeId)
            return false;
        const user = await this.identity.user(client, ticket.assigneeId);
        if (!user?.active || !user.approved)
            return false;
        const assignee = { id: user.id, displayName: user.display_name, role: user.role, authVersion: user.auth_version, sessionId: "assignment", channel: "system", grants: await this.identity.grants(user.id, client) };
        return this.member(client, assignee, ticket);
    }
    async allowed(client, actor, ticket) {
        if (actor.role === 'tender_specialist' && !ticket.applicationOnly) return false;
        if (!(0, communication_rules_1.hasCommunicationScope)(actor, ticket))
            return false;
        return ticket.requesterId === actor.id || this.member(client, actor, ticket);
    }
    ticket(client, id, lock = false) { return this.repository.ticket(client, id, lock); }
    async accessible(client, actor, id, lock = false) {
        const ticket = await this.ticket(client, id, lock);
        if (!ticket || !(await this.allowed(client, actor, ticket)))
            throw new common_1.NotFoundException("Обращение не найдено.");
        return ticket;
    }
    async dto(client, actor, ticket) {
        const { legalEntityId, regionId, projectId, responsibilityScopeId } = ticket;
        return { id: ticket.id, reference: ticket.reference, department: ticket.department, originalDepartment: ticket.originalDepartment,
            kind: ticket.kind, subject: ticket.subject, scope: { legalEntityId, regionId, projectId, responsibilityScopeId }, status: ticket.status,
            requester: { id: ticket.requesterId, name: ticket.requesterName }, assignee: ticket.assigneeId ? { id: ticket.assigneeId, name: ticket.assigneeName } : null,
            createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(), version: ticket.version, lastDeliveryStatus: ticket.lastDeliveryStatus,
            applicationOnly: ticket.applicationOnly, canMessage: ticket.applicationOnly && ticket.status !== 'resolved',
            actions: (0, communication_rules_1.ticketActions)(actor.id, ticket, await this.member(client, actor, ticket), await this.assigneeAvailable(client, ticket), this.driverAdministrator(actor, ticket)), history: await this.repository.history(client, ticket.id) };
    }
    event(client, actor, correlationId, action, entityId, scope, metadata = {}) {
        const { legalEntityId, regionId, projectId, responsibilityScopeId } = scope;
        return this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId, action, entityType: "communication_ticket", entityId, scope: { legalEntityId, regionId, projectId, responsibilityScopeId }, metadata });
    }
    async notify(client, actor, ticket, event) {
        if (ticket.applicationOnly || actor.role === 'driver') return;
        if ((0, telegram_config_1.readTelegramCommunicationsConfig)().enabled)
            await (0, telegram_status_queue_1.enqueueCommunicationStatus)(client, this.audit, actor, ticket, await this.recipients(client, ticket, actor), event);
    }
    async once(client, actor, key, operation, payload, perform) {
        const hash = (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(payload)).digest("hex");
        const cached = await this.repository.cached(client, actor.id, key);
        if (cached) {
            if (cached.operation !== operation || cached.request_hash !== hash)
                throw new common_1.ConflictException("Ключ повтора уже использован для другого запроса.");
            return cached.response;
        }
        const result = await perform();
        await this.repository.saveResponse(client, actor.id, key, operation, hash, result);
        return result;
    }
    async catalog(supplied) {
        return this.repository.database.transaction(async (client) => {
            const actor = await this.current(client, supplied);
            const telegram = (0, telegram_config_1.readTelegramCommunicationsConfig)();
            const enabled = telegram.enabled && !['driver', 'tender_specialist'].includes(actor.role);
            return { departments: contracts_1.DEPARTMENTS, scopes: await this.repository.scopes(client, actor.id), memberships: await this.repository.memberships(client, actor), telegram: { configured: enabled, botUsername: enabled ? telegram.botUsername : null } };
        });
    }
    async list(supplied, view, cursor) {
        const input = (0, communication_rules_1.communicationListInput)(view, cursor);
        return this.repository.database.transaction(async (client) => {
            const actor = await this.current(client, supplied);
            if (input.view === "department" && !(await this.repository.memberships(client, actor)).length)
                throw new common_1.ForbiddenException("Нет доступа к очередям отделов.");
            const rows = await this.repository.list(client, actor, input.view, input.cursor);
            const items = [];
            for (const row of rows.slice(0, 50))
                items.push(await this.dto(client, actor, row));
            const last = rows[49];
            return { items, nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
        });
    }
    async get(supplied, ticketId) {
        const id = (0, validation_1.uuid)(ticketId);
        return this.repository.database.transaction(async (client) => {
            const actor = await this.current(client, supplied);
            return this.dto(client, actor, await this.accessible(client, actor, id));
        });
    }
    async driverRequests(supplied, scopeValue, cursorValue) {
        const scopeId = (0, validation_1.uuid)(scopeValue);
        const { cursor } = (0, communication_rules_1.communicationListInput)('department', cursorValue);
        return this.repository.database.transaction(async client => {
            const actor = await this.current(client, supplied);
            if (actor.role === 'driver') throw new common_1.ForbiddenException('Водителю доступны только собственные обращения.');
            const canonical = (await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",s.id AS "responsibilityScopeId"
              FROM responsibility_scopes s JOIN projects p ON p.id=s.project_id WHERE s.id=$1`, [scopeId])).rows[0];
            if (!canonical || !(0, communication_rules_1.hasCommunicationScope)(actor, canonical)) throw new common_1.ForbiddenException('Область работы недоступна.');
            const rows = await this.repository.driverRequests(client, actor, scopeId, cursor);
            const items = [];
            for (const ticket of rows.slice(0, 50)) items.push(await this.dto(client, actor, ticket));
            const last = rows[49];
            return { items, nextCursor: rows.length > 50 ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
        });
    }
    async messages(supplied, ticketId, beforeValue) {
        const id = (0, validation_1.uuid)(ticketId);
        const { cursor } = (0, communication_rules_1.communicationListInput)('mine', beforeValue);
        return this.repository.database.transaction(async client => {
            const actor = await this.current(client, supplied);
            await this.accessible(client, actor, id, true);
            const rows = await this.repository.messages(client, id, cursor);
            const page = rows.slice(0, 100), oldest = page[page.length - 1];
            return { messages: page.reverse(), hasMore: rows.length > 100,
                nextBefore: rows.length > 100 ? Buffer.from(JSON.stringify({ createdAt: oldest.createdAt, id: oldest.id })).toString('base64url') : null };
        });
    }
    async sendMessage(supplied, ticketId, body, correlationId) {
        const id = (0, validation_1.uuid)(ticketId);
        const input = (0, communication_rules_1.communicationMessageInput)(body);
        return this.repository.database.transaction(async client => {
            const actor = await this.current(client, supplied);
            const ticket = await this.accessible(client, actor, id, true);
            if (!ticket.applicationOnly) throw new common_1.ForbiddenException('Переписка в приложении доступна для водительских обращений.');
            return this.once(client, actor, input.idempotencyKey, 'communications.message', { ticketId: id, ...input }, async () => {
                if (ticket.status === 'resolved') throw new common_1.ConflictException('Сначала возобновите обращение.');
                const message = await this.repository.insertMessage(client, ticket, actor, input.text);
                await this.event(client, actor, correlationId, 'communications.application_message_recorded', id, ticket,
                    { messageId: message.id, sha256: (0, node_crypto_1.createHash)('sha256').update(input.text).digest('hex') });
                return message;
            });
        });
    }
    async create(supplied, body, correlationId) {
        const input = (0, communication_rules_1.createTicketInput)(body);
        return this.repository.database.transaction(async (client) => {
            const actor = await this.current(client, supplied);
            if (!(0, communication_rules_1.hasCommunicationScope)(actor, input.scope))
                throw new common_1.ForbiddenException("Обращение вне вашей области доступа.");
            return this.once(client, actor, input.idempotencyKey, "communications.create", input, async () => {
                const id = (0, node_crypto_1.randomUUID)();
                const reference = `ОБР-${(0, node_crypto_1.randomBytes)(8).toString("hex").toUpperCase()}`;
                await this.repository.insertTicket(client, id, reference, actor.id, input);
                if (actor.role === 'driver') await client.query('INSERT INTO communications_driver_requests(ticket_id) VALUES($1)', [id]);
                await this.repository.action(client, (0, node_crypto_1.randomUUID)(), id, actor.id, "created", 1, input.department, null);
                await this.event(client, actor, correlationId, "communications.created", id, input.scope, { department: input.department, kind: input.kind, version: 1 });
                const ticket = (await this.ticket(client, id));
                if (input.text !== undefined) {
                    const message = await this.repository.insertMessage(client, ticket, actor, input.text);
                    await this.event(client, actor, correlationId, 'communications.application_message_recorded', id, ticket,
                        { messageId: message.id, sha256: (0, node_crypto_1.createHash)('sha256').update(input.text).digest('hex') });
                }
                await this.notify(client, actor, ticket, "created");
                return this.dto(client, actor, ticket);
            });
        });
    }
    async act(supplied, ticketId, body, correlationId) {
        const id = (0, validation_1.uuid)(ticketId);
        const input = (0, communication_rules_1.communicationActionInput)(body);
        return this.repository.database.transaction(async (client) => {
            // Lock both identities before the ticket, matching access changes and delivery workers.
            // Recheck the observed assignment as well as the submitted version before using these locks.
            const observedAssignee = await this.repository.assigneeId(client, id);
            await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId, observedAssignee].filter(Boolean));
            const actor = await this.current(client, supplied);
            const ticket = await this.accessible(client, actor, id, true);
            return this.once(client, actor, input.idempotencyKey, "communications.action", { ticketId: id, ...input }, async () => {
                if (ticket.version !== input.expectedVersion || ticket.assigneeId !== (observedAssignee ?? null))
                    throw new common_1.ConflictException("Обращение изменилось. Обновите карточку.");
                const available = (0, communication_rules_1.ticketActions)(actor.id, ticket, await this.member(client, actor, ticket), await this.assigneeAvailable(client, ticket), this.driverAdministrator(actor, ticket));
                if (!available.includes(input.action))
                    throw new common_1.ForbiddenException("Действие недоступно для этого обращения.");
                const department = input.action === "escalate" ? "administration" : ticket.department;
                const status = input.action === "take" ? "in_progress" : input.action === "resolve" ? "resolved" : input.action === "escalate" ? "escalated" : department === "administration" && ticket.originalDepartment !== "administration" ? "escalated" : "new";
                const assigneeId = input.action === "take" ? actor.id : input.action === "resolve" ? ticket.assigneeId : null;
                if (!(await this.repository.updateTicket(client, ticket, status, department, assigneeId)))
                    throw new common_1.ConflictException("Обращение изменилось. Обновите карточку.");
                await this.repository.action(client, (0, node_crypto_1.randomUUID)(), id, actor.id, input.action, ticket.version + 1, department, input.reason ?? null);
                await this.event(client, actor, correlationId, `communications.${input.action}`, id, ticket, { department, previousDepartment: ticket.department, status, version: ticket.version + 1, ...(input.action === "take" ? { previousAssigneeId: ticket.assigneeId, assigneeId } : {}), hasReason: Boolean(input.reason), ...(input.reason ? { reasonSha256: (0, node_crypto_1.createHash)("sha256").update(input.reason).digest("hex") } : {}) });
                const updated = (await this.ticket(client, id));
                await this.notify(client, actor, updated, input.action);
                return this.dto(client, actor, updated);
            });
        });
    }
    async telegramLink(supplied, ticketId, correlationId) {
        const id = (0, validation_1.uuid)(ticketId);
        return this.repository.database.transaction(async (client) => {
            const actor = await this.current(client, supplied);
            const ticket = await this.accessible(client, actor, id);
            if (actor.role === 'driver' || ticket.applicationOnly) throw new common_1.ForbiddenException('Водительские обращения и ответы доступны только в приложении.');
            const config = (0, telegram_config_1.readTelegramCommunicationsConfig)();
            if (!config.enabled || !config.botUsername)
                throw new common_1.ServiceUnavailableException("Общение через Telegram ещё не настроено.");
            if (ticket.status === "resolved")
                throw new common_1.ConflictException("Сначала возобновите обращение.");
            if (!await this.identity.channelForUser(client, actor.id))
                throw new common_1.ConflictException("Сначала привяжите Telegram к своей учётной записи.");
            const token = `c_${(0, node_crypto_1.randomBytes)(24).toString("base64url")}`;
            const expiresAt = new Date(Date.now() + 15 * 60_000);
            await this.repository.saveLink(client, (0, node_crypto_1.createHash)("sha256").update(token).digest("hex"), id, actor.id, expiresAt);
            await this.event(client, actor, correlationId, "communications.telegram_link_created", id, ticket);
            return { url: `https://t.me/${config.botUsername}?start=${token}`, expiresAt: expiresAt.toISOString() };
        });
    }
    async membership(supplied, body, correlationId) {
        const input = (0, communication_rules_1.membershipInput)(body);
        return this.repository.database.transaction(async (client) => {
            await this.identity.lockUsers(client, [supplied.id, supplied.impersonation?.administratorId, input.userId].filter(Boolean));
            const actor = await this.current(client, supplied);
            if (!(0, access_policy_1.mayManageAccess)(actor, [{ ...input.scope, personalDataVisible: true, financeVisible: input.department === "accounting" }]))
                throw new common_1.ForbiddenException("Недостаточно прав для назначения доступа к отделу.");
            const user = await this.identity.user(client, input.userId);
            if (!user)
                throw new common_1.NotFoundException("Пользователь не найден.");
            if (input.enabled) {
                const target = { id: user.id, displayName: user.display_name, role: user.role, authVersion: user.auth_version, sessionId: "membership", channel: "system", grants: await this.identity.grants(user.id, client) };
                if (!user.active || !user.approved || !(0, communication_rules_1.hasDepartmentScope)(target, input.scope, input.department === "accounting"))
                    throw new common_1.ForbiddenException("Получателю нужны активная учётная запись, область и доступ к данным отдела.");
            }
            return this.once(client, actor, input.idempotencyKey, "communications.membership", input, async () => {
                await this.repository.setMembership(client, input.userId, input.department, input.scope, input.enabled, actor.id);
                await this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId, action: input.enabled ? "communications.membership_granted" : "communications.membership_revoked", entityType: "communication_membership", entityId: input.userId, scope: input.scope, metadata: { department: input.department, enabled: input.enabled } });
                return { userId: input.userId, department: input.department, scope: input.scope, enabled: input.enabled };
            });
        });
    }
    /** A Bot API identity has no browser session; each operation resolves the binding and active user afresh. */
    async telegramActor(client, telegramUserId) {
        if (!/^[1-9][0-9]{0,15}$/.test(telegramUserId))
            return undefined;
        const id = await this.identity.channelUser(client, telegramUserId);
        if (!id)
            return undefined;
        await this.identity.lockUsers(client, [id]);
        if (await this.identity.channelUser(client, telegramUserId) !== id)
            return undefined;
        const user = await this.identity.user(client, id);
        if (!user?.active || !user.approved || ['driver', 'external_recruiter'].includes(user.role))
            return undefined;
        return { id, displayName: user.display_name, role: user.role, authVersion: user.auth_version, sessionId: "telegram-bot", channel: "telegram", grants: await this.identity.grants(id, client) };
    }
    async startTicket(client, actor, token) {
        if (!/^c_[A-Za-z0-9_-]{32}$/.test(token))
            return undefined;
        const id = await this.repository.linkTicketId(client, (0, node_crypto_1.createHash)("sha256").update(token).digest("hex"), actor.id);
        if (!id)
            return undefined;
        const ticket = await this.ticket(client, id, true);
        // A retired driver link is consumed silently: do not queue even a Telegram prompt.
        if (ticket?.applicationOnly) return null;
        return ticket && ticket.status !== "resolved" && await this.allowed(client, actor, ticket) ? ticket : undefined;
    }
    async recipients(client, ticket, sender) {
        if (ticket.applicationOnly || sender.role === 'driver') return [];
        if (!(await this.allowed(client, sender, ticket)))
            return [];
        const ids = await this.repository.recipientIds(client, ticket, sender);
        const recipients = [];
        for (const id of ids) {
            const user = await this.identity.user(client, id);
            if (!user?.active || !user.approved || !await this.identity.channelForUser(client, id))
                continue;
            const actor = { id, displayName: user.display_name, role: user.role, authVersion: user.auth_version, sessionId: "telegram-bot", channel: "telegram", grants: await this.identity.grants(id, client) };
            if (await this.allowed(client, actor, ticket))
                recipients.push(actor);
        }
        return recipients;
    }
};
exports.CommunicationsService = CommunicationsService;
exports.CommunicationsService = CommunicationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(communications_repository_1.CommunicationsRepository)),
    __param(1, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(2, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [communications_repository_1.CommunicationsRepository,
        identity_repository_1.IdentityRepository,
        audit_service_1.AuditService])
], CommunicationsService);
//# sourceMappingURL=communications.service.js.map
