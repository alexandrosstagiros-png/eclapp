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
exports.TelegramDeliveryWorker = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const communications_service_1 = require("../application/communications.service");
const telegram_config_1 = require("../domain/telegram-config");
const telegram_bot_adapter_1 = require("./telegram-bot.adapter");
let TelegramDeliveryWorker = class TelegramDeliveryWorker {
    database;
    core;
    identity;
    audit;
    adapter;
    timer;
    running;
    constructor(database, core, identity, audit) {
        this.database = database;
        this.core = core;
        this.identity = identity;
        this.audit = audit;
    }
    onModuleInit() {
        const config = (0, telegram_config_1.readTelegramCommunicationsConfig)();
        if (!config.enabled || process.env.NODE_ENV === "test")
            return;
        this.adapter = new telegram_bot_adapter_1.TelegramBotAdapter(config.botToken);
        this.timer = setInterval(() => {
            if (this.running)
                return;
            this.running = this.drain().catch(() => {
                process.stderr.write("Telegram delivery worker temporarily unavailable\n");
            }).finally(() => { this.running = undefined; });
        }, 2000);
        this.timer.unref();
    }
    async onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); await this.running; }
    /** One bounded attempt. Tests supply a port; no network is enabled by a test environment. */
    async drain(port = this.adapter) {
        if (!port)
            return false;
        const candidate = (await this.database.pool.query("SELECT id,ticket_id,sender_id,recipient_id,origin,chat_id FROM telegram_deliveries WHERE status='pending' AND next_attempt_at<=clock_timestamp() ORDER BY next_attempt_at,created_at,id LIMIT 1")).rows[0];
        if (!candidate)
            return false;
        return this.database.transaction(async (client) => {
            // Shared identity lock order, then ticket, then delivery. Hold authorization through
            // the bounded HTTP request so a concurrent revoke cannot overtake the disclosure.
            await this.identity.lockUsers(client, [candidate.sender_id, candidate.recipient_id]);
            let sender;
            let recipient;
            let rejected = false;
            try {
                if (candidate.origin === "application") {
                    const user = await this.identity.user(client, candidate.sender_id);
                    if (user?.active && user.approved && user.role !== "external_recruiter")
                        sender = { id: user.id, displayName: user.display_name, role: user.role, authVersion: user.auth_version, sessionId: "application-event", channel: "system", grants: await this.identity.grants(user.id, client) };
                    else
                        rejected = true;
                }
                else {
                    const senderBinding = (await client.query("SELECT provider_user_id FROM channel_identities WHERE provider='telegram' AND user_id=$1", [candidate.sender_id])).rows[0];
                    if (!senderBinding)
                        rejected = true;
                    else
                        sender = await this.core.telegramActor(client, senderBinding.provider_user_id);
                }
                recipient = await this.core.telegramActor(client, candidate.chat_id);
                if (sender?.id !== candidate.sender_id || recipient?.id !== candidate.recipient_id)
                    rejected = true;
            }
            catch (error) {
                if (error instanceof common_1.HttpException && [401, 403, 404].includes(error.getStatus()))
                    rejected = true;
                else
                    throw error;
            }
            let ticket;
            if (candidate.ticket_id)
                ticket = await this.core.ticket(client, candidate.ticket_id, true);
            const delivery = (await client.query("SELECT * FROM telegram_deliveries WHERE id=$1 AND status='pending' AND next_attempt_at<=clock_timestamp() FOR UPDATE SKIP LOCKED", [candidate.id])).rows[0];
            if (!delivery)
                return false;
            let failure;
            if (rejected || !sender || !recipient || sender.role === 'driver' || recipient.role === 'driver' || ticket?.applicationOnly || (delivery.ticket_id && (!ticket || !await this.core.allowed(client, sender, ticket) || !await this.core.allowed(client, recipient, ticket))))
                failure = "ACCESS_REVOKED";
            else if (ticket && ticket.department !== delivery.department)
                failure = "ROUTING_CHANGED";
            else if (delivery.attempts >= 6)
                failure = "API_REJECTED";
            const correlationId = (0, node_crypto_1.randomUUID)();
            const scope = ticket ? { legalEntityId: ticket.legalEntityId, regionId: ticket.regionId, projectId: ticket.projectId, responsibilityScopeId: ticket.responsibilityScopeId } : undefined;
            const event = (action, metadata) => this.audit.append(client, { channel: "system", action, entityType: "telegram_delivery", entityId: delivery.id, correlationId, ...(scope ? { scope } : {}), metadata: { ...(ticket ? { ticketId: ticket.id } : {}), ...metadata } });
            if (failure) {
                await client.query("UPDATE telegram_deliveries SET status='failed',error_code=$2 WHERE id=$1", [delivery.id, failure]);
                await event("communications.delivery_failed", { code: failure });
                return true;
            }
            const attempts = delivery.attempts + 1;
            await client.query("UPDATE telegram_deliveries SET attempts=$2 WHERE id=$1", [delivery.id, attempts]);
            await event("communications.delivery_attempted", { attempt: attempts });
            let messageId;
            try {
                messageId = (await port.send({ chatId: delivery.chat_id, text: delivery.content, forceReply: delivery.force_reply })).messageId;
            }
            catch (error) {
                failure = error instanceof telegram_bot_adapter_1.TelegramTransportError ? error.code : "NETWORK_OR_TIMEOUT";
            }
            if (messageId !== undefined) {
                await client.query("UPDATE telegram_deliveries SET status='sent',telegram_message_id=$2,sent_at=clock_timestamp(),error_code=NULL WHERE id=$1", [delivery.id, messageId]);
                await event("communications.delivery_sent", { attempt: attempts });
            }
            else {
                const terminal = attempts >= 6 || failure === "CHAT_UNAVAILABLE";
                await client.query("UPDATE telegram_deliveries SET status=$2,error_code=$3,next_attempt_at=clock_timestamp()+($4*interval '1 second') WHERE id=$1", [delivery.id, terminal ? "failed" : "pending", failure, Math.min(900, 5 * 2 ** attempts)]);
                await event("communications.delivery_failed", { attempt: attempts, code: failure, retryScheduled: !terminal });
            }
            return true;
        });
    }
};
exports.TelegramDeliveryWorker = TelegramDeliveryWorker;
exports.TelegramDeliveryWorker = TelegramDeliveryWorker = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(communications_service_1.CommunicationsService)),
    __param(2, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(3, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        communications_service_1.CommunicationsService,
        identity_repository_1.IdentityRepository,
        audit_service_1.AuditService])
], TelegramDeliveryWorker);
//# sourceMappingURL=telegram-delivery.worker.js.map
