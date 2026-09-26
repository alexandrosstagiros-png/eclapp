"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueCommunicationStatus = enqueueCommunicationStatus;
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@transport/contracts");
const labels = { created: "Создано обращение", take: "Обращение принято в работу", resolve: "Обращение закрыто", reopen: "Обращение возобновлено", escalate: "Обращение передано в администрацию" };
/** The application service supplies its authenticated actor and current authorized recipients in the same transaction. */
async function enqueueCommunicationStatus(client, audit, actor, ticket, recipients, event) {
    const targets = new Map(recipients.map(recipient => [recipient.id, recipient]));
    targets.set(actor.id, actor);
    const scope = { legalEntityId: ticket.legalEntityId, regionId: ticket.regionId, projectId: ticket.projectId, responsibilityScopeId: ticket.responsibilityScopeId };
    const department = contracts_1.DEPARTMENTS.find(item => item.code === ticket.department).label;
    const content = `Обращение ${ticket.reference} · ${department}\n${labels[event]}.\nОснование и история статусов доступны в карточке мини-приложения. ${event === "resolve" ? "Для продолжения автору нужно сначала возобновить обращение в мини-приложении." : "Для сообщения автору или отделу используйте «Ответить» на это сообщение."}`;
    for (const target of targets.values()) {
        const binding = (await client.query("SELECT provider_user_id FROM channel_identities WHERE provider='telegram' AND user_id=$1", [target.id])).rows[0];
        if (!binding)
            continue;
        const id = (0, node_crypto_1.randomUUID)();
        await client.query("INSERT INTO telegram_deliveries(id,ticket_id,sender_id,recipient_id,origin,chat_id,department,content,force_reply) VALUES($1,$2,$3,$4,'application',$5,$6,$7,$8)", [id, ticket.id, actor.id, target.id, binding.provider_user_id, ticket.department, content, event !== "resolve"]);
        await audit.append(client, { actorId: actor.id, channel: actor.channel, action: "communications.delivery_queued", entityType: "telegram_delivery", entityId: id, correlationId: (0, node_crypto_1.randomUUID)(), scope, metadata: { ticketId: ticket.id, recipientId: target.id, statusEvent: event } });
    }
}
//# sourceMappingURL=telegram-status.queue.js.map