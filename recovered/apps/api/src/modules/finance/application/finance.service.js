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
exports.FinanceService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const finance_rules_1 = require("../domain/finance-rules");
const hash = (value) => (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
const scopeColumns = (alias, parameter) => `EXISTS (SELECT 1 FROM jsonb_to_recordset($${parameter}::jsonb) AS g("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid) WHERE ${alias}.legal_entity_id=g."legalEntityId" AND ${alias}.region_id=g."regionId" AND ${alias}.project_id=g."projectId" AND ${alias}.responsibility_scope_id=g."responsibilityScopeId")`;
const registryColumns = `r.id,r.project_id AS "projectId",r.responsibility_scope_id AS "responsibilityScopeId",r.status,r.authority,
  r.created_at AS "createdAt",r.confirmed_at AS "confirmedAt",
  (SELECT sum(claimed_kopecks)::float8 FROM finance_registry_rows WHERE registry_id=r.id) AS "totalClaimedKopecks",
  (SELECT CASE WHEN count(expected_kopecks)=count(*) THEN sum(expected_kopecks)::float8 ELSE NULL END FROM finance_registry_rows WHERE registry_id=r.id) AS "totalExpectedKopecks",
  (SELECT count(*)::integer FROM finance_registry_rows WHERE registry_id=r.id) AS "rowCount"`;
const jobColumns = `j.id,j.registry_id AS "registryId",j.status,j.attempts,j.created_at AS "createdAt",j.next_attempt_at AS "nextAttemptAt",j.acknowledged_at AS "acknowledgedAt",j.source_document_id AS "sourceDocumentId",j.last_error_code AS "lastErrorCode",j.delivery_mode AS "deliveryMode"`;
const tariffColumns = `t.id,t.project_id AS "projectId",t.responsibility_scope_id AS "responsibilityScopeId",t.version,
  t.effective_from::text AS "effectiveFrom",t.effective_to::text AS "effectiveTo",t.base_kopecks::float8 AS "baseKopecks",
  t.per_stop_kopecks::float8 AS "perStopKopecks",t.per_waiting_minute_kopecks::float8 AS "perWaitingMinuteKopecks",t.authority,t.formula_version AS "formulaVersion"`;
let FinanceService = class FinanceService {
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
    async write(actor, operation) {
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
    async scope(client, actor, requested) {
        const result = await client.query(`SELECT p.legal_entity_id,p.region_id,p.id AS project_id,s.id AS responsibility_scope_id FROM projects p JOIN responsibility_scopes s ON s.project_id=p.id WHERE p.id=$1 AND s.id=$2`, [requested.projectId, requested.responsibilityScopeId]);
        const scope = result.rows[0];
        if (!scope || !this.grants(actor).some((grant) => grant.legalEntityId === scope.legal_entity_id && grant.regionId === scope.region_id && grant.projectId === scope.project_id && grant.responsibilityScopeId === scope.responsibility_scope_id))
            this.notFound();
        return scope;
    }
    notFound() { throw new common_1.NotFoundException({ code: "FINANCE_NOT_FOUND", message: "Финансовая запись не найдена." }); }
    conflict(code, message) { throw new common_1.ConflictException({ code, message }); }
    scopeEvent(scope) { return { legalEntityId: scope.legal_entity_id, regionId: scope.region_id, projectId: scope.project_id, responsibilityScopeId: scope.responsibility_scope_id }; }
    async event(client, actor, action, entityType, entityId, scope, metadata = {}) {
        await this.audit.append(client, { actorId: actor.id, channel: actor.channel, action, entityType, entityId, scope: this.scopeEvent(scope), correlationId: (0, node_crypto_1.randomUUID)(), metadata });
    }
    parseCsv(csv) {
        try {
            return (0, finance_rules_1.parseRegistryCsv)(csv);
        }
        catch (error) {
            throw new common_1.BadRequestException({ code: error instanceof Error ? error.message : "CSV_INVALID", message: "Некорректный CSV. Нужны заголовки trip_reference,amount_rub, не более 500 строк и 256 КиБ." });
        }
    }
    async tariffs(actor) {
        return this.write(actor, async (client, current) => ({ items: (await client.query(`SELECT ${tariffColumns} FROM finance_tariffs t WHERE ${scopeColumns("t", 1)} ORDER BY t.effective_from DESC,t.id LIMIT 200`, [JSON.stringify(this.grants(current))])).rows }));
    }
    async createTariff(actor, input) {
        if (!(0, finance_rules_1.isCalendarDate)(input.effectiveFrom) || (input.effectiveTo != null && (!(0, finance_rules_1.isCalendarDate)(input.effectiveTo) || input.effectiveTo <= input.effectiveFrom)))
            throw new common_1.BadRequestException({ code: "TARIFF_DATES", message: "Укажите реальные даты; дата окончания не включается и должна быть позже начала." });
        return this.write(actor, async (client, current) => {
            const scope = await this.scope(client, current, input);
            const requestHash = hash({ projectId: input.projectId, responsibilityScopeId: input.responsibilityScopeId, effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, baseKopecks: input.baseKopecks, perStopKopecks: input.perStopKopecks, perWaitingMinuteKopecks: input.perWaitingMinuteKopecks });
            const existing = await client.query(`SELECT ${tariffColumns},t.request_hash FROM finance_tariffs t WHERE t.created_by=$1 AND t.idempotency_key=$2`, [current.id, input.idempotencyKey]);
            if (existing.rows[0]) {
                if (existing.rows[0].request_hash !== requestHash)
                    this.conflict("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого запроса.");
                const { request_hash: ignored, ...tariff } = existing.rows[0];
                return tariff;
            }
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`finance-tariff:${input.projectId}:${input.responsibilityScopeId}`]);
            const overlap = await client.query(`SELECT id FROM finance_tariffs WHERE project_id=$1 AND responsibility_scope_id=$2 AND daterange(effective_from,effective_to,'[)') && daterange($3::date,$4::date,'[)')`, [input.projectId, input.responsibilityScopeId, input.effectiveFrom, input.effectiveTo ?? null]);
            if (overlap.rowCount)
                this.conflict("TARIFF_OVERLAP", "Период пересекается с существующей версией тарифа. Создайте следующий непересекающийся период.");
            const id = (0, node_crypto_1.randomUUID)();
            await client.query(`INSERT INTO finance_tariffs(id,legal_entity_id,region_id,project_id,responsibility_scope_id,version,effective_from,effective_to,base_kopecks,per_stop_kopecks,per_waiting_minute_kopecks,created_by,idempotency_key,request_hash)
        SELECT $1,$2,$3,$4,$5,coalesce(max(version),0)+1,$6,$7,$8,$9,$10,$11,$12,$13 FROM finance_tariffs WHERE project_id=$4 AND responsibility_scope_id=$5`, [id, scope.legal_entity_id, scope.region_id, input.projectId, input.responsibilityScopeId, input.effectiveFrom, input.effectiveTo ?? null, input.baseKopecks, input.perStopKopecks, input.perWaitingMinuteKopecks, current.id, input.idempotencyKey, requestHash]);
            await this.event(client, current, "finance.tariff_created", "tariff", id, scope, { requestHash, authority: "demo_manual", formulaVersion: "demo-v1" });
            return (await client.query(`SELECT ${tariffColumns} FROM finance_tariffs t WHERE t.id=$1`, [id])).rows[0];
        });
    }
    async evaluate(client, scope, parsed, registryId, lock = false) {
        const references = parsed.map((row) => row.tripReference);
        const trips = await client.query(`SELECT * FROM trips WHERE reference=ANY($1::text[]) AND legal_entity_id=$2 AND region_id=$3 AND project_id=$4 AND responsibility_scope_id=$5 ORDER BY id ${lock ? "FOR UPDATE" : ""}`, [references, scope.legal_entity_id, scope.region_id, scope.project_id, scope.responsibility_scope_id]);
        const byReference = new Map(trips.rows.map((trip) => [trip.reference, trip]));
        const evidence = await client.query(`SELECT t.id,t.business_date::text,
        EXISTS(SELECT 1 FROM workflow_attendance a WHERE a.trip_id=t.id AND a.kind='check_out') AS completed,
        (SELECT count(*)::integer FROM workflow_current_documents d WHERE d.trip_id=t.id AND d.status='accepted' AND d.kind IN ('delivery_note','waybill')) AS accepted_documents,
        f.id AS facts_id,f.revision AS facts_revision,f.status AS facts_status,f.stops,f.waiting_minutes,
        tariff.id AS tariff_id,tariff.version AS tariff_version,tariff.base_kopecks,tariff.per_stop_kopecks,tariff.per_waiting_minute_kopecks,
        EXISTS(SELECT 1 FROM finance_confirmed_trips ct WHERE ct.trip_id=t.id AND ($2::uuid IS NULL OR ct.registry_id<>$2)) AS already_confirmed,
        EXISTS(SELECT 1 FROM pricing_calculations pc WHERE pc.trip_id=t.id) AS has_pricing_calculation
      FROM trips t LEFT JOIN workflow_current_facts f ON f.trip_id=t.id
      LEFT JOIN finance_tariffs tariff ON tariff.project_id=t.project_id AND tariff.responsibility_scope_id=t.responsibility_scope_id AND t.business_date>=tariff.effective_from AND (tariff.effective_to IS NULL OR t.business_date<tariff.effective_to)
      WHERE t.id=ANY($1::uuid[])`, [trips.rows.map((trip) => trip.id), registryId ?? null]);
        const byId = new Map(evidence.rows.map((row) => [row.id, row]));
        const rows = parsed.map((row) => {
            const trip = byReference.get(row.tripReference);
            const data = trip ? byId.get(trip.id) : undefined;
            const result = { ...row, reasons: [...row.reasons], tripId: trip?.id ?? null, expectedKopecks: null, factsId: data?.facts_id ?? null, tariffId: data?.tariff_id ?? null };
            if (!data) {
                result.reasons.push("unknown_trip");
                return result;
            }
            if (!data.completed)
                result.reasons.push("trip_not_completed");
            if (data.facts_status !== "approved")
                result.reasons.push("facts_not_approved");
            if (data.accepted_documents !== 2)
                result.reasons.push("documents_not_accepted");
            if (!data.tariff_id)
                result.reasons.push("tariff_missing");
            if (data.already_confirmed)
                result.reasons.push("already_confirmed");
            if (data.has_pricing_calculation) {
                result.reasons.push("pricing_registry_pending");
                result.tariffId = null;
            }
            if (!data.has_pricing_calculation && data.tariff_id && data.facts_status === "approved") {
                try {
                    result.expectedKopecks = (0, finance_rules_1.calculateDemoTariff)({ baseKopecks: Number(data.base_kopecks), perStopKopecks: Number(data.per_stop_kopecks), perWaitingMinuteKopecks: Number(data.per_waiting_minute_kopecks) }, { stops: data.stops, waitingMinutes: data.waiting_minutes });
                }
                catch {
                    throw new common_1.BadRequestException({ code: "CALCULATION_LIMIT", message: "Расчёт превышает допустимый предел. Проверьте тариф и фактические показатели." });
                }
                if (result.claimedKopecks !== null && result.claimedKopecks !== result.expectedKopecks)
                    result.reasons.push("amount_mismatch");
            }
            return result;
        });
        return { rows, canCommit: rows.every((row) => !row.reasons.some((reason) => ["unknown_trip", "duplicate_trip", "invalid_amount", "already_confirmed", "pricing_registry_pending"].includes(reason))), readyToConfirm: rows.every((row) => row.reasons.length === 0), authority: "demo_manual" };
    }
    async preview(actor, input) {
        const parsed = this.parseCsv(input.csv);
        return this.write(actor, async (client, current) => {
            const scope = await this.scope(client, current, input);
            const preview = await this.evaluate(client, scope, parsed);
            await this.event(client, current, "finance.registry_previewed", "registry", undefined, scope, { rowCount: preview.rows.length, sourceHash: hash(input.csv) });
            return preview;
        });
    }
    async createRegistry(actor, input) {
        const parsed = this.parseCsv(input.csv);
        return this.write(actor, async (client, current) => {
            const scope = await this.scope(client, current, input);
            const requestHash = hash({ projectId: input.projectId, responsibilityScopeId: input.responsibilityScopeId, csv: input.csv });
            const existing = await client.query("SELECT id,request_hash FROM finance_registries WHERE created_by=$1 AND idempotency_key=$2", [current.id, input.idempotencyKey]);
            if (existing.rows[0]) {
                if (existing.rows[0].request_hash !== requestHash)
                    this.conflict("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого запроса.");
                return this.detailInTransaction(client, current, existing.rows[0].id);
            }
            const preview = await this.evaluate(client, scope, parsed, undefined, true);
            if (!preview.canCommit)
                throw new common_1.BadRequestException({ code: "REGISTRY_INVALID_ROWS", message: "Исправьте ошибки строк. Расчёты конструктора требуют нового формата реестра и пока не передаются через учебный обмен 1С.", rows: preview.rows });
            const id = (0, node_crypto_1.randomUUID)();
            await client.query("INSERT INTO finance_registries(id,legal_entity_id,region_id,project_id,responsibility_scope_id,created_by,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [id, scope.legal_entity_id, scope.region_id, scope.project_id, scope.responsibility_scope_id, current.id, input.idempotencyKey, requestHash]);
            await client.query("INSERT INTO finance_registry_sources(registry_id,source_csv,sha256) VALUES($1,$2,$3)", [id, input.csv, (0, node_crypto_1.createHash)("sha256").update(input.csv, "utf8").digest("hex")]);
            for (const row of preview.rows)
                await client.query(`INSERT INTO finance_registry_rows(registry_id,row_number,trip_reference,trip_id,claimed_kopecks,expected_kopecks,facts_id,tariff_id,reasons) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [id, row.rowNumber, row.tripReference, row.tripId, row.claimedKopecks, row.expectedKopecks, row.factsId, row.tariffId, JSON.stringify(row.reasons)]);
            await this.event(client, current, "finance.registry_imported", "registry", id, scope, { rowCount: parsed.length, requestHash });
            return this.detailInTransaction(client, current, id);
        });
    }
    async registries(actor) {
        return this.write(actor, async (client, current) => ({ items: (await client.query(`SELECT ${registryColumns} FROM finance_registries r WHERE ${scopeColumns("r", 1)} ORDER BY r.created_at DESC,r.id LIMIT 100`, [JSON.stringify(this.grants(current))])).rows }));
    }
    async registry(client, actor, id, lock = false) {
        const result = await client.query(`SELECT r.* FROM finance_registries r WHERE r.id=$1 AND ${scopeColumns("r", 2)} ${lock ? "FOR UPDATE" : ""}`, [id, JSON.stringify(this.grants(actor))]);
        if (!result.rows[0])
            this.notFound();
        return result.rows[0];
    }
    async detailInTransaction(client, actor, id) {
        await this.registry(client, actor, id);
        const registry = (await client.query(`SELECT ${registryColumns} FROM finance_registries r WHERE id=$1`, [id])).rows[0];
        const rows = (await client.query(`SELECT row_number AS "rowNumber",trip_reference AS "tripReference",trip_id AS "tripId",claimed_kopecks::float8 AS "claimedKopecks",expected_kopecks::float8 AS "expectedKopecks",facts_id AS "factsId",tariff_id AS "tariffId",reasons FROM finance_registry_rows WHERE registry_id=$1 ORDER BY row_number`, [id])).rows;
        const job = (await client.query("SELECT id FROM integration_jobs WHERE registry_id=$1", [id])).rows[0];
        return { ...registry, rows, readyToConfirm: rows.length > 0 && rows.every((row) => !row.reasons.length), integrationJobId: job?.id ?? null };
    }
    async registryDetail(actor, id) {
        return this.write(actor, (client, current) => this.detailInTransaction(client, current, id));
    }
    async registrySource(actor, id) {
        return this.write(actor, async (client, current) => {
            const registry = await this.registry(client, current, id);
            const source = (await client.query("SELECT source_csv AS csv,sha256 FROM finance_registry_sources WHERE registry_id=$1", [id])).rows[0];
            if (!source)
                this.notFound();
            await this.event(client, current, "finance.sensitive_export", "registry", id, registry, { format: "original_csv", sha256: source.sha256 });
            return source;
        });
    }
    async recalculate(client, actor, registry) {
        const raw = (await client.query(`SELECT row_number AS "rowNumber",trip_reference AS "tripReference",claimed_kopecks::float8 AS "claimedKopecks" FROM finance_registry_rows WHERE registry_id=$1 ORDER BY row_number`, [registry.id])).rows;
        const preview = await this.evaluate(client, registry, raw.map((row) => ({ ...row, reasons: [] })), registry.id, true);
        for (const row of preview.rows)
            await client.query(`UPDATE finance_registry_rows SET expected_kopecks=$3,facts_id=$4,tariff_id=$5,reasons=$6::jsonb WHERE registry_id=$1 AND row_number=$2`, [registry.id, row.rowNumber, row.expectedKopecks, row.factsId, row.tariffId, JSON.stringify(row.reasons)]);
        await this.event(client, actor, "finance.registry_reconciled", "registry", registry.id, registry, { readyToConfirm: preview.readyToConfirm, mismatchRows: preview.rows.filter((row) => row.reasons.length).length });
        return preview;
    }
    async reconcile(actor, id) {
        return this.write(actor, async (client, current) => {
            const registry = await this.registry(client, current, id, true);
            if (registry.status === "confirmed")
                this.conflict("REGISTRY_IMMUTABLE", "Подтверждённый реестр неизменяем.");
            await this.recalculate(client, current, registry);
            return this.detailInTransaction(client, current, id);
        });
    }
    async confirm(actor, id, idempotencyKey) {
        return this.write(actor, async (client, current) => {
            const registry = await this.registry(client, current, id, true);
            if (registry.status === "confirmed") {
                if (registry.confirmation_key !== idempotencyKey)
                    this.conflict("REGISTRY_ALREADY_CONFIRMED", "Реестр уже подтверждён.");
                return this.detailInTransaction(client, current, id);
            }
            const preview = await this.recalculate(client, current, registry);
            if (!preview.readyToConfirm || !preview.rows.length)
                this.conflict("REGISTRY_UNRESOLVED", "Есть расхождения, непринятые документы или неподтверждённые факты. Подтверждение заблокировано.");
            const confirmedAt = new Date().toISOString();
            const jobId = (0, node_crypto_1.randomUUID)();
            const lines = (await client.query(`SELECT rr.trip_id AS "tripId",rr.trip_reference AS "tripReference",t.business_date::text AS "businessDate",rr.expected_kopecks::float8 AS "amountKopecks",rr.tariff_id AS "tariffId",tariff.version AS "tariffVersion",tariff.formula_version AS "formulaVersion",rr.facts_id AS "factsId",f.revision AS "factsRevision" FROM finance_registry_rows rr JOIN trips t ON t.id=rr.trip_id JOIN finance_tariffs tariff ON tariff.id=rr.tariff_id JOIN workflow_facts f ON f.id=rr.facts_id WHERE rr.registry_id=$1 ORDER BY rr.row_number`, [id])).rows;
            const payload = { schemaVersion: "transport.registry.v1", exchangeId: jobId, idempotencyKey: jobId, sourceSystem: "transport-operations", calculationAuthority: "demo_manual", currency: "RUB", amountUnit: "kopeck", registryId: id, confirmedAt, scope: this.scopeEvent(registry), totalKopecks: lines.reduce((sum, row) => sum + row.amountKopecks, 0), lines };
            await client.query("INSERT INTO finance_confirmed_trips(trip_id,registry_id) SELECT trip_id,registry_id FROM finance_registry_rows WHERE registry_id=$1", [id]);
            await client.query("UPDATE finance_registries SET status='confirmed',confirmed_at=$2,confirmed_by=$3,confirmation_key=$4 WHERE id=$1", [id, confirmedAt, current.id, idempotencyKey]);
            await client.query(`INSERT INTO integration_jobs(id,registry_id,legal_entity_id,region_id,project_id,responsibility_scope_id,payload,delivery_mode) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [jobId, id, registry.legal_entity_id, registry.region_id, registry.project_id, registry.responsibility_scope_id, JSON.stringify(payload), process.env.ONE_C_HTTP_ENABLED === "true" ? "http" : "manual"]);
            await this.event(client, current, "finance.registry_confirmed", "registry", id, registry, { totalKopecks: payload.totalKopecks, rows: lines.length, exchangeId: jobId, authority: "demo_manual" });
            await this.event(client, current, "integration.one_c_queued", "integration_job", jobId, registry, { registryId: id, deliveryMode: process.env.ONE_C_HTTP_ENABLED === "true" ? "http" : "manual" });
            return this.detailInTransaction(client, current, id);
        });
    }
    async jobs(actor) {
        return this.write(actor, async (client, current) => ({ items: (await client.query(`SELECT ${jobColumns} FROM integration_jobs j WHERE ${scopeColumns("j", 1)} ORDER BY j.created_at DESC,j.id LIMIT 100`, [JSON.stringify(this.grants(current))])).rows }));
    }
    async job(client, actor, id) {
        const result = await client.query(`SELECT j.* FROM integration_jobs j WHERE j.id=$1 AND ${scopeColumns("j", 2)} FOR UPDATE`, [id, JSON.stringify(this.grants(actor))]);
        if (!result.rows[0])
            this.notFound();
        return result.rows[0];
    }
    async exportJob(actor, id) {
        return this.write(actor, async (client, current) => {
            const job = await this.job(client, current, id);
            await this.event(client, current, "finance.sensitive_export", "integration_job", id, job, { registryId: job.registry_id, format: "transport.registry.v1", payloadHash: hash(job.payload) });
            return job.payload;
        });
    }
    async acknowledge(actor, id, input) {
        if (!input.sourceDocumentId.trim())
            throw new common_1.BadRequestException({ code: "RECEIPT_DOCUMENT_REQUIRED", message: "Нужен идентификатор документа, реально созданного в 1С." });
        return this.write(actor, async (client, current) => {
            const job = await this.job(client, current, id);
            if (job.status === "acknowledged") {
                if (job.source_document_id !== input.sourceDocumentId || job.acknowledgment_key !== input.idempotencyKey)
                    this.conflict("RECEIPT_CONFLICT", "Для обмена уже сохранено другое подтверждение.");
            }
            else {
                await client.query(`UPDATE integration_jobs SET status='acknowledged',source_document_id=$2,acknowledgment_key=$3,acknowledged_at=clock_timestamp(),lease_until=NULL,lease_token=NULL,last_error_code=NULL WHERE id=$1`, [id, input.sourceDocumentId, input.idempotencyKey]);
                await this.event(client, current, "integration.one_c_manually_acknowledged", "integration_job", id, job, { sourceSystem: "1C", sourceDocumentId: input.sourceDocumentId, confirmationMode: "human_reported" });
            }
            return (await client.query(`SELECT ${jobColumns} FROM integration_jobs j WHERE j.id=$1`, [id])).rows[0];
        });
    }
};
exports.FinanceService = FinanceService;
exports.FinanceService = FinanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, audit_service_1.AuditService, identity_repository_1.IdentityRepository])
], FinanceService);
//# sourceMappingURL=finance.service.js.map