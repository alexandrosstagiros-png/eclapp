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
exports.PricingService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const finance_rules_1 = require("../domain/finance-rules");
const pricing_rules_1 = require("../domain/pricing-rules");
// JSONB reorders object keys; sort recursively so evidence hashes survive a DB round trip.
const digest = (value) => (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry)).digest("hex");
const scopeFilter = (alias, parameter) => `EXISTS (SELECT 1 FROM jsonb_to_recordset($${parameter}::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid) WHERE ${alias}.legal_entity_id=g."legalEntityId" AND ${alias}.region_id=g."regionId" AND ${alias}.project_id=g."projectId" AND ${alias}.responsibility_scope_id=g."responsibilityScopeId")`;
const tariffSelection = `t.id,t.series_id AS "seriesId",t.version,t.previous_version_id AS "previousVersionId",t.project_id AS "projectId",t.responsibility_scope_id AS "responsibilityScopeId",t.name,t.side,t.contract_reference AS "contractReference",t.effective_from::text AS "effectiveFrom",t.effective_to::text AS "effectiveTo",t.source_text AS "sourceText",t.terms_note AS "termsNote",t.amounts_are_net AS "amountsAreNet",t.rules,t.engine_version AS "engineVersion",t.created_at AS "createdAt",p.published_at AS "publishedAt",CASE WHEN p.tariff_id IS NULL THEN 'draft' ELSE 'published' END AS status`;
const unknownResult = (code, message) => ({ engineVersion: "route-v1", lines: [], totalKopecks: null, issues: [{ code, message }] });
const iso = (value) => value instanceof Date ? value.toISOString() : value;
let PricingService = class PricingService {
    database;
    audit;
    identity;
    constructor(database, audit, identity) {
        this.database = database;
        this.audit = audit;
        this.identity = identity;
    }
    grants(actor) {
        const grants = (0, finance_rules_1.financeGrants)(actor);
        if (!grants.length)
            throw new common_1.ForbiddenException({ code: "FINANCE_FORBIDDEN", message: "Нет доступа к финансам." });
        return grants;
    }
    // Lock the user before business records, matching the access-management/workflow order.
    // Even reads recheck the session and current grants inside their transaction.
    async transaction(actor, operation) {
        this.grants(actor);
        return this.database.transaction(async (client) => {
            await this.identity.lockUsers(client, [actor.id]);
            const current = await this.identity.actorBySession(client, actor.sessionId);
            if (!current || current.id !== actor.id || current.authVersion !== actor.authVersion || current.role !== actor.role)
                throw new common_1.UnauthorizedException({ code: "SESSION_EXPIRED", message: "Сессия недействительна." });
            this.grants(current);
            return operation(client, current);
        });
    }
    approver(actor) {
        if (actor.role !== "document_specialist")
            throw new common_1.ForbiddenException({ code: "PRICING_APPROVAL_FORBIDDEN", message: "Утверждение доступно специалисту по документам с финансовыми правами." });
    }
    notFound() { throw new common_1.NotFoundException({ code: "PRICING_NOT_FOUND", message: "Тариф или расчёт не найден." }); }
    conflict(code, message) { throw new common_1.ConflictException({ code, message }); }
    async scope(client, actor, requested) {
        const row = (await client.query(`SELECT p.legal_entity_id,p.region_id,p.id AS project_id,s.id AS responsibility_scope_id FROM projects p JOIN responsibility_scopes s ON s.project_id=p.id WHERE p.id=$1 AND s.id=$2`, [requested.projectId, requested.responsibilityScopeId])).rows[0];
        if (!row || !this.grants(actor).some((grant) => grant.legalEntityId === row.legal_entity_id && grant.regionId === row.region_id && grant.projectId === row.project_id && grant.responsibilityScopeId === row.responsibility_scope_id))
            this.notFound();
        return row;
    }
    async event(client, actor, action, entityType, entityId, scope, metadata) {
        await this.audit.append(client, { actorId: actor.id, channel: actor.channel, action, entityType, entityId, correlationId: (0, node_crypto_1.randomUUID)(), scope: { legalEntityId: scope.legal_entity_id, regionId: scope.region_id, projectId: scope.project_id, responsibilityScopeId: scope.responsibility_scope_id }, metadata });
    }
    async replay(client, actor, key, operation, requestHash) {
        const row = (await client.query("SELECT operation,request_hash,entity_id FROM pricing_requests WHERE actor_id=$1 AND idempotency_key=$2", [actor.id, key])).rows[0];
        if (!row)
            return null;
        if (row.operation !== operation || row.request_hash !== requestHash)
            this.conflict("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого запроса.");
        return row.entity_id;
    }
    async remember(client, actor, key, operation, requestHash, id) {
        await client.query("INSERT INTO pricing_requests(actor_id,idempotency_key,operation,request_hash,entity_id) VALUES($1,$2,$3,$4,$5)", [actor.id, key, operation, requestHash, id]);
    }
    toTariff(row) { return { ...row, createdAt: iso(row.createdAt), publishedAt: iso(row.publishedAt) }; }
    async tariff(client, actor, id) {
        const row = (await client.query(`SELECT ${tariffSelection} FROM pricing_tariffs t LEFT JOIN pricing_tariff_publications p ON p.tariff_id=t.id WHERE t.id=$1 AND ${scopeFilter("t", 2)}`, [id, JSON.stringify(this.grants(actor))])).rows[0];
        if (!row)
            this.notFound();
        return this.toTariff(row);
    }
    async tariffs(actor) {
        return this.transaction(actor, async (client, current) => ({ items: (await client.query(`SELECT ${tariffSelection} FROM pricing_tariffs t LEFT JOIN pricing_tariff_publications p ON p.tariff_id=t.id WHERE ${scopeFilter("t", 1)} ORDER BY t.created_at DESC,t.id LIMIT 500`, [JSON.stringify(this.grants(current))])).rows.map((row) => this.toTariff(row)) }));
    }
    async createTariff(actor, body) {
        const input = (0, pricing_rules_1.parsePricingTariffInput)(body);
        return this.transaction(actor, async (client, current) => {
            const scope = await this.scope(client, current, input);
            const requestHash = digest(input);
            const replay = await this.replay(client, current, input.idempotencyKey, "tariff.create", requestHash);
            if (replay)
                return this.tariff(client, current, replay);
            const id = (0, node_crypto_1.randomUUID)();
            let seriesId = id;
            let version = 1;
            if (input.previousVersionId) {
                const previous = await this.tariff(client, current, input.previousVersionId);
                if (previous.projectId !== input.projectId || previous.responsibilityScopeId !== input.responsibilityScopeId || previous.side !== input.side)
                    throw new common_1.BadRequestException({ code: "PRICING_VERSION_SCOPE", message: "Новая версия должна сохранить область доступа и сторону тарифа." });
                seriesId = previous.seriesId;
                await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`pricing-series:${seriesId}`]);
                const latest = (await client.query("SELECT id,version FROM pricing_tariffs WHERE series_id=$1 ORDER BY version DESC LIMIT 1", [seriesId])).rows[0];
                if (latest.id !== previous.id)
                    this.conflict("PRICING_VERSION_CHANGED", "У тарифа появилась новая версия. Обновите список.");
                version = latest.version + 1;
            }
            await client.query(`INSERT INTO pricing_tariffs(id,series_id,version,previous_version_id,legal_entity_id,region_id,project_id,responsibility_scope_id,name,side,contract_reference,effective_from,effective_to,source_text,terms_note,amounts_are_net,rules,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)`, [id, seriesId, version, input.previousVersionId, scope.legal_entity_id, scope.region_id, input.projectId, input.responsibilityScopeId, input.name, input.side, input.contractReference, input.effectiveFrom, input.effectiveTo, input.sourceText, input.termsNote, input.amountsAreNet, JSON.stringify(input.rules), current.id]);
            await this.remember(client, current, input.idempotencyKey, "tariff.create", requestHash, id);
            await this.event(client, current, "finance.pricing_tariff_created", "pricing_tariff", id, scope, { requestHash, seriesId, version, side: input.side, engineVersion: "route-v1", sourceHash: digest(input.sourceText), termsHash: digest(input.termsNote) });
            return this.tariff(client, current, id);
        });
    }
    async publish(actor, id, body) {
        const input = (0, pricing_rules_1.parsePricingPublishInput)(body);
        return this.transaction(actor, async (client, current) => {
            this.approver(current);
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`pricing-publication:${id}`]);
            const tariff = await this.tariff(client, current, id);
            const requestHash = digest({ id, ...input });
            if (await this.replay(client, current, input.idempotencyKey, "tariff.publish", requestHash))
                return tariff;
            if (tariff.status === "published")
                this.conflict("PRICING_ALREADY_PUBLISHED", "Версия тарифа уже утверждена.");
            if (!tariff.amountsAreNet || !tariff.contractReference.trim() || !tariff.sourceText.trim() || !tariff.termsNote.trim())
                throw new common_1.BadRequestException({ code: "PRICING_PUBLICATION_INCOMPLETE", message: "Для утверждения подтвердите суммы без НДС, укажите договор, исходные условия и пояснение правил." });
            await client.query("INSERT INTO pricing_tariff_publications(tariff_id,published_by) VALUES($1,$2)", [id, current.id]);
            await this.remember(client, current, input.idempotencyKey, "tariff.publish", requestHash, id);
            const scope = await this.scope(client, current, tariff);
            await this.event(client, current, "finance.pricing_tariff_published", "pricing_tariff", id, scope, { requestHash, version: tariff.version, definitionHash: digest(tariff) });
            return this.tariff(client, current, id);
        });
    }
    async preview(actor, body) {
        const input = (0, pricing_rules_1.parsePricingPreviewInput)(body);
        return this.transaction(actor, async () => (0, pricing_rules_1.calculatePricing)(input.rules, input.facts));
    }
    async trip(client, actor, id) {
        const row = (await client.query(`SELECT t.*,t.business_date::text AS business_date FROM trips t WHERE t.id=$1 AND ${scopeFilter("t", 2)} FOR UPDATE`, [id, JSON.stringify(this.grants(actor))])).rows[0];
        if (!row)
            this.notFound();
        return row;
    }
    async facts(client, tripId) {
        return (await client.query(`SELECT f.*,(SELECT id FROM workflow_fact_reviews WHERE facts_id=f.id ORDER BY reviewed_at DESC,id DESC LIMIT 1) AS review_id FROM workflow_current_facts f WHERE f.trip_id=$1`, [tripId])).rows[0] ?? null;
    }
    async documentEvidence(client, tripId) {
        return (await client.query(`SELECT d.id,d.kind,d.revision,d.sha256,r.id AS "reviewId" FROM workflow_current_documents d JOIN LATERAL (SELECT id FROM workflow_document_reviews WHERE document_id=d.id ORDER BY reviewed_at DESC,id DESC LIMIT 1) r ON true WHERE d.trip_id=$1 AND d.kind IN ('delivery_note','waybill') AND d.status='accepted' ORDER BY d.kind`, [tripId])).rows;
    }
    async registryLocked(client, tripId) {
        return Boolean((await client.query("SELECT 1 FROM finance_confirmed_trips WHERE trip_id=$1", [tripId])).rowCount);
    }
    async currentRevision(client, tripId) {
        return (await client.query("SELECT coalesce(max(revision),0)::integer AS revision FROM pricing_calculations WHERE trip_id=$1", [tripId])).rows[0].revision;
    }
    async calculation(client, id, facts) {
        const row = (await client.query("SELECT snapshot FROM pricing_calculations WHERE id=$1", [id])).rows[0];
        if (!row)
            this.notFound();
        const confirmations = (await client.query("SELECT part,confirmed_at,evidence FROM pricing_confirmations WHERE calculation_id=$1", [id])).rows;
        const clientConfirmation = confirmations.find((entry) => entry.part === "client");
        const expensesConfirmation = confirmations.find((entry) => entry.part === "expenses");
        const factsChanged = row.snapshot.input.factsId !== (facts?.id ?? null);
        const approvalChanged = (confirmation) => Boolean(confirmation && (!facts || facts.status !== "approved" || confirmation.evidence.factsReviewId !== facts.review_id));
        let clientStale = factsChanged || approvalChanged(clientConfirmation);
        const expensesStale = factsChanged || approvalChanged(expensesConfirmation);
        if (clientConfirmation && digest(clientConfirmation.evidence.documents) !== digest(await this.documentEvidence(client, row.snapshot.tripId)))
            clientStale = true;
        return { ...row.snapshot, clientStale, expensesStale, stale: clientStale || expensesStale, clientConfirmedAt: iso(clientConfirmation?.confirmed_at ?? null), expensesConfirmedAt: iso(expensesConfirmation?.confirmed_at ?? null) };
    }
    async tripState(actor, tripId) {
        return this.transaction(actor, async (client, current) => {
            const trip = await this.trip(client, current, tripId);
            const facts = await this.facts(client, tripId);
            const rows = (await client.query(`SELECT c.id,c.revision,c.created_at AS "createdAt",(SELECT confirmed_at FROM pricing_confirmations WHERE calculation_id=c.id AND part='client') AS "clientConfirmedAt",(SELECT confirmed_at FROM pricing_confirmations WHERE calculation_id=c.id AND part='expenses') AS "expensesConfirmedAt" FROM pricing_calculations c WHERE c.trip_id=$1 ORDER BY c.revision DESC LIMIT 100`, [tripId])).rows;
            return { tripId, businessDate: trip.business_date, facts: facts ? { id: facts.id, revision: facts.revision, status: facts.status, stops: facts.stops, kilometersHundredths: facts.kilometers_hundredths, minutes: facts.minutes } : null, current: rows[0] ? await this.calculation(client, rows[0].id, facts) : null, history: rows.map((row) => ({ id: row.id, revision: row.revision, createdAt: iso(row.createdAt), clientConfirmedAt: iso(row.clientConfirmedAt), expensesConfirmedAt: iso(row.expensesConfirmedAt) })), registryLocked: await this.registryLocked(client, tripId) };
        });
    }
    async calculationDetail(actor, id) {
        return this.transaction(actor, async (client, current) => {
            const row = (await client.query(`SELECT c.trip_id FROM pricing_calculations c JOIN trips t ON t.id=c.trip_id WHERE c.id=$1 AND ${scopeFilter("t", 2)}`, [id, JSON.stringify(this.grants(current))])).rows[0];
            if (!row)
                this.notFound();
            await this.trip(client, current, row.trip_id);
            return this.calculation(client, id, await this.facts(client, row.trip_id));
        });
    }
    async selectedTariff(client, actor, trip, id, side) {
        if (!id)
            return null;
        const tariff = await this.tariff(client, actor, id);
        if (tariff.projectId !== trip.project_id || tariff.responsibilityScopeId !== trip.responsibility_scope_id)
            this.notFound();
        if (tariff.side !== side || tariff.status !== "published" || trip.business_date < tariff.effectiveFrom || (tariff.effectiveTo !== null && trip.business_date >= tariff.effectiveTo))
            throw new common_1.BadRequestException({ code: "PRICING_TARIFF_NOT_APPLICABLE", message: "Выберите утверждённый тариф нужной стороны, действующий на дату рейса." });
        return tariff;
    }
    async evaluate(client, actor, trip, facts, input) {
        const revision = await this.currentRevision(client, trip.id);
        if (input.expectedRevision !== revision)
            this.conflict("PRICING_REVISION_CHANGED", "Расчёт уже изменился. Обновите карточку рейса.");
        if (input.factsId !== (facts?.id ?? null))
            this.conflict("PRICING_FACTS_CHANGED", "Факты рейса изменились. Обновите карточку и повторите расчёт.");
        const clientTariff = await this.selectedTariff(client, actor, trip, input.clientTariffId, "client");
        const executorTariff = await this.selectedTariff(client, actor, trip, input.executorTariffId, "executor");
        const pricingFacts = facts ? { stops: facts.stops, kilometersHundredths: facts.kilometers_hundredths, minutes: facts.minutes, specialStop: input.specialStop, warehouseRadiusHundredths: input.warehouseRadiusHundredths, mkadRadiusHundredths: input.mkadRadiusHundredths, legDistanceHundredths: input.legDistanceHundredths } : null;
        const clientResult = !clientTariff ? unknownResult("CLIENT_TARIFF_MISSING", "Не выбран тариф клиента.") : !pricingFacts ? unknownResult("FACTS_MISSING", "Не внесены факты рейса.") : (0, pricing_rules_1.calculatePricing)(clientTariff.rules, pricingFacts);
        const executorResult = input.executorManualKopecks !== null ? { engineVersion: "route-v1", lines: [{ code: "executor_manual", label: "Начисление исполнителю вручную", quantity: 1, unit: "trip", rateKopecks: input.executorManualKopecks, amountKopecks: input.executorManualKopecks, explanation: input.executorManualReason }], totalKopecks: input.executorManualKopecks, issues: [] } : !executorTariff ? unknownResult("EXECUTOR_AMOUNT_MISSING", "Не выбран тариф и не указано начисление исполнителю.") : !pricingFacts ? unknownResult("FACTS_MISSING", "Не внесены факты рейса.") : (0, pricing_rules_1.calculatePricing)(executorTariff.rules, pricingFacts);
        const remainderKopecks = clientResult.totalKopecks === null || executorResult.totalKopecks === null || input.directCostsKopecks === null ? null : Number(BigInt(clientResult.totalKopecks) - BigInt(executorResult.totalKopecks) - BigInt(input.directCostsKopecks));
        return { id: (0, node_crypto_1.randomUUID)(), tripId: trip.id, revision: revision + 1, createdAt: new Date().toISOString(), input, facts: pricingFacts, factsRevision: facts?.revision ?? null, clientTariff, executorTariff, client: clientResult, executor: executorResult, directCostsKopecks: input.directCostsKopecks, remainderKopecks, clientConfirmedAt: null, expensesConfirmedAt: null, clientStale: false, expensesStale: false, stale: false };
    }
    async previewTrip(actor, tripId, body) {
        const input = (0, pricing_rules_1.parseTripPricingInput)(body);
        return this.transaction(actor, async (client, current) => {
            const trip = await this.trip(client, current, tripId);
            return this.evaluate(client, current, trip, await this.facts(client, tripId), input);
        });
    }
    async calculateTrip(actor, tripId, body) {
        const input = (0, pricing_rules_1.parseTripPricingInput)(body);
        return this.transaction(actor, async (client, current) => {
            const trip = await this.trip(client, current, tripId);
            const facts = await this.facts(client, tripId);
            const requestHash = digest({ tripId, ...input });
            const replay = await this.replay(client, current, input.idempotencyKey, "trip.calculate", requestHash);
            if (replay)
                return this.calculation(client, replay, facts);
            if (await this.registryLocked(client, tripId))
                this.conflict("PRICING_REGISTRY_LOCKED", "Рейс уже включён в подтверждённый реестр. Изменение финансового основания заблокировано.");
            const result = await this.evaluate(client, current, trip, facts, input);
            await client.query("INSERT INTO pricing_calculations(id,trip_id,revision,facts_id,client_tariff_id,executor_tariff_id,snapshot,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)", [result.id, tripId, result.revision, input.factsId, input.clientTariffId, input.executorTariffId, JSON.stringify(result), current.id, result.createdAt]);
            await this.remember(client, current, input.idempotencyKey, "trip.calculate", requestHash, result.id);
            await this.event(client, current, "finance.trip_pricing_calculated", "pricing_calculation", result.id, trip, { tripId, requestHash, revision: result.revision, factsId: input.factsId, clientTariffId: input.clientTariffId, executorTariffId: input.executorTariffId, engineVersion: "route-v1", calculationHash: digest(result) });
            return result;
        });
    }
    async confirm(actor, id, body) {
        const input = (0, pricing_rules_1.parsePricingConfirmInput)(body);
        return this.transaction(actor, async (client, current) => {
            this.approver(current);
            const row = (await client.query(`SELECT c.trip_id,c.snapshot FROM pricing_calculations c JOIN trips t ON t.id=c.trip_id WHERE c.id=$1 AND ${scopeFilter("t", 2)}`, [id, JSON.stringify(this.grants(current))])).rows[0];
            if (!row)
                this.notFound();
            const trip = await this.trip(client, current, row.trip_id);
            const facts = await this.facts(client, trip.id);
            const result = await this.calculation(client, id, facts);
            const requestHash = digest({ id, ...input });
            if (await this.replay(client, current, input.idempotencyKey, "calculation.confirm", requestHash))
                return result;
            if ((input.part === "client" ? result.clientConfirmedAt : result.expensesConfirmedAt) !== null)
                this.conflict("PRICING_ALREADY_CONFIRMED", "Эта часть расчёта уже подтверждена.");
            if (result.revision !== await this.currentRevision(client, trip.id))
                this.conflict("PRICING_REVISION_CHANGED", "Подтвердить можно только последний расчёт.");
            if ((input.part === "client" ? result.clientStale : result.expensesStale) || !facts || facts.status !== "approved")
                this.conflict("PRICING_FACTS_NOT_APPROVED", "Нужны актуальные одобренные факты и основания. После изменения подтверждённых данных сохраните новый расчёт.");
            if (await this.registryLocked(client, trip.id))
                this.conflict("PRICING_REGISTRY_LOCKED", "Рейс уже включён в подтверждённый реестр.");
            const evidence = { engineVersion: "route-v1", calculationHash: digest(row.snapshot), factsId: facts.id, factsRevision: facts.revision, factsReviewId: facts.review_id };
            if (input.part === "client") {
                if (result.client.totalKopecks === null)
                    this.conflict("PRICING_CLIENT_INCOMPLETE", "Не все условия начисления клиенту определены.");
                const attendance = (await client.query("SELECT id FROM workflow_attendance WHERE trip_id=$1 AND kind='check_out' ORDER BY id", [trip.id])).rows;
                const documents = await this.documentEvidence(client, trip.id);
                if (!attendance.length || documents.length !== 2)
                    this.conflict("PRICING_CLIENT_EVIDENCE_REQUIRED", "Нужны завершение рейса и принятые накладная и путевой лист.");
                evidence.checkoutIds = attendance.map((entry) => entry.id);
                evidence.documents = documents;
            }
            else if (result.executor.totalKopecks === null || result.directCostsKopecks === null)
                this.conflict("PRICING_EXPENSES_INCOMPLETE", "Укажите начисление исполнителю и прочие прямые затраты, включая явный ноль.");
            await client.query("INSERT INTO pricing_confirmations(calculation_id,part,evidence,confirmed_by) VALUES($1,$2,$3::jsonb,$4)", [id, input.part, JSON.stringify(evidence), current.id]);
            await this.remember(client, current, input.idempotencyKey, "calculation.confirm", requestHash, id);
            await this.event(client, current, "finance.trip_pricing_confirmed", "pricing_calculation", id, trip, { tripId: trip.id, requestHash, part: input.part, revision: result.revision, factsId: facts.id, calculationHash: evidence.calculationHash, evidenceHash: digest(evidence) });
            return this.calculation(client, id, facts);
        });
    }
};
exports.PricingService = PricingService;
exports.PricingService = PricingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, audit_service_1.AuditService, identity_repository_1.IdentityRepository])
], PricingService);
//# sourceMappingURL=pricing.service.js.map