"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fail = exports.CSV_TEMPLATE = exports.CSV_HEADERS = exports.DOCUMENT_KINDS = void 0;
exports.record = record;
exports.uuid = uuid;
exports.boundedText = boundedText;
exports.integer = integer;
exports.scopeInput = scopeInput;
exports.dateInput = dateInput;
exports.tripInput = tripInput;
exports.factsInput = factsInput;
exports.reviewInput = reviewInput;
exports.attendanceInput = attendanceInput;
exports.uploadInput = uploadInput;
exports.parseCsv = parseCsv;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
exports.DOCUMENT_KINDS = ["delivery_note", "waybill"];
exports.CSV_HEADERS = ["reference", "businessDate", "legalEntityId", "regionId", "projectId", "responsibilityScopeId", "vehicleId", "driverId", "routeSummary"];
exports.CSV_TEMPLATE = exports.CSV_HEADERS.join(",") + "\r\n";
const fail = (message) => { throw new common_1.BadRequestException({ code: "WORKFLOW_INVALID_INPUT", message }); };
exports.fail = fail;
function record(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return (0, exports.fail)("Ожидается объект JSON.");
    const object = value;
    if (Object.keys(object).some((key) => !keys.includes(key)))
        return (0, exports.fail)("Неизвестное поле запроса.");
    return object;
}
function uuid(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
        return (0, exports.fail)("Ожидается UUID.");
    return value.toLowerCase();
}
function boundedText(value, max, min = 1) {
    if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value))
        return (0, exports.fail)("Некорректный текст или превышена длина поля.");
    return value.trim();
}
function integer(value, maximum) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum)
        return (0, exports.fail)("Ожидается целое неотрицательное число в допустимом диапазоне.");
    return value;
}
function scopeInput(value) {
    const input = record(value, ["legalEntityId", "regionId", "projectId", "responsibilityScopeId"]);
    return { legalEntityId: uuid(input.legalEntityId), regionId: uuid(input.regionId), projectId: uuid(input.projectId), responsibilityScopeId: uuid(input.responsibilityScopeId) };
}
function dateInput(value) {
    if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
        return (0, exports.fail)("Дата должна быть в формате ГГГГ-ММ-ДД, 2000–2099.");
    const date = new Date(value + "T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        return (0, exports.fail)("Некорректная календарная дата.");
    return value;
}
function tripInput(value, withKey = true) {
    const input = record(value, ["idempotencyKey", "reference", "businessDate", "scope", "vehicleId", "driverId", "routeSummary"]);
    const reference = boundedText(input.reference, 60);
    if (/^[=+@-]/.test(reference))
        return (0, exports.fail)("Номер рейса не должен начинаться со знака формулы.");
    const routeSummary = boundedText(input.routeSummary, 500);
    const stops = routeSummary.split("→").map((stop) => stop.trim());
    if (stops.length > 50 || stops.some((stop) => stop.length === 0))
        return (0, exports.fail)("Маршрут должен содержать от 1 до 50 непустых точек через стрелку →.");
    return { idempotencyKey: withKey ? uuid(input.idempotencyKey) : "", reference, businessDate: dateInput(input.businessDate), scope: scopeInput(input.scope), vehicleId: uuid(input.vehicleId), ...(input.driverId ? { driverId: uuid(input.driverId) } : {}), routeSummary };
}
function factsInput(value) {
    const input = record(value, ["idempotencyKey", "minutes", "stops", "kilometersHundredths", "waitingMinutes"]);
    const result = { idempotencyKey: uuid(input.idempotencyKey), minutes: integer(input.minutes, 10080), stops: integer(input.stops, 10000), kilometersHundredths: integer(input.kilometersHundredths, 10000000), waitingMinutes: integer(input.waitingMinutes, 10080) };
    if (result.waitingMinutes > result.minutes)
        return (0, exports.fail)("Ожидание не может превышать общее время работы.");
    return result;
}
function reviewInput(value, approval) {
    const input = record(value, ["idempotencyKey", "decision", "reason"]);
    if (input.decision !== approval && input.decision !== "returned")
        return (0, exports.fail)("Некорректное решение проверки.");
    const reason = input.reason === undefined || input.reason === null || input.reason === "" ? null : boundedText(input.reason, 500, 3);
    if (input.decision === "returned" && !reason)
        return (0, exports.fail)("Укажите причину возврата (от 3 символов).");
    return { idempotencyKey: uuid(input.idempotencyKey), decision: input.decision, reason };
}
function attendanceInput(value, now = Date.now()) {
    const input = record(value, ["idempotencyKey", "kind", "occurredAt"]);
    if (input.kind !== "accept" && input.kind !== "check_in" && input.kind !== "check_out")
        return (0, exports.fail)("Неизвестная отметка рейса.");
    if (typeof input.occurredAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.occurredAt))
        return (0, exports.fail)("Укажите время UTC в формате ISO.");
    const instant = new Date(input.occurredAt).getTime();
    if (!Number.isFinite(instant) || instant > now + 5 * 60_000 || instant < now - 7 * 24 * 60 * 60_000)
        return (0, exports.fail)("Отметка принимается не старше 7 дней и не более чем на 5 минут в будущем.");
    return { idempotencyKey: uuid(input.idempotencyKey), kind: input.kind, occurredAt: new Date(instant).toISOString() };
}
function uploadInput(value) {
    const input = record(value, ["idempotencyKey", "kind", "filename", "mimeType", "contentBase64"]);
    if (!exports.DOCUMENT_KINDS.includes(input.kind))
        return (0, exports.fail)("Неизвестный вид документа.");
    const filename = boundedText(input.filename, 160);
    if (/[\\/:<>"|?*]/.test(filename) || filename.startsWith("."))
        return (0, exports.fail)("Некорректное имя файла.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(input.mimeType))
        return (0, exports.fail)("Разрешены только PDF, JPEG, PNG.");
    const content = input.contentBase64;
    if (typeof content !== "string" || content.length === 0 || content.length > 13981016 || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content))
        return (0, exports.fail)("Некорректный Base64 или файл превышает 10 МБ.");
    const bytes = Buffer.from(content, "base64");
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024 || bytes.toString("base64") !== content)
        return (0, exports.fail)("Файл превышает 10 МБ или повреждён.");
    const mimeType = input.mimeType;
    const signatureMatches = mimeType === "application/pdf" ? bytes.subarray(0, 5).toString("ascii") === "%PDF-" : mimeType === "image/jpeg" ? bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!signatureMatches)
        return (0, exports.fail)("Сигнатура файла не соответствует указанному формату.");
    return { idempotencyKey: uuid(input.idempotencyKey), kind: input.kind, filename, mimeType, contentBase64: content, bytes, sha256: (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex") };
}
/** Bounded RFC 4180-style parser: commas or semicolons, quoted delimiters and CRLF. */
function parseCsv(value) {
    if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 250000)
        return (0, exports.fail)("CSV должен быть текстом размером не более 250 КБ.");
    const text = value.replace(/^\uFEFF/, "");
    const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
    const records = [];
    let fields = [];
    let field = "";
    let quoted = false;
    let closed = false;
    const endField = () => { fields.push(field); field = ""; closed = false; };
    const endRow = () => { endField(); if (fields.some((part) => part !== ""))
        records.push(fields); fields = []; if (records.length > 101)
        (0, exports.fail)("За один импорт разрешено не более 100 рейсов."); };
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            }
            else if (char === '"') {
                quoted = false;
                closed = true;
            }
            else
                field += char;
        }
        else if (char === delimiter)
            endField();
        else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n")
                i++;
            endRow();
        }
        else if (char === '"' && field === "" && !closed)
            quoted = true;
        else if (closed || char === '"')
            return (0, exports.fail)("Некорректные кавычки CSV.");
        else
            field += char;
    }
    if (quoted)
        return (0, exports.fail)("Незакрытая кавычка CSV.");
    if (field || fields.length || closed)
        endRow();
    if (records.length < 2)
        return (0, exports.fail)("CSV должен содержать заголовок и хотя бы один рейс.");
    if (records[0].join(",") !== exports.CSV_HEADERS.join(","))
        return (0, exports.fail)("Заголовки CSV не соответствуют шаблону.");
    const rows = [];
    const errors = [];
    const references = new Set();
    records.slice(1).forEach((columns, index) => {
        try {
            if (columns.length !== exports.CSV_HEADERS.length)
                return (0, exports.fail)("Неверное количество столбцов.");
            const [reference, businessDate, legalEntityId, regionId, projectId, responsibilityScopeId, vehicleId, driverId, routeSummary] = columns;
            const parsed = tripInput({ reference, businessDate, scope: { legalEntityId, regionId, projectId, responsibilityScopeId }, vehicleId, ...(driverId ? { driverId } : {}), routeSummary }, false);
            if (references.has(parsed.reference))
                return (0, exports.fail)("Повтор номера рейса в CSV.");
            references.add(parsed.reference);
            const { idempotencyKey: unused, ...row } = parsed;
            void unused;
            rows.push(row);
        }
        catch (error) {
            const response = error instanceof common_1.BadRequestException ? error.getResponse() : null;
            errors.push({ row: index + 2, message: response && typeof response === "object" && "message" in response ? String(response.message) : "Некорректная строка CSV." });
        }
    });
    return { valid: errors.length === 0, rows, errors };
}
//# sourceMappingURL=validation.js.map