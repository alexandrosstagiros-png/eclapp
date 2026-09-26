"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.departmentInput = departmentInput;
exports.createTicketInput = createTicketInput;
exports.communicationActionInput = communicationActionInput;
exports.membershipInput = membershipInput;
exports.communicationListInput = communicationListInput;
exports.hasCommunicationScope = hasCommunicationScope;
exports.hasDepartmentScope = hasDepartmentScope;
exports.ticketActions = ticketActions;
exports.communicationMessageInput = communicationMessageInput;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@transport/contracts");
const validation_1 = require("../../workflow/domain/validation");
const trip_read_policy_1 = require("../../operations/domain/trip-read-policy");
const invalid = (message) => { throw new common_1.BadRequestException(message); };
function departmentInput(value) {
    if (!contracts_1.DEPARTMENTS.some((department) => department.code === value))
        return invalid("Неизвестный отдел.");
    return value;
}
function createTicketInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "department", "kind", "subject", "scope", "text"]);
    if (!["question", "problem", "suggestion"].includes(input.kind))
        return invalid("Неизвестный тип обращения.");
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), department: departmentInput(input.department), kind: input.kind, subject: (0, validation_1.boundedText)(input.subject, 140, 3), scope: (0, validation_1.scopeInput)(input.scope),
        ...(input.text !== undefined ? { text: messageText(input.text) } : {}) };
}
function messageText(value) {
    if (typeof value !== 'string' || value.length > 3500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
        return invalid('Сообщение должно содержать от 1 до 3500 символов.');
    const text = value.replace(/\r\n?/g, '\n').trim();
    if (!text) return invalid('Введите сообщение.');
    return text;
}
function communicationMessageInput(value) {
    const input = (0, validation_1.record)(value, ['idempotencyKey', 'text']);
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), text: messageText(input.text) };
}
function communicationActionInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "expectedVersion", "action", "reason"]);
    if (!["take", "resolve", "reopen", "escalate"].includes(input.action))
        return invalid("Неизвестное действие.");
    let reason;
    if (input.reason !== undefined) {
        if (typeof input.reason !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input.reason))
            return invalid("Некорректная причина.");
        reason = input.reason.replace(/\r\n?/g, "\n").trim();
        if (reason.length < 3 || reason.length > 500)
            return invalid("Причина должна содержать от 3 до 500 символов.");
    }
    if (["resolve", "escalate"].includes(input.action) && !reason)
        return invalid("Укажите причину (от 3 символов).");
    const expectedVersion = (0, validation_1.integer)(input.expectedVersion, 2147483646);
    if (expectedVersion < 1)
        return invalid("Версия должна быть положительной.");
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), expectedVersion, action: input.action, ...(reason ? { reason } : {}) };
}
function membershipInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "userId", "department", "scope", "enabled"]);
    if (typeof input.enabled !== "boolean")
        return invalid("Укажите состояние доступа.");
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), userId: (0, validation_1.uuid)(input.userId), department: departmentInput(input.department), scope: (0, validation_1.scopeInput)(input.scope), enabled: input.enabled };
}
function communicationListInput(view, value) {
    if (view !== undefined && view !== "mine" && view !== "department")
        return invalid("Неизвестный список обращений.");
    let cursor = null;
    if (value !== undefined) {
        if (typeof value !== "string" || value.length > 300 || !/^[A-Za-z0-9_-]+$/.test(value))
            return invalid("Некорректный курсор.");
        try {
            const input = (0, validation_1.record)(JSON.parse(Buffer.from(value, "base64url").toString("utf8")), ["createdAt", "id"]);
            if (typeof input.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.createdAt) || new Date(input.createdAt).toISOString() !== input.createdAt)
                return invalid("Некорректный курсор.");
            cursor = { createdAt: input.createdAt, id: (0, validation_1.uuid)(input.id) };
        }
        catch {
            return invalid("Некорректный курсор.");
        }
    }
    return { view: (view ?? "mine"), cursor };
}
function hasCommunicationScope(actor, scope) {
    return actor.role !== "external_recruiter" && actor.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, scope));
}
function hasDepartmentScope(actor, scope, financial) {
    return !["driver", "external_recruiter"].includes(actor.role) && actor.grants.some((grant) => (0, trip_read_policy_1.tripScopeMatches)(grant, scope) && grant.personalDataVisible && (!financial || grant.financeVisible));
}
function ticketActions(actorId, ticket, member, assigneeAvailable = Boolean(ticket.assigneeId), administrator = false) {
    const actions = [];
    const owner = ticket.requesterId === actorId;
    if (member && !owner && ticket.status !== "resolved" && (!ticket.assigneeId || !assigneeAvailable || (administrator && ticket.assigneeId !== actorId)))
        actions.push("take");
    if (member && !owner && ticket.status === "in_progress" && (ticket.assigneeId === actorId || administrator))
        actions.push("resolve");
    if (owner && ticket.status === "resolved")
        actions.push("reopen");
    if (owner && ticket.department !== "administration")
        actions.push("escalate");
    return actions;
}
//# sourceMappingURL=communication-rules.js.map
