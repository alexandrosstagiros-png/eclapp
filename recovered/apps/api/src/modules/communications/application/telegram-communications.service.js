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
exports.TelegramCommunicationsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const contracts_1 = require("@transport/contracts");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const communications_service_1 = require("./communications.service");
const telegram_update_1 = require("../domain/telegram-update");
const HELP = "Откройте мини-приложение → Связь с отделами → нужное обращение → Открыть диалог в Telegram → Перейти в Telegram. Если Telegram предлагает «Начать», нажмите эту кнопку. Для каждого сообщения используйте «Ответить» на сообщение бота с номером обращения. Текст без такого ответа не передаётся.";
const UNSUPPORTED = "Сообщение не принято. Пока поддерживается только обычный текст до 3500 символов. Фото, голосовые, файлы и пересылки не передаются. Отправьте текст через «Ответить»; документы рейса загружайте в мини-приложении.";
const UNAVAILABLE = "Сообщение не передано: сейчас нет подключённого сотрудника с доступом к этому обращению. Повторите позже или обратитесь в администрацию через мини-приложение.";
let TelegramCommunicationsService = class TelegramCommunicationsService {
    database;
    core;
    audit;
    constructor(database, core, audit) {
        this.database = database;
        this.core = core;
        this.audit = audit;
    }
    async receive(value, correlationId) {
        const update = (0, telegram_update_1.parseTelegramUpdate)(value);
        if (!update)
            return { ok: true };
        await this.database.transaction(async (client) => {
            // The update ID is consumed only if all business changes, audit and queued replies commit.
            const inserted = await client.query("INSERT INTO telegram_inbound_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id", [update.updateId]);
            if (!inserted.rowCount)
                return;
            let actor;
            try {
                actor = await this.core.telegramActor(client, update.chatId);
            }
            catch (error) {
                if (this.isDenied(error))
                    return;
                throw error;
            }
            if (!actor)
                return;
            const current = actor;
            const guidance = (text) => this.enqueue(client, current, current, update.chatId, null, text, false, correlationId);
            if (update.input.kind === "help") {
                await guidance(HELP);
                return;
            }
            if (update.input.kind === "unsupported") {
                await guidance(UNSUPPORTED);
                return;
            }
            if (update.input.kind === "start") {
                let ticket;
                try {
                    ticket = await this.core.startTicket(client, actor, update.input.token);
                }
                catch (error) {
                    if (this.isDenied(error)) {
                        await guidance("Ссылка истекла или обращение недоступно. Получите новую ссылку в мини-приложении.");
                        return;
                    }
                    throw error;
                }
                if (ticket === null) return;
                if (!ticket) {
                    await guidance("Ссылка истекла или обращение недоступно. Получите новую ссылку в мини-приложении.");
                    return;
                }
                if (ticket.status === "resolved") {
                    await guidance("Обращение закрыто. Для продолжения автору нужно сначала возобновить его в мини-приложении.");
                    return;
                }
                await this.enqueue(client, actor, actor, update.chatId, ticket, `${this.heading(ticket)}\nНапишите сообщение через «Ответить» именно на это сообщение. Ответ будет передан ${actor.id === ticket.requesterId ? "сотрудникам отдела" : "автору обращения"}.`, true, correlationId);
                return;
            }
            if (!update.replyToMessageId) {
                await guidance(HELP);
                return;
            }
            const mapped = (await client.query("SELECT ticket_id,department FROM telegram_deliveries WHERE chat_id=$1 AND telegram_message_id=$2 AND recipient_id=$3 AND force_reply AND status='sent'", [update.chatId, update.replyToMessageId, actor.id])).rows[0];
            if (!mapped) {
                await guidance(HELP);
                return;
            }
            const ticket = await this.core.ticket(client, mapped.ticket_id, true);
            if (ticket?.applicationOnly) return;
            if (!ticket || !await this.core.allowed(client, actor, ticket) || ticket.department !== mapped.department) {
                await guidance("Обращение недоступно или уже передано другому отделу. Откройте его в мини-приложении и получите новое сообщение для ответа.");
                return;
            }
            if (ticket.status === "resolved") {
                await guidance("Обращение закрыто. Сначала возобновите его в мини-приложении, затем отправьте сообщение через «Ответить».");
                return;
            }
            const recipients = await this.core.recipients(client, ticket, actor);
            const targets = [];
            for (const recipient of recipients) {
                const binding = (await client.query("SELECT provider_user_id FROM channel_identities WHERE provider='telegram' AND user_id=$1", [recipient.id])).rows[0];
                if (binding)
                    targets.push({ actor: recipient, chatId: binding.provider_user_id });
            }
            if (targets.length === 0) {
                await guidance(UNAVAILABLE);
                return;
            }
            const id = (0, node_crypto_1.randomUUID)();
            const text = update.input.text;
            const sha256 = (0, node_crypto_1.createHash)("sha256").update(text).digest("hex");
            await client.query("INSERT INTO communications_messages(id,ticket_id,sender_id,department,update_id,content,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, ticket.id, actor.id, ticket.department, update.updateId, text, sha256]);
            await this.audit.append(client, { actorId: actor.id, channel: "telegram", action: "communications.message_recorded", entityType: "communication_message", entityId: id, correlationId, scope: this.scope(ticket), metadata: { ticketId: ticket.id, department: ticket.department, sha256, recipientCount: targets.length } });
            const content = `${this.heading(ticket)}\n${actor.id === ticket.requesterId ? "Сообщение автора обращения" : "Ответ отдела"}:\n\n${text}\n\nИспользуйте «Ответить» для ответа по этому обращению.`;
            for (const target of targets)
                await this.enqueue(client, actor, target.actor, target.chatId, ticket, content, true, correlationId, id);
            await this.enqueue(client, actor, actor, update.chatId, ticket, `${this.heading(ticket)}\nСообщение сохранено и поставлено в очередь отправки. Это ещё не подтверждение доставки или прочтения. Следующее сообщение отправляйте через «Ответить» на это сообщение.`, true, correlationId);
        });
        return { ok: true };
    }
    isDenied(error) { return error instanceof common_1.HttpException && [400, 401, 403, 404, 409].includes(error.getStatus()); }
    heading(ticket) { return `Обращение ${ticket.reference} · ${contracts_1.DEPARTMENTS.find((department) => department.code === ticket.department).label}`; }
    scope(ticket) { return { legalEntityId: ticket.legalEntityId, regionId: ticket.regionId, projectId: ticket.projectId, responsibilityScopeId: ticket.responsibilityScopeId }; }
    async enqueue(client, sender, recipient, chatId, ticket, content, forceReply, correlationId, messageId = null) {
        const id = (0, node_crypto_1.randomUUID)();
        await client.query("INSERT INTO telegram_deliveries(id,ticket_id,message_id,sender_id,recipient_id,chat_id,department,content,force_reply) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, ticket?.id ?? null, messageId, sender.id, recipient.id, chatId, ticket?.department ?? null, content, forceReply]);
        await this.audit.append(client, { actorId: sender.id, channel: "telegram", action: "communications.delivery_queued", entityType: "telegram_delivery", entityId: id, correlationId, ...(ticket ? { scope: this.scope(ticket) } : {}), metadata: { ...(ticket ? { ticketId: ticket.id } : {}), ...(messageId ? { messageId } : {}), recipientId: recipient.id } });
    }
};
exports.TelegramCommunicationsService = TelegramCommunicationsService;
exports.TelegramCommunicationsService = TelegramCommunicationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(communications_service_1.CommunicationsService)),
    __param(2, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        communications_service_1.CommunicationsService,
        audit_service_1.AuditService])
], TelegramCommunicationsService);
//# sourceMappingURL=telegram-communications.service.js.map
