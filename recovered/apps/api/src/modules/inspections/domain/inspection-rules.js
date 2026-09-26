"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PHOTO_BYTES = void 0;
exports.multilineText = multilineText;
exports.itemId = itemId;
exports.templateInput = templateInput;
exports.photoInput = photoInput;
exports.submissionInput = submissionInput;
exports.validateSubmissionTime = validateSubmissionTime;
exports.photoDeleteInput = photoDeleteInput;
exports.validateAnswers = validateAnswers;
exports.ensureSubmittable = ensureSubmittable;
exports.inspectionReviewInput = inspectionReviewInput;
exports.ensureReviewAllowed = ensureReviewAllowed;
exports.queueInput = queueInput;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const validation_1 = require("../../workflow/domain/validation");
exports.MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Textareas retain paragraph breaks; other control characters remain invalid. */
function multilineText(value, max, min = 0) {
    if (typeof value !== "string")
        return (0, validation_1.fail)("Ожидается текст.");
    const normalized = value.replace(/\r\n?/g, "\n").trim();
    if (normalized.length < min || normalized.length > max || /[\x00-\x09\x0b-\x1f\x7f]/.test(normalized))
        return (0, validation_1.fail)("Некорректный текст или превышена длина поля.");
    return normalized;
}
function itemId(value) {
    if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value))
        return (0, validation_1.fail)("Некорректный идентификатор пункта КО.");
    return value;
}
function templateInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "scope", "expectedVersion", "title", "items"]);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 40)
        return (0, validation_1.fail)("Шаблон должен содержать от 1 до 40 пунктов.");
    const items = input.items.map((value) => {
        const item = (0, validation_1.record)(value, ["id", "section", "kind", "label", "instruction", "required", "critical"]);
        if (!["vehicle", "fluids", "documents", "equipment", "other"].includes(String(item.section)) || !["photo", "document", "check", "text"].includes(String(item.kind)))
            return (0, validation_1.fail)("Неизвестный раздел или тип пункта КО.");
        if (typeof item.required !== "boolean" || typeof item.critical !== "boolean")
            return (0, validation_1.fail)("Обязательность и критичность должны быть логическими значениями.");
        return { id: itemId(item.id), section: item.section, kind: item.kind, label: (0, validation_1.boundedText)(item.label, 160), instruction: multilineText(item.instruction, 1000), required: item.required, critical: item.critical };
    });
    if (new Set(items.map((item) => item.id)).size !== items.length)
        return (0, validation_1.fail)("Идентификаторы пунктов шаблона не должны повторяться.");
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), scope: (0, validation_1.scopeInput)(input.scope), expectedVersion: (0, validation_1.integer)(input.expectedVersion, 2147483646), title: (0, validation_1.boundedText)(input.title, 160), items };
}
function photoInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "templateId", "itemId", "mimeType", "contentBase64", "expectedRevision"]);
    if (input.mimeType !== "image/jpeg" && input.mimeType !== "image/png")
        return (0, validation_1.fail)("Фотография должна быть JPEG или PNG.");
    const content = input.contentBase64;
    if (typeof content !== "string" || !content.length || content.length > Math.ceil(exports.MAX_PHOTO_BYTES / 3) * 4 || content.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content))
        return (0, validation_1.fail)("Некорректный Base64 или фото превышает 5 МБ.");
    const bytes = Buffer.from(content, "base64");
    if (!bytes.length || bytes.length > exports.MAX_PHOTO_BYTES || bytes.toString("base64") !== content)
        return (0, validation_1.fail)("Фото превышает 5 МБ или повреждено.");
    const signature = input.mimeType === "image/jpeg" ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!signature)
        return (0, validation_1.fail)("Содержимое фото не соответствует формату.");
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), templateId: (0, validation_1.uuid)(input.templateId), itemId: itemId(input.itemId), mimeType: input.mimeType, bytes, sha256: (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex"), ...(input.expectedRevision === undefined ? {} : { expectedRevision: (0, validation_1.integer)(input.expectedRevision, 99) }) };
}
function photoDeleteInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey"]);
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey) };
}
function validateSubmissionTime(input, latest, now = Date.now()) {
    // Corrections preserve the exact recorded time; newly chosen times keep the seven-day window.
    const previousTime = latest?.occurredAt == null ? NaN : new Date(latest.occurredAt).getTime();
    if (latest?.status === "returned" && Number.isFinite(previousTime) && input.occurredAt === new Date(previousTime).toISOString())
        return;
    (0, validation_1.attendanceInput)({ idempotencyKey: input.idempotencyKey, kind: "check_in", occurredAt: input.occurredAt }, now);
}
function submissionInput(value, now = Date.now(), deferTimeWindow = false) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "templateId", "expectedRevision", "occurredAt", "answers", "comment"]);
    if (typeof input.occurredAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.occurredAt) || !Number.isFinite(Date.parse(input.occurredAt)))
        return (0, validation_1.fail)("Укажите время UTC в формате ISO.");
    const timing = { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), occurredAt: new Date(input.occurredAt).toISOString() };
    if (String(input.occurredAt).slice(0, 19) !== timing.occurredAt.slice(0, 19))
        return (0, validation_1.fail)("Некорректная календарная дата осмотра.");
    if (!deferTimeWindow)
        validateSubmissionTime(timing, null, now);
    if (!Array.isArray(input.answers) || input.answers.length > 40)
        return (0, validation_1.fail)("Допустимо до 40 ответов КО.");
    const answers = input.answers.map((value) => {
        const answer = (0, validation_1.record)(value, ["itemId", "result", "comment", "photoIds"]);
        if (!["ok", "defect", "missing", "not_applicable"].includes(String(answer.result)))
            return (0, validation_1.fail)("Неизвестный результат пункта КО.");
        if (!Array.isArray(answer.photoIds) || answer.photoIds.length > 4)
            return (0, validation_1.fail)("К одному пункту можно приложить до четырёх фото.");
        return { itemId: itemId(answer.itemId), result: answer.result, comment: multilineText(answer.comment, 1000), photoIds: answer.photoIds.map(validation_1.uuid) };
    });
    if (new Set(answers.map((answer) => answer.itemId)).size !== answers.length)
        return (0, validation_1.fail)("Один пункт должен иметь один ответ.");
    const photoIds = answers.flatMap((answer) => answer.photoIds);
    if (new Set(photoIds).size !== photoIds.length)
        return (0, validation_1.fail)("Одно фото нельзя повторять в осмотре.");
    return { idempotencyKey: timing.idempotencyKey, templateId: (0, validation_1.uuid)(input.templateId), expectedRevision: (0, validation_1.integer)(input.expectedRevision, 99), occurredAt: timing.occurredAt, answers, comment: multilineText(input.comment, 2000) };
}
function validateAnswers(items, answers) {
    const definitions = new Map(items.map((item) => [item.id, item]));
    for (const answer of answers) {
        const item = definitions.get(answer.itemId);
        if (!item)
            return (0, validation_1.fail)("Ответ содержит пункт, которого нет в шаблоне.");
        if (item.required && answer.result === "not_applicable")
            return (0, validation_1.fail)(`Обязательный пункт «${item.label}» нельзя пропустить.`);
        if ((answer.result === "defect" || answer.result === "missing") && answer.comment.length < 3)
            return (0, validation_1.fail)(`Укажите пояснение к проблеме в пункте «${item.label}».`);
        if (item.kind === "text" && answer.result !== "not_applicable" && answer.comment.length < 3)
            return (0, validation_1.fail)(`Заполните пояснение в пункте «${item.label}».`);
        if (item.kind === "photo" && (item.required || answer.result !== "not_applicable") && !answer.photoIds.length)
            return (0, validation_1.fail)(`Приложите фото к пункту «${item.label}».`);
        if (item.kind === "document" && answer.result !== "missing" && answer.result !== "not_applicable" && !answer.photoIds.length)
            return (0, validation_1.fail)(`Приложите фото документа «${item.label}».`);
    }
    if (items.some((item) => item.required && !answers.some((answer) => answer.itemId === item.id)))
        return (0, validation_1.fail)("Заполните все обязательные пункты КО.");
    return { hasCriticalDefects: answers.some((answer) => definitions.get(answer.itemId)?.critical && (answer.result === "defect" || answer.result === "missing")) };
}
function ensureSubmittable(latest, expectedRevision) {
    if ((latest?.revision ?? 0) !== expectedRevision)
        throw new common_1.ConflictException("КО уже изменён. Обновите данные перед отправкой.");
    if (latest && latest.status !== "returned")
        throw new common_1.ConflictException("Повторная отправка доступна после возврата механиком.");
    if (expectedRevision >= 100)
        throw new common_1.ConflictException("Достигнут предел версий КО для рейса.");
}
function inspectionReviewInput(value) {
    const input = (0, validation_1.record)(value, ["idempotencyKey", "decision", "reason"]);
    if (input.decision !== "accepted" && input.decision !== "returned")
        return (0, validation_1.fail)("Некорректное решение механика.");
    const reason = input.reason === null || input.reason === undefined || input.reason === "" ? null : multilineText(input.reason, 1000, 3);
    if (input.decision === "returned" && !reason)
        return (0, validation_1.fail)("Укажите причину возврата (от 3 символов).");
    return { idempotencyKey: (0, validation_1.uuid)(input.idempotencyKey), decision: input.decision, reason };
}
function ensureReviewAllowed(status, critical, answers, input) {
    if (status !== "pending")
        throw new common_1.ConflictException("Решение по этой версии КО уже принято.");
    if (input.decision === "accepted" && critical)
        throw new common_1.ConflictException("Критические неисправности или отсутствие обязательного оснащения требуют исправления и новой версии КО.");
    if (input.decision === "accepted" && answers.some((answer) => answer.result === "defect" || answer.result === "missing") && !input.reason)
        return (0, validation_1.fail)("Укажите обоснование принятия КО с замечаниями.");
}
function queueInput(status, cursor) {
    if (status !== undefined && status !== "pending" && status !== "accepted" && status !== "returned")
        return (0, validation_1.fail)("Некорректный статус очереди КО.");
    if (cursor === undefined)
        return { status: (status ?? "pending"), cursor: null };
    if (typeof cursor !== "string" || cursor.length > 300 || !/^[A-Za-z0-9_-]+$/.test(cursor))
        return (0, validation_1.fail)("Некорректный курсор очереди.");
    try {
        const parsed = (0, validation_1.record)(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")), ["submittedAt", "id"]);
        if (typeof parsed.submittedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(parsed.submittedAt) || new Date(parsed.submittedAt).toISOString() !== parsed.submittedAt)
            return (0, validation_1.fail)("Некорректное время курсора.");
        return { status: (status ?? "pending"), cursor: { submittedAt: parsed.submittedAt, id: (0, validation_1.uuid)(parsed.id) } };
    }
    catch {
        return (0, validation_1.fail)("Некорректный курсор очереди.");
    }
}
//# sourceMappingURL=inspection-rules.js.map
