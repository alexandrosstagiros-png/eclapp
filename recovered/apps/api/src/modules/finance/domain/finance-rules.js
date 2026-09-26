"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeGrants = financeGrants;
exports.parseRubles = parseRubles;
exports.parseRegistryCsv = parseRegistryCsv;
exports.calculateDemoTariff = calculateDemoTariff;
exports.isCalendarDate = isCalendarDate;
function financeGrants(actor) {
    if (actor.role !== "dispatcher" && actor.role !== "document_specialist")
        return [];
    return actor.grants.filter((grant) => grant.financeVisible);
}
function parseRubles(value) {
    // No exponent, negative amount, locale guessing, rounding or binary float conversion.
    if (!/^(?:0|[1-9][0-9]{0,10})(?:[.,][0-9]{1,2})?$/.test(value))
        return null;
    const [whole, fraction = ""] = value.split(/[.,]/);
    const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return amount <= 10000000000000n ? Number(amount) : null;
}
/** Bounded RFC4180-style parser; accepts either comma or semicolon separator, with exact header names. */
function parseRegistryCsv(input) {
    if (typeof input !== "string" || Buffer.byteLength(input, "utf8") > 262144 || input.includes("\0"))
        throw new Error("CSV_SIZE_OR_ENCODING");
    const csv = input.replace(/^\uFEFF/, "");
    const header = csv.split(/\r?\n/, 1)[0];
    const delimiter = /^(?:trip_reference|"trip_reference");(?:amount_rub|"amount_rub")$/.test(header) ? ";" : ",";
    const records = [];
    let record = [], field = "", quoted = false, afterQuote = false;
    const appendField = () => { record.push(field); field = ""; afterQuote = false; };
    const appendRecord = () => { appendField(); records.push(record); record = []; if (records.length > 501)
        throw new Error("CSV_TOO_MANY_ROWS"); };
    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        if (quoted) {
            if (char === '"') {
                if (csv[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                    afterQuote = true;
                }
            }
            else
                field += char;
        }
        else if (char === '"') {
            if (field || afterQuote)
                throw new Error("CSV_INVALID_QUOTES");
            quoted = true;
        }
        else if (char === delimiter)
            appendField();
        else if (char === "\n" || char === "\r") {
            if (char === "\r" && csv[i + 1] === "\n")
                i++;
            appendRecord();
        }
        else {
            if (afterQuote)
                throw new Error("CSV_INVALID_QUOTES");
            field += char;
        }
        if (field.length > 256 || record.length > 2)
            throw new Error("CSV_FIELD_TOO_LONG");
    }
    if (quoted)
        throw new Error("CSV_UNCLOSED_QUOTE");
    if (field || record.length || afterQuote)
        appendRecord();
    if (records[0]?.length !== 2 || records[0][0] !== "trip_reference" || records[0][1] !== "amount_rub")
        throw new Error("CSV_INVALID_HEADER");
    if (records.length < 2)
        throw new Error("CSV_EMPTY");
    const rows = records.slice(1).map((cells, index) => {
        if (cells.length !== 2 || !cells[0] || cells[0].length > 100 || /[\r\n\u0000-\u001f]/.test(cells[0]))
            throw new Error("CSV_INVALID_ROW");
        const amount = parseRubles(cells[1]);
        return { rowNumber: index + 2, tripReference: cells[0], claimedKopecks: amount, reasons: amount === null ? ["invalid_amount"] : [] };
    });
    const counts = new Map();
    rows.forEach((row) => counts.set(row.tripReference, (counts.get(row.tripReference) ?? 0) + 1));
    rows.forEach((row) => { if (counts.get(row.tripReference) > 1)
        row.reasons.push("duplicate_trip"); });
    return rows;
}
function calculateDemoTariff(tariff, facts) {
    const values = [tariff.baseKopecks, tariff.perStopKopecks, tariff.perWaitingMinuteKopecks, facts.stops, facts.waitingMinutes];
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0))
        throw new Error("INVALID_CALCULATION_INPUT");
    const result = BigInt(tariff.baseKopecks) + BigInt(tariff.perStopKopecks) * BigInt(facts.stops) + BigInt(tariff.perWaitingMinuteKopecks) * BigInt(facts.waitingMinutes);
    if (result > 10000000000000n)
        throw new Error("CALCULATION_LIMIT");
    return Number(result);
}
function isCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > "2100-12-31")
        return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
//# sourceMappingURL=finance-rules.js.map