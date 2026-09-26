"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYROLL_DEDUCTION_ORDER = exports.DEFAULT_PAYROLL_DEPOSIT_POLICY = void 0;
exports.validateDepositPolicy = validateDepositPolicy;
exports.calculatePayrollSettlement = calculatePayrollSettlement;
const payroll_rules_1 = require("./payroll-rules");
exports.DEFAULT_PAYROLL_DEPOSIT_POLICY = Object.freeze({
    targetKopecks: 3_000_000,
    maxContributionBasisPoints: 5_000,
});
exports.PAYROLL_DEDUCTION_ORDER = [
    "traffic", "repair", "fuel", "client_claim", "late_documents", "temperature", "other",
];
function money(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= payroll_rules_1.PAYROLL_SUBTOTAL_LIMIT;
}
function evidence(value, maximum = 1_000, multiline = false) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maximum &&
        !(multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
}
function calendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validateDepositPolicy(policy) {
    if (!policy || !money(policy.targetKopecks) || !Number.isSafeInteger(policy.maxContributionBasisPoints) ||
        policy.maxContributionBasisPoints < 0 || policy.maxContributionBasisPoints > 10_000)
        throw new Error("PAYROLL_DEPOSIT_POLICY_INVALID");
}
function validateInput(input) {
    if (!input || ![input.grossKopecks, input.officialKopecks, input.depositOpeningKopecks,
        input.officialPaidKopecks, input.additionalPaidKopecks].every(money))
        throw new Error("PAYROLL_AMOUNT_INVALID");
    validateDepositPolicy(input.policy);
    if (input.officialKopecks > input.grossKopecks || input.officialPaidKopecks > input.officialKopecks ||
        input.additionalPaidKopecks > input.grossKopecks - input.officialKopecks)
        throw new Error("PAYROLL_PAYMENT_ALLOCATION_INVALID");
    if (!evidence(input.grossExplanation, 1_000, true) || !evidence(input.sourceReference, 300) ||
        typeof input.officialPaymentReference !== "string" || typeof input.additionalPaymentReference !== "string" ||
        input.officialPaymentReference.length > 300 || input.additionalPaymentReference.length > 300 ||
        (input.officialPaidKopecks > 0 && !evidence(input.officialPaymentReference, 300)) ||
        (input.additionalPaidKopecks > 0 && !evidence(input.additionalPaymentReference, 300)))
        throw new Error("PAYROLL_EVIDENCE_REQUIRED");
    if (!Array.isArray(input.deductions) || input.deductions.length > 400)
        throw new Error("PAYROLL_DEDUCTIONS_INVALID");
    const ids = new Set();
    let total = 0n;
    const deductionKeys = new Set(["id", "category", "date", "label", "amountKopecks", "explanation", "sourceReference"]);
    for (const deduction of input.deductions) {
        if (!deduction || Object.keys(deduction).some(key => !deductionKeys.has(key)) ||
            !evidence(deduction.id, 100) || ids.has(deduction.id) ||
            !exports.PAYROLL_DEDUCTION_ORDER.includes(deduction.category) || !calendarDate(deduction.date) ||
            !evidence(deduction.label, 200) || !money(deduction.amountKopecks) || deduction.amountKopecks === 0 ||
            !evidence(deduction.explanation, 1_000, true) || !evidence(deduction.sourceReference, 300))
            throw new Error("PAYROLL_DEDUCTION_INVALID");
        ids.add(deduction.id);
        total += BigInt(deduction.amountKopecks);
        if (total > BigInt(payroll_rules_1.PAYROLL_SUBTOTAL_LIMIT))
            throw new Error("PAYROLL_LIMIT");
    }
}
/**
 * Salary is allocated to verified charges before reserving a contribution. Existing paid advances
 * are unavailable funds, and official salary is a separate payment stream. A commission shortfall
 * blocks confirmation: the reserve covers approved deductions, not previously paid cash or fees.
 * Presentation keeps the workbook order without letting that order overfund the deposit.
 */
function calculatePayrollSettlement(input) {
    validateInput(input);
    const commissionBaseKopecks = input.grossKopecks - input.officialKopecks;
    const commissionKopecks = Number((BigInt(commissionBaseKopecks) * 800n + 5000n) / 10000n);
    // Floor rather than half-up: a contribution may never exceed the configured percentage.
    const contributionCapKopecks = Number(BigInt(input.grossKopecks) * BigInt(input.policy.maxContributionBasisPoints) / 10000n);
    let salaryAvailable = commissionBaseKopecks - input.additionalPaidKopecks;
    const salaryCommission = Math.min(salaryAvailable, commissionKopecks);
    salaryAvailable -= salaryCommission;
    const commissionUncovered = commissionKopecks - salaryCommission;
    let depositAvailable = input.depositOpeningKopecks;
    let uncoveredKopecks = commissionUncovered;
    let salaryChargesKopecks = salaryCommission;
    let deductionTotalKopecks = 0;
    // Stable Array.sort preserves entered order inside each category.
    const deductions = input.deductions.map(deduction => ({ ...deduction })).sort((a, b) => exports.PAYROLL_DEDUCTION_ORDER.indexOf(a.category) - exports.PAYROLL_DEDUCTION_ORDER.indexOf(b.category));
    const allocations = deductions.map(deduction => {
        const salaryKopecks = Math.min(salaryAvailable, deduction.amountKopecks);
        salaryAvailable -= salaryKopecks;
        const depositKopecks = Math.min(depositAvailable, deduction.amountKopecks - salaryKopecks);
        depositAvailable -= depositKopecks;
        const uncovered = deduction.amountKopecks - salaryKopecks - depositKopecks;
        uncoveredKopecks += uncovered;
        salaryChargesKopecks += salaryKopecks;
        deductionTotalKopecks += deduction.amountKopecks;
        return { deduction, salaryKopecks, depositKopecks, uncoveredKopecks: uncovered };
    });
    const depositUsedKopecks = input.depositOpeningKopecks - depositAvailable;
    const depositContributionKopecks = uncoveredKopecks === 0 ? Math.min(Math.max(0, input.policy.targetKopecks - depositAvailable), contributionCapKopecks, salaryAvailable) : 0;
    const depositClosingKopecks = depositAvailable + depositContributionKopecks;
    const additionalPayableKopecks = salaryAvailable - depositContributionKopecks;
    const officialRemainingKopecks = input.officialKopecks - input.officialPaidKopecks;
    const steps = [];
    let remainingSalaryKopecks = input.grossKopecks;
    const append = (step) => {
        remainingSalaryKopecks -= step.salaryKopecks;
        steps.push({ ...step, remainingSalaryKopecks });
    };
    append({ id: "official", kind: "official", label: "Официальная часть зарплаты",
        amountKopecks: input.officialKopecks, salaryKopecks: input.officialKopecks, depositKopecks: 0,
        uncoveredKopecks: 0, explanation: "Входит в общую зарплату. Начисление и фактическая выплата учитываются отдельно от дополнительной части.",
        sourceReference: input.sourceReference });
    append({ id: "deposit-contribution", kind: "deposit_contribution", label: "Пополнение депозита",
        amountKopecks: depositContributionKopecks, salaryKopecks: depositContributionKopecks, depositKopecks: 0,
        uncoveredKopecks: 0, explanation: "Минимум из недостающей суммы до цели, лимита от общей зарплаты и остатка после комиссии, текущих удержаний и уже полученных выплат.",
        sourceReference: "Условия депозита, зафиксированные в этом расчёте" });
    append({ id: "commission", kind: "commission", label: "Комиссия 8%",
        amountKopecks: commissionKopecks, salaryKopecks: salaryCommission, depositKopecks: 0,
        uncoveredKopecks: commissionUncovered, explanation: "(Общая зарплата − официальная часть) × 8%. Пополнение депозита не уменьшает базу комиссии.",
        sourceReference: "Формула расчёта deposit-v1" });
    for (const allocation of allocations) {
        const deduction = allocation.deduction;
        append({ id: `deduction:${deduction.id}`, kind: "deduction", category: deduction.category,
            label: deduction.label, amountKopecks: deduction.amountKopecks, salaryKopecks: allocation.salaryKopecks,
            depositKopecks: allocation.depositKopecks, uncoveredKopecks: allocation.uncoveredKopecks,
            date: deduction.date, explanation: deduction.explanation, sourceReference: deduction.sourceReference });
    }
    append({ id: "additional-paid", kind: "payment", label: "Уже получено: авансы и наличные",
        amountKopecks: input.additionalPaidKopecks, salaryKopecks: input.additionalPaidKopecks, depositKopecks: 0,
        uncoveredKopecks: 0, explanation: "Фактически полученные выплаты дополнительной части учтены один раз. Выплата официальной части указана отдельно.",
        sourceReference: input.additionalPaidKopecks > 0 ? input.additionalPaymentReference : "Выплат дополнительной части не было" });
    return {
        ...input, policy: { ...input.policy }, deductions, formulaVersion: "deposit-v1", commissionBasisPoints: 800,
        commissionBaseKopecks, commissionKopecks, contributionCapKopecks, depositContributionKopecks,
        depositUsedKopecks, depositClosingKopecks, deductionTotalKopecks, salaryChargesKopecks,
        uncoveredKopecks, officialRemainingKopecks, additionalPayableKopecks,
        totalPayableKopecks: officialRemainingKopecks + additionalPayableKopecks,
        canConfirm: uncoveredKopecks === 0, steps,
    };
}
//# sourceMappingURL=deposit-rules.js.map