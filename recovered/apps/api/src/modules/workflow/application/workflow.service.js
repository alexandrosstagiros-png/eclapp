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
exports.WorkflowService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const trip_read_policy_1 = require("../../operations/domain/trip-read-policy");
const workflow_repository_1 = require("../infra/workflow.repository");
const validation_1 = require("../domain/validation");
let WorkflowService = class WorkflowService {
    repository;
    identity;
    audit;
    constructor(repository, identity, audit) {
        this.repository = repository;
        this.identity = identity;
        this.audit = audit;
    }
    async current(client, supplied, roles, lockUserIds = []) {
        await this.identity.lockUsers(client, [supplied.id, ...lockUserIds]);
        const current = await this.identity.actorBySession(client, supplied.sessionId);
        if (!current || current.id !== supplied.id || current.authVersion !== supplied.authVersion || current.role !== supplied.role)
            throw new common_1.UnauthorizedException("Сессия недействительна.");
        if (!roles.includes(current.role))
            throw new common_1.ForbiddenException("Действие недоступно для вашей роли.");
        return current;
    }
    scopeAllowed(actor, scope) {
        return actor.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, scope));
    }
    async allowedTrip(client, actor, id) {
        const trip = await this.repository.trip(client, id);
        if (!trip || !this.scopeAllowed(actor, trip) || (actor.role === "driver" && !(await this.repository.assigned(client, id, actor.id))))
            throw new common_1.NotFoundException("Рейс не найден.");
        return trip;
    }
    async mutable(client, tripId) {
        if (await this.repository.confirmed(client, tripId))
            throw new common_1.ConflictException("Рейс включён в подтверждённый реестр. Документы и факты зафиксированы.");
    }
    async once(client, actor, key, operation, payload, action) {
        const hash = (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(payload)).digest("hex");
        const cached = await this.repository.cached(client, actor.id, key);
        if (cached) {
            if (cached.operation !== operation || cached.request_hash !== hash)
                throw new common_1.ConflictException("Ключ повтора уже использован для другого запроса.");
            return cached.response;
        }
        const result = await action();
        await this.repository.saveResponse(client, actor.id, key, operation, hash, result);
        return result;
    }
    event(client, actor, correlationId, action, entityType, entityId, scope, metadata = {}) {
        const { legalEntityId, regionId, projectId, responsibilityScopeId } = scope;
        return this.audit.append(client, { actorId: actor.id, channel: actor.channel, correlationId, action, entityType, entityId, scope: { legalEntityId, regionId, projectId, responsibilityScopeId }, metadata });
    }
    async catalog(actor) {
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["dispatcher", "document_specialist"]);
            if (!current.grants.length)
                throw new common_1.ForbiddenException("Нет доступных областей работы.");
            return this.repository.catalog(client, current);
        });
    }
    async validateTrip(client, actor, input) {
        if (!this.scopeAllowed(actor, input.scope))
            throw new common_1.ForbiddenException("Рейс вне вашей области доступа.");
        if (!(await this.repository.tripDependenciesExist(client, input)))
            return (0, validation_1.fail)("Проверьте область, автомобиль и назначенного водителя.");
        if (await this.repository.referenceExists(client, input.reference))
            throw new common_1.ConflictException("Номер рейса уже существует или недоступен.");
    }
    async createTrip(actor, body, correlationId) {
        const input = (0, validation_1.tripInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["dispatcher"], input.driverId ? [input.driverId] : []);
            if (!this.scopeAllowed(current, input.scope))
                throw new common_1.ForbiddenException("Рейс вне вашей области доступа.");
            return this.once(client, current, input.idempotencyKey, "trip.create", input, async () => {
                await this.validateTrip(client, current, input);
                const id = (0, node_crypto_1.randomUUID)();
                if (!(await this.repository.insertTrip(client, id, input)))
                    throw new common_1.ConflictException("Номер рейса уже существует или недоступен.");
                await this.event(client, current, correlationId, "operations.trip_created", "trip", id, input.scope, { assigned: Boolean(input.driverId) });
                return { id };
            });
        });
    }
    async importPreview(actor, body) {
        const input = (0, validation_1.record)(body, ["csv"]);
        const preview = (0, validation_1.parseCsv)(input.csv);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["dispatcher"]);
            if (preview.errors.length)
                return preview;
            for (let i = 0; i < preview.rows.length; i++) {
                try {
                    await this.validateTrip(client, current, preview.rows[i]);
                }
                catch {
                    preview.errors.push({ row: i + 2, message: "Строка недоступна, содержит неверный справочник или повторный номер рейса." });
                }
            }
            return { ...preview, valid: preview.errors.length === 0 };
        });
    }
    async importCommit(actor, body, correlationId) {
        const input = (0, validation_1.record)(body, ["csv", "idempotencyKey"]);
        const key = (0, validation_1.uuid)(input.idempotencyKey);
        const preview = (0, validation_1.parseCsv)(input.csv);
        if (!preview.valid)
            return (0, validation_1.fail)("Исправьте ошибки CSV перед загрузкой.");
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["dispatcher"], preview.rows.flatMap((row) => row.driverId ? [row.driverId] : []));
            if (preview.rows.some((row) => !this.scopeAllowed(current, row.scope)))
                throw new common_1.ForbiddenException("CSV содержит рейсы вне вашей области доступа.");
            return this.once(client, current, key, "trip.import", { csv: input.csv }, async () => {
                const tripIds = [];
                for (const row of preview.rows) {
                    await this.validateTrip(client, current, row);
                    const id = (0, node_crypto_1.randomUUID)();
                    if (!(await this.repository.insertTrip(client, id, row)))
                        throw new common_1.ConflictException("CSV содержит существующий номер рейса. Загрузка отменена целиком.");
                    await this.event(client, current, correlationId, "operations.trip_imported", "trip", id, row.scope, { batchId: key, assigned: Boolean(row.driverId) });
                    tripIds.push(id);
                }
                return { tripIds, count: tripIds.length };
            });
        });
    }
    async state(actor, tripId) {
        const id = (0, validation_1.uuid)(tripId);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "dispatcher", "document_specialist"]);
            const trip = await this.allowedTrip(client, current, id);
            const personalDataVisible = current.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, trip) && grant.personalDataVisible);
            const rows = await this.repository.documents(client, id);
            const facts = await this.repository.facts(client, id);
            const attendance = await this.repository.attendance(client, id);
            const acceptedKinds = rows.filter((doc) => doc.status === "accepted").map((doc) => doc.kind);
            return {
                attendance: attendance.filter((item) => current.role !== "driver" || item.actor_id === current.id).map((item) => ({
                    id: item.id, kind: item.kind,
                    driver: { id: item.actor_id, name: current.role === "driver" || personalDataVisible ? item.actor_name : `Водитель ${item.actor_id.slice(0, 8)}` },
                    occurredAt: item.occurred_at.toISOString(), receivedAt: item.received_at.toISOString(), channel: item.channel,
                })),
                documents: rows.map((doc) => ({ id: doc.id, kind: doc.kind, revision: doc.revision, filename: personalDataVisible ? doc.filename : `${doc.kind}-${doc.revision}.${doc.mime_type === "application/pdf" ? "pdf" : doc.mime_type === "image/png" ? "png" : "jpg"}`, mimeType: doc.mime_type, byteSize: doc.byte_size, sha256: doc.sha256, uploadedAt: doc.uploaded_at.toISOString(), status: doc.status, reason: doc.reason })),
                documentPackage: { requiredKinds: [...validation_1.DOCUMENT_KINDS], acceptedKinds, complete: validation_1.DOCUMENT_KINDS.every((kind) => acceptedKinds.includes(kind)) },
                facts: facts ? { id: facts.id, revision: facts.revision, minutes: facts.minutes, stops: facts.stops, kilometersHundredths: facts.kilometers_hundredths, waitingMinutes: facts.waiting_minutes, submittedAt: facts.submitted_at.toISOString(), status: facts.status, reason: facts.reason } : null,
            };
        });
    }
    async attendance(actor, tripId, body, correlationId) {
        const id = (0, validation_1.uuid)(tripId);
        const input = (0, validation_1.attendanceInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver"]);
            const trip = await this.allowedTrip(client, current, id);
            return this.once(client, current, input.idempotencyKey, "attendance.create", { tripId: id, ...input }, async () => {
                const attendance = (await this.repository.attendance(client, id)).filter((event) => event.actor_id === current.id);
                const existing = attendance.find((event) => event.kind === input.kind);
                if (existing) {
                    if (existing.occurred_at.toISOString() !== input.occurredAt)
                        throw new common_1.ConflictException("Эта отметка уже зарегистрирована с другим временем.");
                    return { id: existing.id };
                }
                const accepted = attendance.find((event) => event.kind === "accept");
                const start = attendance.find((event) => event.kind === "check_in");
                const occurredAt = new Date(input.occurredAt).getTime();
                if (input.kind === "accept" && attendance.some((event) => event.kind !== "accept"))
                    throw new common_1.ConflictException("Рейс уже начат: подтверждение принятия задним числом недоступно.");
                if (input.kind === "check_in" && (!accepted || accepted.occurred_at.getTime() > occurredAt))
                    throw new common_1.ConflictException("Сначала примите заявку; начало рейса не может быть раньше принятия.");
                // Historical starts remain finishable without inventing an acceptance event.
                if (input.kind === "check_out" && (!start || start.occurred_at.getTime() > occurredAt))
                    throw new common_1.ConflictException("Сначала зарегистрируйте начало рейса; завершение не может быть раньше начала.");
                const eventId = (0, node_crypto_1.randomUUID)();
                await this.repository.insertAttendance(client, eventId, id, current, input.kind, input.occurredAt);
                await this.event(client, current, correlationId, `attendance.${input.kind}`, "trip", id, trip, { attendanceId: eventId, clientOccurredAt: input.occurredAt });
                return { id: eventId };
            });
        });
    }
    async upload(actor, tripId, body, correlationId) {
        const id = (0, validation_1.uuid)(tripId);
        const input = (0, validation_1.uploadInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "dispatcher"]);
            const trip = await this.allowedTrip(client, current, id);
            return this.once(client, current, input.idempotencyKey, "document.upload", { tripId: id, kind: input.kind, filename: input.filename, mimeType: input.mimeType, sha256: input.sha256 }, async () => {
                await this.mutable(client, id);
                const latest = (await this.repository.documents(client, id)).find((doc) => doc.kind === input.kind);
                const revision = (latest?.revision ?? 0) + 1;
                const documentId = (0, node_crypto_1.randomUUID)();
                await this.repository.insertDocument(client, { id: documentId, tripId: id, kind: input.kind, revision, filename: input.filename, mimeType: input.mimeType, bytes: input.bytes, sha256: input.sha256, actorId: current.id });
                await this.event(client, current, correlationId, "documents.uploaded", "document", documentId, trip, { tripId: id, kind: input.kind, revision, sha256: input.sha256, byteSize: input.bytes.length });
                return { id: documentId, revision };
            });
        });
    }
    async submitFacts(actor, tripId, body, correlationId) {
        const id = (0, validation_1.uuid)(tripId);
        const input = (0, validation_1.factsInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "dispatcher"]);
            const trip = await this.allowedTrip(client, current, id);
            return this.once(client, current, input.idempotencyKey, "facts.submit", { tripId: id, ...input }, async () => {
                await this.mutable(client, id);
                const latest = await this.repository.facts(client, id);
                const revision = (latest?.revision ?? 0) + 1;
                const factsId = (0, node_crypto_1.randomUUID)();
                await this.repository.insertFacts(client, { ...input, id: factsId, tripId: id, revision, actorId: current.id });
                await this.event(client, current, correlationId, "operations.facts_submitted", "facts", factsId, trip, { tripId: id, revision, minutes: input.minutes, stops: input.stops, kilometersHundredths: input.kilometersHundredths, waitingMinutes: input.waitingMinutes, source: "manual" });
                return { id: factsId, revision };
            });
        });
    }
    async review(actor, entity, entityId, body, correlationId) {
        const id = (0, validation_1.uuid)(entityId);
        const input = (0, validation_1.reviewInput)(body, entity === "document" ? "accepted" : "approved");
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["document_specialist"]);
            const tripId = await this.repository.entityTrip(client, entity, id);
            if (!tripId)
                throw new common_1.NotFoundException("Запись не найдена.");
            const trip = await this.allowedTrip(client, current, tripId);
            return this.once(client, current, input.idempotencyKey, `${entity}.review`, { entityId: id, ...input }, async () => {
                await this.mutable(client, tripId);
                const latest = entity === "document" ? (await this.repository.documents(client, tripId)).find((doc) => doc.id === id) : await this.repository.facts(client, tripId);
                if (!latest || latest.id !== id)
                    throw new common_1.ConflictException("Доступна более новая версия. Откройте рейс заново.");
                if (latest.status !== "pending")
                    throw new common_1.ConflictException("Эта версия уже проверена. Для изменений загрузите новую версию.");
                const reviewId = (0, node_crypto_1.randomUUID)();
                await this.repository.insertReview(client, entity, { id: reviewId, entityId: id, decision: input.decision, reason: input.reason, actorId: current.id });
                await this.event(client, current, correlationId, `${entity === "document" ? "documents" : "operations.facts"}.reviewed`, entity, id, trip, { tripId, reviewId, decision: input.decision, hasReason: Boolean(input.reason) });
                return { id: reviewId };
            });
        });
    }
    async download(actor, documentId, correlationId) {
        const id = (0, validation_1.uuid)(documentId);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "dispatcher", "document_specialist"]);
            const tripId = await this.repository.entityTrip(client, "document", id);
            if (!tripId)
                throw new common_1.NotFoundException("Документ не найден.");
            const trip = await this.allowedTrip(client, current, tripId);
            if (current.role !== "driver" && !current.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, trip) && grant.personalDataVisible))
                throw new common_1.ForbiddenException("Для скачивания требуется доступ к персональным данным в области рейса.");
            const document = await this.repository.documentBytes(client, id);
            if (!document)
                throw new common_1.NotFoundException("Документ не найден.");
            await this.event(client, current, correlationId, "documents.downloaded", "document", id, trip, { tripId, sha256: document.sha256 });
            return { bytes: document.content, mimeType: document.mime_type, filename: `document-${id}.${document.mime_type === "application/pdf" ? "pdf" : document.mime_type === "image/png" ? "png" : "jpg"}` };
        });
    }
};
exports.WorkflowService = WorkflowService;
exports.WorkflowService = WorkflowService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(workflow_repository_1.WorkflowRepository)),
    __param(1, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(2, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [workflow_repository_1.WorkflowRepository,
        identity_repository_1.IdentityRepository,
        audit_service_1.AuditService])
], WorkflowService);
//# sourceMappingURL=workflow.service.js.map