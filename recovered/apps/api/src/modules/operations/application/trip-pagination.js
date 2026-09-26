"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTripId = parseTripId;
exports.encodeTripCursor = encodeTripCursor;
exports.parseTripPageQuery = parseTripPageQuery;
const common_1 = require("@nestjs/common");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseTripId(value) {
    if (!UUID_PATTERN.test(value)) {
        throw new common_1.BadRequestException({
            code: "INVALID_TRIP_ID",
            message: "Некорректный идентификатор рейса.",
        });
    }
    return value.toLowerCase();
}
function encodeTripCursor(cursor) {
    return Buffer.from(JSON.stringify([cursor.businessDate, cursor.id]), "utf8").toString("base64url");
}
function decodeTripCursor(value) {
    try {
        if (typeof value !== "string" ||
            value.length === 0 ||
            value.length > 256 ||
            !/^[A-Za-z0-9_-]+$/.test(value))
            throw new Error("Invalid cursor encoding");
        const decoded = Buffer.from(value, "base64url");
        if (decoded.toString("base64url") !== value)
            throw new Error("Non-canonical cursor");
        const parsed = JSON.parse(decoded.toString("utf8"));
        if (!Array.isArray(parsed) ||
            parsed.length !== 2 ||
            typeof parsed[0] !== "string" ||
            typeof parsed[1] !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(parsed[0]) ||
            parsed[0].startsWith("0000-") ||
            !UUID_PATTERN.test(parsed[1]))
            throw new Error("Invalid cursor fields");
        const date = new Date(`${parsed[0]}T00:00:00.000Z`);
        if (!Number.isFinite(date.getTime()) ||
            date.toISOString().slice(0, 10) !== parsed[0]) {
            throw new Error("Invalid cursor date");
        }
        return { businessDate: parsed[0], id: parsed[1].toLowerCase() };
    }
    catch {
        throw new common_1.BadRequestException({
            code: "INVALID_CURSOR",
            message: "Некорректный курсор страницы.",
        });
    }
}
function parseTripPageQuery(limit, cursor) {
    if (limit !== undefined &&
        (typeof limit !== "string" || !/^(?:[1-9]\d?|100)$/.test(limit))) {
        throw new common_1.BadRequestException({
            code: "INVALID_LIMIT",
            message: "Размер страницы должен быть от 1 до 100.",
        });
    }
    return {
        limit: limit === undefined ? 20 : Number(limit),
        after: cursor === undefined ? null : decodeTripCursor(cursor),
    };
}
//# sourceMappingURL=trip-pagination.js.map