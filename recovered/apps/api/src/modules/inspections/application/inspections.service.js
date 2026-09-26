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
exports.InspectionsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const trip_read_policy_1 = require("../../operations/domain/trip-read-policy");
const validation_1 = require("../../workflow/domain/validation");
const inspection_rules_1 = require("../domain/inspection-rules");
const inspections_repository_1 = require("../infra/inspections.repository");
let InspectionsService = class InspectionsService {
    repository;
    identity;
    audit;
    constructor(repository, identity, audit) {
        this.repository = repository;
        this.identity = identity;
        this.audit = audit;
    }
    async current(client, supplied, roles) {
        await this.identity.lockUsers(client, [supplied.id]);
        const actor = await this.identity.actorBySession(client, supplied.sessionId);
        if (!actor || actor.id !== supplied.id || actor.role !== supplied.role || actor.authVersion !== supplied.authVersion)
            throw new common_1.UnauthorizedException("Сессия недействительна.");
        if (!roles.includes(actor.role))
            throw new common_1.ForbiddenException("Действие недоступно для вашей роли.");
        return actor;
    }
    scoped(actor, scope) { return actor.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, scope)); }
    sensitive(actor, scope) {
        if (actor.role !== "driver" && !actor.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, scope) && grant.personalDataVisible))
            throw new common_1.ForbiddenException("Для просмотра материалов КО нужен доступ к персональным данным в этой области.");
    }
    deletionRole(actor, ...scopes) {
        if (!["access_admin", "mechanic"].includes(actor.role))
            return null;
        return scopes.every((scope) => actor.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, scope) && grant.personalDataVisible && (actor.role === "access_admin" || grant.inspectionPhotoDelete === true))) ? actor.role : null;
    }
    async editableTemplate(client, trip, input, latest) {
        const current = await this.repository.currentTemplate(client, trip);
        if (current?.id === input.templateId)
            return current;
        if (latest?.status === "returned" && latest.templateId === input.templateId) {
            const previous = await this.repository.template(client, input.templateId);
            if (previous && (0, trip_read_policy_1.tripScopeMatches)(previous.scope, trip))
                return previous;
        }
        throw new common_1.ConflictException("Шаблон КО обновился. Загрузите актуальные требования.");
    }
    async trip(client, actor, id) {
        const trip = await this.repository.trip(client, id);
        if (!trip || !this.scoped(actor, trip) || (actor.role === "driver" && !(await this.repository.assigned(client, id, actor.id))))
            throw new common_1.NotFoundException("Рейс не найден.");
        return trip;
    }
    async entity(client, actor, context) {
        if (!context || !this.scoped(actor, context) || (actor.role === "driver" && context.driverId !== actor.id))
            throw new common_1.NotFoundException("Материалы КО не найдены.");
        const trip = await this.trip(client, actor, context.tripId);
        this.sensitive(actor, trip);
        this.sensitive(actor, context);
        return { ...context, currentTrip: trip };
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
    async templates(actor) {
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["mechanic"]);
            return this.repository.catalog(client, current);
        });
    }
    async publish(actor, body, correlationId) {
        const input = (0, inspection_rules_1.templateInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["mechanic"]);
            if (!this.scoped(current, input.scope))
                throw new common_1.ForbiddenException("Шаблон вне вашей области доступа.");
            this.sensitive(current, input.scope);
            return this.once(client, current, input.idempotencyKey, "inspection.template.publish", input, async () => {
                await this.repository.lockScope(client, input.scope);
                const previous = await this.repository.currentTemplate(client, input.scope);
                if ((previous?.version ?? 0) !== input.expectedVersion)
                    throw new common_1.ConflictException("Шаблон уже изменён. Загрузите последнюю версию.");
                const id = (0, node_crypto_1.randomUUID)();
                await this.repository.insertTemplate(client, id, current.id, input);
                await this.event(client, current, correlationId, "inspections.template_published", "inspection_template", id, input.scope, { version: input.expectedVersion + 1, itemCount: input.items.length });
                return (await this.repository.template(client, id));
            });
        });
    }
    async state(actor, tripId, driverId) {
        const id = (0, validation_1.uuid)(tripId);
        const requestedDriverId = driverId === undefined ? null : (0, validation_1.uuid)(driverId);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "mechanic", "dispatcher", "access_admin"]);
            if (current.role === "driver" && requestedDriverId && requestedDriverId !== current.id)
                throw new common_1.ForbiddenException("Водитель может просматривать только свои осмотры.");
            const trip = await this.trip(client, current, id);
            this.sensitive(current, trip);
            const ids = await this.repository.submissionIds(client, id, current.role === "driver" ? current.id : requestedDriverId);
            const submissions = [];
            for (const submissionId of ids) {
                const context = await this.repository.submissionContext(client, submissionId);
                if (context && this.scoped(current, context)) {
                    this.sensitive(current, context);
                    const submission = await this.repository.submission(client, submissionId, this.deletionRole(current, context, trip));
                    if (submission)
                        submissions.push(submission);
                }
            }
            return { tripId: id, vehicle: { id: trip.vehicleId, name: trip.vehicleName }, businessDate: trip.businessDate, template: await this.repository.currentTemplate(client, trip), submissions };
        });
    }
    async upload(actor, tripId, body, correlationId) {
        const id = (0, validation_1.uuid)(tripId);
        const input = (0, inspection_rules_1.photoInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver"]);
            const trip = await this.trip(client, current, id);
            // Revision is a precondition for a new upload, not its content identity.
            // Keep the hash compatible with saved upload keys from earlier clients.
            return this.once(client, current, input.idempotencyKey, "inspection.photo.upload", { tripId: id, templateId: input.templateId, itemId: input.itemId, mimeType: input.mimeType, sha256: input.sha256 }, async () => {
                await this.repository.lockScope(client, trip);
                const latest = await this.repository.latest(client, id, current.id);
                (0, inspection_rules_1.ensureSubmittable)(latest, input.expectedRevision ?? latest?.revision ?? 0);
                const template = await this.editableTemplate(client, trip, input, latest);
                if (!template.items.some((item) => item.id === input.itemId))
                    return (0, validation_1.fail)("Пункт отсутствует в шаблоне КО.");
                if (await this.repository.photoCount(client, id, current.id) >= 200)
                    throw new common_1.ConflictException("Достигнут предел 200 фото КО для этого рейса.");
                const photo = await this.repository.insertPhoto(client, (0, node_crypto_1.randomUUID)(), id, current.id, input);
                await this.event(client, current, correlationId, "inspections.photo_uploaded", "inspection_photo", photo.id, trip, { tripId: id, templateId: template.id, itemId: input.itemId, sha256: input.sha256, byteSize: photo.byteSize });
                return photo;
            });
        });
    }
    async submit(actor, tripId, body, correlationId) {
        const id = (0, validation_1.uuid)(tripId);
        // The time window is checked against the locked latest revision inside once(),
        // so retries remain idempotent even after a correction has been sent.
        const input = (0, inspection_rules_1.submissionInput)(body, Date.now(), true);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver"]);
            const trip = await this.trip(client, current, id);
            return this.once(client, current, input.idempotencyKey, "inspection.submit", { tripId: id, ...input }, async () => {
                await this.repository.lockScope(client, trip);
                const latest = await this.repository.latest(client, id, current.id);
                (0, inspection_rules_1.ensureSubmittable)(latest, input.expectedRevision);
                (0, inspection_rules_1.validateSubmissionTime)(input, latest);
                const template = await this.editableTemplate(client, trip, input, latest);
                const { hasCriticalDefects } = (0, inspection_rules_1.validateAnswers)(template.items, input.answers);
                const photoIds = input.answers.flatMap((answer) => answer.photoIds);
                const photos = await this.repository.matchingPhotos(client, photoIds, id, current.id, template.id);
                if (photos.length !== photoIds.length || input.answers.some((answer) => answer.photoIds.some((photoId) => !photos.some((photo) => photo.id === photoId && photo.itemId === answer.itemId))))
                    throw new common_1.BadRequestException({ code: "INSPECTION_PHOTOS_UNAVAILABLE", message: "Некоторые фотографии удалены, срок их хранения истёк или они недоступны для этого пункта КО. Замените только эти фото.", unavailablePhotoIds: input.answers.flatMap((answer) => answer.photoIds.filter((photoId) => !photos.some((photo) => photo.id === photoId && photo.itemId === answer.itemId))) });
                const submissionId = (0, node_crypto_1.randomUUID)();
                await this.repository.insertSubmission(client, submissionId, trip, current.id, input, hasCriticalDefects);
                await this.event(client, current, correlationId, "inspections.submitted", "inspection_submission", submissionId, trip, { tripId: id, templateId: template.id, revision: input.expectedRevision + 1, photoCount: photoIds.length, answerCount: input.answers.length, hasCriticalDefects, clientOccurredAt: input.occurredAt });
                return (await this.repository.submission(client, submissionId));
            });
        });
    }
    async submission(actor, submissionId) {
        const id = (0, validation_1.uuid)(submissionId);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "mechanic", "dispatcher", "access_admin"]);
            const context = await this.entity(client, current, await this.repository.submissionContext(client, id));
            return (await this.repository.submission(client, id, this.deletionRole(current, context, context.currentTrip)));
        });
    }
    async review(actor, submissionId, body, correlationId) {
        const id = (0, validation_1.uuid)(submissionId);
        const input = (0, inspection_rules_1.inspectionReviewInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["mechanic"]);
            const context = await this.entity(client, current, await this.repository.submissionContext(client, id));
            return this.once(client, current, input.idempotencyKey, "inspection.review", { submissionId: id, ...input }, async () => {
                const submission = (await this.repository.submission(client, id));
                const latest = await this.repository.latest(client, context.tripId, context.driverId);
                if (latest?.id !== id)
                    throw new common_1.ConflictException("Проверять можно только последнюю версию КО.");
                const { hasCriticalDefects } = (0, inspection_rules_1.validateAnswers)(submission.template.items, submission.answers);
                (0, inspection_rules_1.ensureReviewAllowed)(submission.status, hasCriticalDefects, submission.answers, input);
                const review = await this.repository.insertReview(client, (0, node_crypto_1.randomUUID)(), id, current.id, input.decision, input.reason);
                await this.event(client, current, correlationId, "inspections.reviewed", "inspection_submission", id, context, { reviewId: review.id, decision: input.decision, hasReason: Boolean(input.reason), revision: submission.revision });
                return review;
            });
        });
    }
    async queue(actor, status, cursor) {
        const input = (0, inspection_rules_1.queueInput)(status, cursor);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["mechanic", "dispatcher", "access_admin"]);
            const rows = await this.repository.queue(client, current.id, input.status, input.cursor);
            const items = rows.slice(0, 50);
            const last = items[items.length - 1];
            return { items, nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ submittedAt: last.submittedAt, id: last.id })).toString("base64url") : null };
        });
    }
    async attention(actor) {
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver"]);
            return this.repository.attention(client, current.id);
        });
    }
    async deletePhoto(actor, photoId, body, correlationId) {
        const id = (0, validation_1.uuid)(photoId);
        const input = (0, inspection_rules_1.photoDeleteInput)(body);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["mechanic", "access_admin"]);
            const context = await this.entity(client, current, await this.repository.photoContext(client, id));
            if (!context.linked)
                throw new common_1.NotFoundException("Фото КО не найдено.");
            const role = this.deletionRole(current, context, context.currentTrip);
            if (!role)
                throw new common_1.ForbiddenException("Удаление фото доступно администратору и главному механику с отдельным правом в этой области.");
            return this.once(client, current, input.idempotencyKey, "inspection.photo.delete", { photoId: id }, async () => {
                const photo = await this.repository.lockPhoto(client, id, role);
                if (!photo)
                    throw new common_1.NotFoundException("Фото КО не найдено.");
                if (!photo.deletedAt && !photo.ageEligible)
                    throw new common_1.ForbiddenException("Главный механик может удалить фото через один календарный месяц после загрузки.");
                const deleted = photo.deletedAt ? photo : await this.repository.deletePhoto(client, id, current.id);
                if (!photo.deletedAt)
                    await this.event(client, current, correlationId, "inspections.photo_deleted", "inspection_photo", id, context, { tripId: context.tripId, templateId: context.templateId, itemId: context.itemId, sha256: context.sha256 });
                return { id, deletedAt: deleted.deletedAt.toISOString(), deletedBy: deleted.deletedBy, deletionReason: deleted.deletionReason, autoDeleteAt: photo.autoDeleteAt.toISOString(), deleteAvailableAt: photo.deleteAvailableAt.toISOString(), canDelete: false };
            });
        });
    }
    async download(actor, photoId, correlationId) {
        const id = (0, validation_1.uuid)(photoId);
        return this.repository.database.transaction(async (client) => {
            const current = await this.current(client, actor, ["driver", "mechanic", "dispatcher", "access_admin"]);
            const photo = await this.repository.photoContext(client, id);
            await this.entity(client, current, photo);
            if (!photo || photo.deletedAt || (current.role !== "driver" && !photo.linked))
                throw new common_1.NotFoundException("Фото КО не найдено.");
            const stored = await this.repository.photoBytes(client, id);
            if (!stored)
                throw new common_1.NotFoundException("Фото КО удалено или не найдено.");
            await this.event(client, current, correlationId, "inspections.photo_downloaded", "inspection_photo", id, photo, { tripId: photo.tripId, templateId: photo.templateId, sha256: stored.sha256 });
            return { bytes: stored.content, mimeType: stored.mimeType, sha256: stored.sha256, filename: `inspection-${id}.${stored.mimeType === "image/webp" ? "webp" : stored.mimeType === "image/png" ? "png" : "jpg"}` };
        });
    }
};
exports.InspectionsService = InspectionsService;
exports.InspectionsService = InspectionsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(inspections_repository_1.InspectionsRepository)),
    __param(1, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(2, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [inspections_repository_1.InspectionsRepository,
        identity_repository_1.IdentityRepository,
        audit_service_1.AuditService])
], InspectionsService);
//# sourceMappingURL=inspections.service.js.map
