"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYROLL_SUBTOTAL_LIMIT = void 0;
exports.payrollGrants = payrollGrants;
exports.payrollLineAmount = payrollLineAmount;
exports.payrollSubtotal = payrollSubtotal;
exports.payrollTotals = payrollTotals;
exports.PAYROLL_SUBTOTAL_LIMIT = 1_000_000_000_000;
const units = new Set(["shift", "hour", "trip", "stop", "kilometer", "day", "item", "payment"]);
/** Own salary visibility never grants office finance visibility or another driver's data. */
function payrollGrants(actor) {
    return actor.role === "driver" ? actor.grants : [];
}
function whole(value, maximum) {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function payrollLineAmount(quantityHundredths, rateKopecks) {
    if (!whole(quantityHundredths, 1_000_000_000) || quantityHundredths === 0 || !whole(rateKopecks, 1_000_000_000))
        throw new Error("PAYROLL_LINE_INVALID");
    const amount = (BigInt(quantityHundredths) * BigInt(rateKopecks) + 50n) / 100n;
    if (amount > BigInt(exports.PAYROLL_SUBTOTAL_LIMIT))
        throw new Error("PAYROLL_LIMIT");
    return Number(amount);
}
function payrollSubtotal(lines) {
    if (!Array.isArray(lines) || lines.length > 400)
        throw new Error("PAYROLL_LINES_INVALID");
    let total = 0n;
    const ids = new Set();
    for (const line of lines) {
        if (!line || typeof line.id !== "string" || ids.has(line.id) || !units.has(line.unit) ||
            !whole(line.amountKopecks, exports.PAYROLL_SUBTOTAL_LIMIT) ||
            payrollLineAmount(line.quantityHundredths, line.rateKopecks) !== line.amountKopecks)
            throw new Error("PAYROLL_LINE_INVALID");
        ids.add(line.id);
        total += BigInt(line.amountKopecks);
        if (total > BigInt(exports.PAYROLL_SUBTOTAL_LIMIT))
            throw new Error("PAYROLL_LIMIT");
    }
    return Number(total);
}
function payrollTotals(openingBalanceKopecks, earnings, deductions, payments) {
    if (!Number.isSafeInteger(openingBalanceKopecks) || Math.abs(openingBalanceKopecks) > exports.PAYROLL_SUBTOTAL_LIMIT)
        throw new Error("PAYROLL_OPENING_BALANCE_INVALID");
    const earnedKopecks = payrollSubtotal(earnings);
    const deductedKopecks = payrollSubtotal(deductions);
    const paidKopecks = payrollSubtotal(payments);
    const netKopecks = earnedKopecks - deductedKopecks;
    return { openingBalanceKopecks, earnedKopecks, deductedKopecks, netKopecks, paidKopecks,
        balanceKopecks: openingBalanceKopecks + netKopecks - paidKopecks };
}
//# sourceMappingURL=payroll-rules.js.map