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
exports.OneCWorkerService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const one_c_http_adapter_1 = require("../infra/one-c-http.adapter");
let OneCWorkerService = class OneCWorkerService {
    database;
    audit;
    adapter;
    timer;
    running;
    constructor(database, audit) {
        this.database = database;
        this.audit = audit;
    }
    onModuleInit() {
        const enabled = process.env.ONE_C_HTTP_ENABLED;
        if (enabled !== undefined && !["true", "false"].includes(enabled))
            throw new Error("ONE_C_HTTP_ENABLED must be true or false");
        if (enabled !== "true")
            return;
        this.adapter = new one_c_http_adapter_1.OneCHttpAdapter(process.env.ONE_C_HTTP_URL ?? "", process.env.ONE_C_HTTP_SECRET ?? "");
        this.timer = setInterval(() => {
            if (this.running)
                return;
            this.running = this.tick().catch(() => {
                // Connection failures must not expose database messages, credentials, or financial payloads.
                process.stderr.write("1C exchange worker temporarily unavailable\n");
            }).finally(() => { this.running = undefined; });
        }, 10000);
        this.timer.unref();
    }
    async onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        await this.running;
    }
    async tick() {
        const adapter = this.adapter;
        if (!adapter)
            return;
        const lease = (0, node_crypto_1.randomUUID)();
        const job = await this.database.transaction(async (client) => {
            const result = await client.query(`SELECT * FROM integration_jobs WHERE delivery_mode='http' AND ((status='pending' AND attempts<6 AND next_attempt_at<=clock_timestamp()) OR (status='processing' AND lease_until<clock_timestamp())) ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
            const row = result.rows[0];
            if (!row)
                return null;
            if (row.attempts >= 6) {
                await client.query("UPDATE integration_jobs SET status='failed',lease_until=NULL,lease_token=NULL,last_error_code='LEASE_EXHAUSTED' WHERE id=$1", [row.id]);
                await this.audit.append(client, { channel: "system", action: "integration.one_c_attempt_failed", entityType: "integration_job", entityId: row.id, correlationId: lease, scope: { legalEntityId: row.legal_entity_id, regionId: row.region_id, projectId: row.project_id, responsibilityScopeId: row.responsibility_scope_id }, metadata: { code: "LEASE_EXHAUSTED", attempts: row.attempts } });
                return null;
            }
            await client.query("UPDATE integration_jobs SET status='processing',attempts=attempts+1,lease_until=clock_timestamp()+interval '45 seconds',lease_token=$2 WHERE id=$1", [row.id, lease]);
            await this.audit.append(client, { channel: "system", action: "integration.one_c_attempted", entityType: "integration_job", entityId: row.id, correlationId: lease, scope: { legalEntityId: row.legal_entity_id, regionId: row.region_id, projectId: row.project_id, responsibilityScopeId: row.responsibility_scope_id }, metadata: { attempt: row.attempts + 1 } });
            return { ...row, attempts: row.attempts + 1 };
        });
        if (!job)
            return;
        let sourceDocumentId;
        let failure;
        try {
            sourceDocumentId = (await adapter.send(job.payload)).sourceDocumentId;
        }
        catch (error) {
            failure = error instanceof one_c_http_adapter_1.OneCTransportError ? error.code : "TIMEOUT_OR_NETWORK";
        }
        await this.database.transaction(async (client) => {
            const current = (await client.query("SELECT status,lease_token FROM integration_jobs WHERE id=$1 FOR UPDATE", [job.id])).rows[0];
            // A manual receipt or a later worker owns the row now: never replace its evidence.
            if (current?.status !== "processing" || current.lease_token !== lease)
                return;
            if (sourceDocumentId !== undefined) {
                await client.query("UPDATE integration_jobs SET status='acknowledged',source_document_id=$2,acknowledgment_key=$3,acknowledged_at=clock_timestamp(),lease_until=NULL,lease_token=NULL,last_error_code=NULL WHERE id=$1", [job.id, sourceDocumentId, job.payload.idempotencyKey]);
            }
            else {
                await client.query("UPDATE integration_jobs SET status=$2,next_attempt_at=clock_timestamp()+($3*interval '1 second'),lease_until=NULL,lease_token=NULL,last_error_code=$4 WHERE id=$1", [job.id, job.attempts >= 6 ? "failed" : "pending", Math.min(3600, 5 * 2 ** job.attempts), failure]);
            }
            await this.audit.append(client, { channel: "system", action: sourceDocumentId !== undefined ? "integration.one_c_acknowledged" : "integration.one_c_attempt_failed", entityType: "integration_job", entityId: job.id, correlationId: lease, scope: { legalEntityId: job.legal_entity_id, regionId: job.region_id, projectId: job.project_id, responsibilityScopeId: job.responsibility_scope_id }, metadata: sourceDocumentId !== undefined ? { sourceDocumentId, confirmationMode: "http_receipt" } : { code: failure, attempts: job.attempts } });
        });
    }
};
exports.OneCWorkerService = OneCWorkerService;
exports.OneCWorkerService = OneCWorkerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, audit_service_1.AuditService])
], OneCWorkerService);
//# sourceMappingURL=one-c-worker.service.js.map