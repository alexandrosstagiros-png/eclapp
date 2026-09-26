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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../../../platform/database.service");
const audit_service_1 = require("../../audit/application/audit.service");
const identity_repository_1 = require("../../identity-access/infrastructure/identity.repository");
const finance_rules_1 = require("../domain/finance-rules");
const payroll_rules_1 = require("../domain/payroll-rules");
const deposit_rules_1 = require("../domain/deposit-rules");
const digest = (value) => (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry)).digest("hex");
const scopeFilter = (alias, n) => `EXISTS(SELECT 1 FROM jsonb_to_recordset($${n}::jsonb) AS allowed("legalEntityId" uuid,"regionId" uuid,"projectId" uuid,"responsibilityScopeId" uuid) WHERE ${alias}.legal_entity_id=allowed."legalEntityId" AND ${alias}.region_id=allowed."regionId" AND ${alias}.project_id=allowed."projectId" AND ${alias}.responsibility_scope_id=allowed."responsibilityScopeId")`;
const iso = (date) => date instanceof Date ? date.toISOString() : date;
const invalid = (message = "Проверьте поля расчёта.") => { throw new common_1.BadRequestException({ code: "PAYROLL_INVALID_INPUT", message }); };
function object(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        invalid();
    const row = value;
    if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !(key in row)))
        invalid();
    return row;
}
function uuid(value) { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    invalid(); return value; }
function text(value, max, multiline = false) { if (typeof value !== "string" || !value.trim() || value.length > max || (multiline ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value))
    invalid(); return value; }
function version(value) { if (!Number.isSafeInteger(value) || value < 1)
    invalid(); return value; }
const requestKeys = ["driverUserId", "projectId", "responsibilityScopeId", "periodStart", "periodEnd", "grossKopecks", "officialKopecks", "grossExplanation", "sourceReference", "officialPaidKopecks", "officialPaymentReference", "additionalPaidKopecks", "additionalPaymentReference", "deductions"];
function monthly(value, confirm) {
    const input = object(value, [...requestKeys, ...(confirm ? ["accountVersion", "idempotencyKey", "humanConfirmed"] : [])]);
    for (const key of ["driverUserId", "projectId", "responsibilityScopeId"])
        uuid(input[key]);
    if (!(0, finance_rules_1.isCalendarDate)(input.periodStart) || !(0, finance_rules_1.isCalendarDate)(input.periodEnd) || input.periodStart > input.periodEnd || Date.parse(input.periodEnd) - Date.parse(input.periodStart) > 366 * 86400000)
        invalid("Укажите корректный расчётный период.");
    // Keep the explanatory gross line within the existing payroll DTO rate limit (10m RUB).
    if (!Number.isSafeInteger(input.grossKopecks) || input.grossKopecks < 0 || input.grossKopecks > 1000000000)
        invalid("Общая зарплата должна быть от 0 до 10 000 000 ₽.");
    if (confirm) {
        uuid(input.idempotencyKey);
        version(input.accountVersion);
        if (input.humanConfirmed !== true)
            invalid("Подтвердите начисления, решения по удержаниям и факты выплат.");
    }
    return input;
}
let DepositService = class DepositService {
    database;
    audit;
    identity;
    constructor(database, audit, identity) {
        this.database = database;
        this.audit = audit;
        this.identity = identity;
    }
    grants(actor, self = false) {
        const grants = self ? (0, payroll_rules_1.payrollGrants)(actor) : (0, finance_rules_1.financeGrants)(actor);
        if (!grants.length)
            throw new common_1.ForbiddenException({ code: "PAYROLL_FORBIDDEN", message: "Нет доступа к расчётам и депозитам." });
        return grants;
    }
    async transaction(actor, self, write, callback) {
        this.grants(actor, self);
        return this.database.transaction(async (client) => {
            await this.identity.lockUsers(client, [actor.id]);
            const current = await this.identity.actorBySession(client, actor.sessionId);
            if (!current || current.id !== actor.id || current.authVersion !== actor.authVersion || current.role !== actor.role)
                throw new common_1.UnauthorizedException({ code: "SESSION_EXPIRED", message: "Сессия недействительна." });
            this.grants(current, self);
            if (write && current.role !== "document_specialist")
                throw new common_1.ForbiddenException({ code: "PAYROLL_WRITE_FORBIDDEN", message: "Изменение доступно специалисту по документам с финансовыми правами." });
            return callback(client, current);
        });
    }
    notFound() { throw new common_1.NotFoundException({ code: "PAYROLL_ACCOUNT_NOT_FOUND", message: "Депозит или расчёт не найден." }); }
    conflict(code, message) { throw new common_1.ConflictException({ code, message }); }
    async auditRead(client, actor, action, id, count, row) {
        await this.audit.append(client, { actorId: actor.id, channel: actor.channel, action, entityType: "payroll_deposit", entityId: id, correlationId: (0, node_crypto_1.randomUUID)(),
            ...(row ? { scope: { legalEntityId: row.legal_entity_id, regionId: row.region_id, projectId: row.project_id, responsibilityScopeId: row.responsibility_scope_id } } : {}), metadata: { ...(count === undefined ? {} : { count }) } });
    }
    async accountRow(client, actor, id, self = false) {
        const row = (await client.query(`SELECT a.*,p.name AS project_name,le.name AS legal_entity_name,rs.name AS responsibility_scope_name FROM payroll_deposit_accounts a JOIN projects p ON p.id=a.project_id JOIN legal_entities le ON le.id=a.legal_entity_id JOIN responsibility_scopes rs ON rs.id=a.responsibility_scope_id WHERE a.id=$1 AND ${scopeFilter("a", 2)} ${self ? "AND a.driver_id=$3" : ""}`, [id, JSON.stringify(this.grants(actor, self)), ...(self ? [actor.id] : [])])).rows[0];
        if (!row)
            this.notFound();
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`payroll-account:${id}`]);
        return row;
    }
    async view(client, row) {
        const policy = (await client.query("SELECT * FROM payroll_deposit_policies WHERE account_id=$1 ORDER BY version DESC LIMIT 1", [row.id])).rows[0];
        if (!policy)
            this.notFound();
        const ledger = (await client.query("SELECT * FROM payroll_deposit_ledger WHERE account_id=$1 ORDER BY sequence", [row.id])).rows;
        const closing = (await client.query("SELECT r.*,r.termination_date::text,p.created_at AS paid_at,p.payment_date::text,p.payment_reference FROM payroll_deposit_returns r LEFT JOIN payroll_deposit_return_payments p ON p.return_id=r.id WHERE r.account_id=$1", [row.id])).rows[0];
        const count = (await client.query("SELECT count(*)::integer AS n FROM driver_payroll_settlements WHERE account_id=$1", [row.id])).rows[0].n;
        return { id: row.id, project: { id: row.project_id, name: row.project_name }, legalEntity: { id: row.legal_entity_id, name: row.legal_entity_name }, responsibilityScope: { id: row.responsibility_scope_id, name: row.responsibility_scope_name },
            policy: { targetKopecks: Number(policy.target_kopecks), maxContributionBasisPoints: policy.max_contribution_basis_points },
            accountVersion: policy.version + count + (closing ? 1 : 0) + (closing?.paid_at ? 1 : 0), balanceKopecks: ledger.length ? Number(ledger[ledger.length - 1].balance_after_kopecks) : 0,
            state: closing?.paid_at ? "returned" : closing ? "reconciled" : "active",
            ledger: ledger.map(entry => ({ id: entry.id, createdAt: iso(entry.created_at), kind: entry.kind, amountKopecks: Number(entry.amount_kopecks), balanceAfterKopecks: Number(entry.balance_after_kopecks), statementId: entry.statement_id, explanation: entry.explanation, sourceReference: entry.source_reference })),
            ...(closing ? { returnInfo: { id: closing.id, terminationDate: closing.termination_date, reconciledAt: iso(closing.created_at), reconciliationReference: closing.reconciliation_reference, explanation: closing.explanation, amountKopecks: Number(closing.amount_kopecks), paidAt: closing.paid_at ? iso(closing.paid_at) : null, paymentDate: closing.payment_date ?? null, paymentReference: closing.payment_reference ?? null } } : {}) };
    }
    async replay(client, actor, key, operation, request) {
        const row = (await client.query("SELECT * FROM payroll_deposit_requests WHERE created_by=$1 AND idempotency_key=$2", [actor.id, key])).rows[0];
        if (!row)
            return null;
        if (row.operation !== operation || row.request_hash !== digest(request))
            this.conflict("IDEMPOTENCY_CONFLICT", "Ключ уже использован для другого запроса.");
        return row.entity_id;
    }
    async remember(client, actor, accountId, key, operation, request, entityId) {
        await client.query("INSERT INTO payroll_deposit_requests(id,account_id,created_by,idempotency_key,operation,request_hash,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [(0, node_crypto_1.randomUUID)(), accountId, actor.id, key, operation, digest(request), entityId]);
    }
    active(account, requestedVersion) {
        if (requestedVersion !== undefined && account.accountVersion !== requestedVersion)
            this.conflict("PAYROLL_ACCOUNT_CHANGED", "Депозит или настройки изменились. Обновите расчёт.");
        if (account.state !== "active")
            this.conflict("PAYROLL_ACCOUNT_CLOSED", "Сверки при увольнении завершены; новые расчёты по этому депозиту закрыты.");
    }
    async catalog(actor) {
        return this.transaction(actor, false, false, async (client, current) => {
            const rows = (await client.query(`SELECT g.*,u.display_name,p.name AS project_name,rs.name AS responsibility_scope_name,a.id AS account_id FROM access_grants g JOIN users u ON u.id=g.user_id JOIN projects p ON p.id=g.project_id JOIN responsibility_scopes rs ON rs.id=g.responsibility_scope_id LEFT JOIN payroll_deposit_accounts a ON a.driver_id=g.user_id AND a.project_id=g.project_id AND a.responsibility_scope_id=g.responsibility_scope_id WHERE u.role='driver' AND u.active AND u.approved AND ${scopeFilter("g", 1)} ORDER BY p.name,rs.name,u.id LIMIT 500`, [JSON.stringify(this.grants(current))])).rows;
            await this.auditRead(client, current, "payroll.office_catalog_viewed", undefined, rows.length);
            return { items: rows.map(row => ({ driverUserId: row.user_id, driverLabel: this.grants(current).some(g => g.personalDataVisible && g.legalEntityId === row.legal_entity_id && g.regionId === row.region_id && g.projectId === row.project_id && g.responsibilityScopeId === row.responsibility_scope_id) ? row.display_name : `Водитель ${row.user_id.slice(0, 8)}`, projectId: row.project_id, projectName: row.project_name, responsibilityScopeId: row.responsibility_scope_id, responsibilityScopeName: row.responsibility_scope_name, accountId: row.account_id })) };
        });
    }
    async list(actor, self = false) {
        return this.transaction(actor, self, false, async (client, current) => {
            const rows = (await client.query(`SELECT a.id FROM payroll_deposit_accounts a WHERE ${scopeFilter("a", 1)} ${self ? "AND a.driver_id=$2" : ""} ORDER BY a.id LIMIT 500`, [JSON.stringify(this.grants(current, self)), ...(self ? [current.id] : [])])).rows;
            const items = [];
            for (const row of rows)
                items.push(await this.view(client, await this.accountRow(client, current, row.id, self)));
            await this.auditRead(client, current, self ? "payroll.self_deposits_viewed" : "payroll.office_deposits_viewed", undefined, items.length);
            return { items };
        });
    }
    async detail(actor, id, self = false) {
        return this.transaction(actor, self, false, async (client, current) => {
            const row = await this.accountRow(client, current, id, self);
            const account = await this.view(client, row);
            await this.auditRead(client, current, self ? "payroll.self_deposit_viewed" : "payroll.office_deposit_viewed", id, undefined, row);
            return account;
        });
    }
    async create(actor, value) {
        const input = object(value, ["driverUserId", "projectId", "responsibilityScopeId", "idempotencyKey"]);
        Object.values(input).forEach(uuid);
        return this.transaction(actor, false, true, async (client, current) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`payroll-new:${input.driverUserId}:${input.projectId}:${input.responsibilityScopeId}`]);
            const scope = (await client.query(`SELECT g.* FROM access_grants g JOIN users u ON u.id=g.user_id WHERE g.user_id=$1 AND g.project_id=$2 AND g.responsibility_scope_id=$3 AND u.active AND u.approved AND u.role='driver' AND ${scopeFilter("g", 4)}`, [input.driverUserId, input.projectId, input.responsibilityScopeId, JSON.stringify(this.grants(current))])).rows[0];
            if (!scope)
                this.notFound();
            const replay = await this.replay(client, current, input.idempotencyKey, "account.create", input);
            if (replay)
                return this.view(client, await this.accountRow(client, current, replay));
            let row = (await client.query("SELECT id FROM payroll_deposit_accounts WHERE driver_id=$1 AND project_id=$2 AND responsibility_scope_id=$3", [input.driverUserId, input.projectId, input.responsibilityScopeId])).rows[0];
            if (!row) {
                row = { id: (0, node_crypto_1.randomUUID)() };
                await client.query("INSERT INTO payroll_deposit_accounts(id,driver_id,legal_entity_id,region_id,project_id,responsibility_scope_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [row.id, input.driverUserId, scope.legal_entity_id, scope.region_id, input.projectId, input.responsibilityScopeId, current.id]);
                await client.query("INSERT INTO payroll_deposit_policies(id,account_id,version,target_kopecks,max_contribution_basis_points,reason,created_by) VALUES($1,$2,1,$3,$4,$5,$6)", [(0, node_crypto_1.randomUUID)(), row.id, deposit_rules_1.DEFAULT_PAYROLL_DEPOSIT_POLICY.targetKopecks, deposit_rules_1.DEFAULT_PAYROLL_DEPOSIT_POLICY.maxContributionBasisPoints, "Создание депозита с настройками по умолчанию.", current.id]);
            }
            const locked = await this.accountRow(client, current, row.id);
            await this.remember(client, current, row.id, input.idempotencyKey, "account.create", input, row.id);
            return this.view(client, locked);
        });
    }
    async policy(actor, id, value) {
        const input = object(value, ["targetKopecks", "maxContributionBasisPoints", "accountVersion", "idempotencyKey", "reason"]);
        uuid(input.idempotencyKey);
        version(input.accountVersion);
        text(input.reason, 2000, true);
        try {
            (0, deposit_rules_1.validateDepositPolicy)({ targetKopecks: input.targetKopecks, maxContributionBasisPoints: input.maxContributionBasisPoints });
        }
        catch {
            invalid("Проверьте сумму депозита и максимальный процент пополнения.");
        }
        return this.transaction(actor, false, true, async (client, current) => {
            const row = await this.accountRow(client, current, id);
            const account = await this.view(client, row);
            if (await this.replay(client, current, input.idempotencyKey, "account.policy", { id, ...input }))
                return account;
            this.active(account, input.accountVersion);
            const latest = (await client.query("SELECT max(version)::integer AS version FROM payroll_deposit_policies WHERE account_id=$1", [id])).rows[0].version;
            await client.query("INSERT INTO payroll_deposit_policies(id,account_id,version,target_kopecks,max_contribution_basis_points,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [(0, node_crypto_1.randomUUID)(), id, latest + 1, input.targetKopecks, input.maxContributionBasisPoints, input.reason, current.id]);
            await this.remember(client, current, id, input.idempotencyKey, "account.policy", { id, ...input }, id);
            return this.view(client, row);
        });
    }
    async monthlyAccount(client, actor, input) {
        const row = (await client.query("SELECT id FROM payroll_deposit_accounts WHERE driver_id=$1 AND project_id=$2 AND responsibility_scope_id=$3", [input.driverUserId, input.projectId, input.responsibilityScopeId])).rows[0];
        if (!row)
            this.notFound();
        return this.accountRow(client, actor, row.id);
    }
    calculate(input, account) {
        try {
            const amounts = Object.fromEntries(requestKeys.filter(key => !["driverUserId", "projectId", "responsibilityScopeId", "periodStart", "periodEnd"].includes(key)).map(key => [key, input[key]]));
            return (0, deposit_rules_1.calculatePayrollSettlement)({ ...amounts, policy: account.policy, depositOpeningKopecks: account.balanceKopecks });
        }
        catch {
            return invalid("Проверьте суммы, пояснения, основания удержаний и уже выплаченные деньги.");
        }
    }
    async period(client, row, input) {
        const conflict = (await client.query(`SELECT 1 FROM driver_payroll_settlements WHERE account_id=$1 AND period_start<=$3::date AND period_end>=$2::date UNION ALL SELECT 1 FROM driver_payroll_statements WHERE driver_id=$4 AND project_id=$5 AND responsibility_scope_id=$6 AND status='approved' AND period_start<=$3::date AND period_end>=$2::date LIMIT 1`, [row.id, input.periodStart, input.periodEnd, row.driver_id, row.project_id, row.responsibility_scope_id])).rowCount;
        if (conflict)
            this.conflict("PAYROLL_PERIOD_CONFIRMED", "Период пересекается с уже утверждённой ведомостью.");
        const later = (await client.query("SELECT 1 FROM driver_payroll_settlements WHERE account_id=$1 AND period_end>$2::date LIMIT 1", [row.id, input.periodEnd])).rowCount;
        if (later)
            this.conflict("PAYROLL_PERIOD_ORDER", "Нельзя добавить более ранний период после позднего: остаток депозита уже использован.");
    }
    async preview(actor, value) {
        const input = monthly(value, false);
        return this.transaction(actor, false, false, async (client, current) => {
            const row = await this.monthlyAccount(client, current, input);
            const account = await this.view(client, row);
            this.active(account);
            await this.period(client, row, input);
            const result = this.calculate(input, account);
            await this.auditRead(client, current, "payroll.office_preview_viewed", row.id, undefined, row);
            return { accountVersion: account.accountVersion, result };
        });
    }
    snapshot(id, account, input, result, sourceKind) {
        const line = (lineId, label, amount, explanation, sourceReference, unit = "item") => ({ id: lineId.length > 100 ? `line:${digest(lineId)}` : lineId, date: input.periodEnd, label, quantityHundredths: 100, unit, rateKopecks: amount, amountKopecks: amount, explanation, sourceReference });
        const deductions = result.steps.filter(step => step.kind !== "official" && step.kind !== "payment" && step.salaryKopecks > 0).map(step => line(step.id, step.label, step.salaryKopecks, step.explanation, step.sourceReference));
        const payments = [line("official-paid", "Перечисленная официальная часть", result.officialPaidKopecks, "Учтённый сотрудником факт выплаты; автоматического банковского перевода нет.", result.officialPaymentReference || "Выплаты ещё нет", "payment"), line("additional-paid", "Уже получено: аванс / наличные", result.additionalPaidKopecks, "Учтено в выплатах один раз.", result.additionalPaymentReference || "Выплаты ещё нет", "payment")].filter(item => item.amountKopecks > 0);
        const deducted = result.salaryChargesKopecks + result.depositContributionKopecks;
        const now = new Date().toISOString();
        return { id, revision: 1, periodStart: input.periodStart, periodEnd: input.periodEnd, project: account.project, legalEntity: account.legalEntity, responsibilityScope: account.responsibilityScope, status: "approved", sourceKind, calculatedAt: now, approvedAt: now, currency: "RUB", openingBalanceKopecks: 0, openingBalanceExplanation: "Отдельный расчёт периода. Депозит отражён своим балансом; входящий долг по зарплате не подставляется автоматически.", earnedKopecks: result.grossKopecks, deductedKopecks: deducted, netKopecks: result.grossKopecks - deducted, paidKopecks: result.officialPaidKopecks + result.additionalPaidKopecks, balanceKopecks: result.totalPayableKopecks, earnings: [line("gross", "Общая зарплата, включая официальную часть", result.grossKopecks, result.grossExplanation, result.sourceReference)], deductions, payments, settlement: result };
    }
    async ledger(client, actor, accountId, kind, amount, statementId, returnId, explanation, source) {
        if (!amount)
            return;
        const previous = (await client.query("SELECT sequence,balance_after_kopecks FROM payroll_deposit_ledger WHERE account_id=$1 ORDER BY sequence DESC LIMIT 1", [accountId])).rows[0];
        await client.query("INSERT INTO payroll_deposit_ledger(id,account_id,sequence,kind,amount_kopecks,balance_after_kopecks,statement_id,return_id,explanation,source_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [(0, node_crypto_1.randomUUID)(), accountId, (previous?.sequence ?? 0) + 1, kind, amount, Number(previous?.balance_after_kopecks ?? 0) + amount, statementId, returnId, explanation, source, actor.id]);
    }
    async confirm(actor, value, sourceKind = "manual_verified") {
        if (sourceKind === "demo_manual" && (!["development", "test"].includes(process.env.NODE_ENV ?? "") || process.env.DEMO_AUTH_ENABLED !== "true"))
            invalid();
        const input = monthly(value, true);
        return this.transaction(actor, false, true, async (client, current) => {
            const row = await this.monthlyAccount(client, current, input);
            const replay = await this.replay(client, current, input.idempotencyKey, "payroll.confirm", input);
            if (replay)
                return (await client.query("SELECT snapshot FROM driver_payroll_settlements WHERE id=$1 AND account_id=$2", [replay, row.id])).rows[0].snapshot;
            const account = await this.view(client, row);
            this.active(account, input.accountVersion);
            await this.period(client, row, input);
            const result = this.calculate(input, account);
            if (!result.canConfirm)
                this.conflict("PAYROLL_UNCOVERED", "Зарплаты и депозита недостаточно для удержаний. Уточните решения и суммы; расчёт не утверждён.");
            const snapshot = this.snapshot((0, node_crypto_1.randomUUID)(), account, input, result, sourceKind);
            await client.query("INSERT INTO driver_payroll_settlements(id,account_id,period_start,period_end,snapshot,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)", [snapshot.id, row.id, input.periodStart, input.periodEnd, JSON.stringify(snapshot), current.id]);
            await this.ledger(client, current, row.id, "deduction", -result.depositUsedKopecks, snapshot.id, null, "Часть подтверждённых удержаний, для которой не хватило зарплаты. Расшифровка по строкам в ведомости.", `Утверждённая ведомость ${input.periodStart} — ${input.periodEnd}`);
            await this.ledger(client, current, row.id, "contribution", result.depositContributionKopecks, snapshot.id, null, "Пополнение до цели в пределах установленного процента от общей зарплаты и доступного остатка после удержаний и выплат.", `Утверждённая ведомость ${input.periodStart} — ${input.periodEnd}`);
            await this.remember(client, current, row.id, input.idempotencyKey, "payroll.confirm", input, snapshot.id);
            return snapshot;
        });
    }
    async statement(actor, id) {
        return this.transaction(actor, false, false, async (client, current) => {
            const row = (await client.query(`SELECT s.snapshot,a.* FROM driver_payroll_settlements s JOIN payroll_deposit_accounts a ON a.id=s.account_id WHERE s.id=$1 AND ${scopeFilter("a", 2)}`, [id, JSON.stringify(this.grants(current))])).rows[0];
            if (!row)
                this.notFound();
            await this.auditRead(client, current, "payroll.office_statement_viewed", id, undefined, row);
            return row.snapshot;
        });
    }
    async statements(actor, id) {
        return this.transaction(actor, false, false, async (client, current) => {
            const account = await this.accountRow(client, current, id);
            const rows = (await client.query("SELECT snapshot FROM driver_payroll_settlements WHERE account_id=$1 ORDER BY period_end DESC,period_start DESC,created_at DESC,id DESC LIMIT 24", [id])).rows;
            await this.auditRead(client, current, "payroll.office_statements_viewed", id, rows.length, account);
            return { items: rows.map(({ snapshot }) => {
                    const { openingBalanceExplanation, earnings, deductions, payments, settlement, ...summary } = snapshot;
                    return summary;
                }) };
        });
    }
    async reconcile(actor, id, value) {
        const input = object(value, ["terminationDate", "reconciliationReference", "explanation", "accountVersion", "idempotencyKey", "humanConfirmed"]);
        uuid(input.idempotencyKey);
        version(input.accountVersion);
        text(input.reconciliationReference, 300);
        text(input.explanation, 2000, true);
        if (input.humanConfirmed !== true || !(0, finance_rules_1.isCalendarDate)(input.terminationDate) || input.terminationDate > new Date().toISOString().slice(0, 10))
            invalid("Укажите наступившую дату увольнения и подтвердите завершение всех сверок.");
        return this.transaction(actor, false, true, async (client, current) => {
            const row = await this.accountRow(client, current, id);
            const account = await this.view(client, row);
            if (await this.replay(client, current, input.idempotencyKey, "account.reconcile", { id, ...input }))
                return account;
            this.active(account, input.accountVersion);
            if ((await client.query("SELECT 1 FROM driver_payroll_settlements WHERE account_id=$1 AND period_end>$2::date LIMIT 1", [id, input.terminationDate])).rowCount)
                this.conflict("PAYROLL_TERMINATION_BEFORE_PERIOD", "Дата увольнения раньше уже утверждённого периода.");
            await client.query("INSERT INTO payroll_deposit_returns(id,account_id,termination_date,amount_kopecks,reconciliation_reference,explanation,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [(0, node_crypto_1.randomUUID)(), id, input.terminationDate, account.balanceKopecks, input.reconciliationReference, input.explanation, current.id]);
            await this.remember(client, current, id, input.idempotencyKey, "account.reconcile", { id, ...input }, id);
            return this.view(client, row);
        });
    }
    async returnPayment(actor, id, value) {
        const input = object(value, ["paymentDate", "paymentReference", "accountVersion", "idempotencyKey", "humanConfirmed"]);
        uuid(input.idempotencyKey);
        version(input.accountVersion);
        text(input.paymentReference, 300);
        if (input.humanConfirmed !== true || !(0, finance_rules_1.isCalendarDate)(input.paymentDate) || input.paymentDate > new Date().toISOString().slice(0, 10))
            invalid("Укажите дату и основание фактически выполненного возврата.");
        return this.transaction(actor, false, true, async (client, current) => {
            const row = await this.accountRow(client, current, id);
            const account = await this.view(client, row);
            if (await this.replay(client, current, input.idempotencyKey, "account.return_payment", { id, ...input }))
                return account;
            if (account.accountVersion !== input.accountVersion)
                this.conflict("PAYROLL_ACCOUNT_CHANGED", "Состояние депозита изменилось. Обновите карточку.");
            if (account.state !== "reconciled" || !account.returnInfo)
                this.conflict("PAYROLL_RECONCILIATION_REQUIRED", "Для возврата требуется завершить сверки при увольнении.");
            if (input.paymentDate < account.returnInfo.terminationDate)
                invalid("Дата возврата не может быть раньше увольнения.");
            if (input.paymentDate < account.returnInfo.reconciledAt.slice(0, 10))
                invalid("Дата возврата не может быть раньше зафиксированного завершения сверок.");
            await client.query("INSERT INTO payroll_deposit_return_payments(id,account_id,return_id,payment_date,payment_reference,created_by) VALUES($1,$2,$3,$4,$5,$6)", [(0, node_crypto_1.randomUUID)(), id, account.returnInfo.id, input.paymentDate, input.paymentReference, current.id]);
            await this.ledger(client, current, id, "return", -account.returnInfo.amountKopecks, null, account.returnInfo.id, "Возврат остатка депозита после завершения сверок при увольнении. Факт выплаты зарегистрирован сотрудником.", input.paymentReference);
            await this.remember(client, current, id, input.idempotencyKey, "account.return_payment", { id, ...input }, id);
            return this.view(client, row);
        });
    }
};
exports.DepositService = DepositService;
exports.DepositService = DepositService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, audit_service_1.AuditService, identity_repository_1.IdentityRepository])
], DepositService);
//# sourceMappingURL=deposit.service.js.map