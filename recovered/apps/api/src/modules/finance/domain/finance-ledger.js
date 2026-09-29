'use strict';

// The journal uses exact signed kopecks: debit is positive, credit negative.
// Business operations, never report cells, are the accounting source of truth.
const { randomUUID } = require('node:crypto');
const { validateArticle, resolveArticle } = require('./finance-articles');
const COMMON = '__common__';
const UNASSIGNED = '__unassigned__';
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const ACCOUNTS = Object.freeze({
  cash: { label: 'Деньги', section: 'assets' },
  ar: { label: 'Дебиторская задолженность', section: 'assets' },
  supplier_advance: { label: 'Авансы поставщикам', section: 'assets' },
  input_vat: { label: 'Входной НДС', section: 'assets' },
  inventory: { label: 'Запасы', section: 'assets' },
  fixed_asset: { label: 'Основные средства', section: 'assets' },
  accumulated_depreciation: {
    label: 'Накопленная амортизация',
    section: 'assets',
  },
  loan_receivable: { label: 'Выданные займы', section: 'assets' },
  ap: { label: 'Кредиторская задолженность', section: 'liabilities' },
  customer_advance: {
    label: 'Авансы покупателей',
    section: 'liabilities',
  },
  output_vat: { label: 'НДС с реализации', section: 'liabilities' },
  loan_payable: { label: 'Полученные займы', section: 'liabilities' },
  tax_payable: { label: 'Налоги к уплате', section: 'liabilities' },
  payroll_payable: {
    label: 'Расчеты по оплате труда',
    section: 'liabilities',
  },
  equity: { label: 'Капитал', section: 'equity' },
  retained_earnings: { label: 'Накопленный результат', section: 'equity' },
  revenue: { label: 'Выручка', section: 'pnl' },
  expense: { label: 'Расходы', section: 'pnl' },
  treasury: { label: 'Расчеты с общим казначейством', section: 'dynamic' },
  suspense: { label: 'Неразобранные операции', section: 'dynamic' },
});
const OPERATION_KINDS = Object.freeze([
  'sale',
  'expense',
  'asset_purchase',
  'inventory_purchase',
  'payment_in',
  'payment_out',
  'customer_advance',
  'supplier_advance',
  'cash_in',
  'cash_out',
  'capital_in',
  'owner_distribution',
  'loan_received',
  'loan_repayment',
  'loan_issued',
  'loan_returned',
  'interest',
  'depreciation',
  'inventory_consumption',
  'fuel_sale',
  'fuel_own_consumption',
  'transfer',
  'opening',
  'adjustment',
  'consolidation_adjustment',
  'settlement',
  'setoff',
  'reversal',
]);
const ERRORS = {
  INVALID_MONEY: 'Укажите точную сумму с точностью до копейки, без округления.',
  INVALID_AMOUNT: 'Сумма должна быть положительной.',
  AMOUNT_REQUIRED: 'Укажите сумму операции.',
  AMOUNT_OVERFLOW: 'Сумма превышает допустимую точность учета.',
  INVALID_DATE: 'Укажите существующую дату в формате ГГГГ-ММ-ДД.',
  COUNTERPARTY_REQUIRED: 'Укажите контрагента.',
  SUPPLIER_REQUIRED: 'Укажите поставщика топлива.',
  CASH_ACCOUNT_REQUIRED: 'Укажите банковский счет или кассу.',
  LEGAL_ENTITY_REQUIRED: 'Укажите собственное юридическое лицо.',
  INVALID_CASH_ACCOUNT: 'Счет недоступен для этой операции.',
  PERIOD_CLOSED:
    'Период закрыт; оформите корректировку открытым периодом или переоткройте его.',
  BEFORE_CUTOVER:
    'Операция предшествует дате перехода; сопоставьте ее с входящими остатками.',
  DEPENDENT_OPERATIONS:
    'Сначала отмените связанные оплаты, зачеты или использование актива.',
  OVER_SETTLEMENT: 'Сумма превышает остаток документа или доступного аванса.',
  DOCUMENT_NOT_FOUND: 'Расчетный документ не найден.',
  PAYMENT_NOT_FOUND: 'Доступный платеж не найден.',
  EMPTY_SETTLEMENT: 'Выберите документы и суммы погашения.',
  SETTLEMENT_PARTY_MISMATCH:
    'Документ и платеж относятся к разным контрагентам.',
  SETTLEMENT_SIDE_MISMATCH:
    'Поступление погашает дебиторку, выплата — кредиторку.',
  CROSS_ENTITY_SETTLEMENT:
    'Нельзя погасить долг другого юридического лица без отдельного основания.',
  CROSS_SCOPE_SETTLEMENT:
    'Для расчетов между проектами нужны полные финансовые права организации.',
  INSUFFICIENT_ADVANCE: 'Оплаченного остатка аванса недостаточно.',
  INSUFFICIENT_INVENTORY: 'Подтвержденного остатка запасов недостаточно.',
  EXCESS_DEPRECIATION: 'Амортизация превышает остаточную стоимость.',
  LOAN_OVER_REPAYMENT: 'Возврат превышает остаток займа.',
  DUPLICATE_SOURCE: 'Эта версия источника уже учтена.',
  DUPLICATE_OPERATION: 'Операция с таким идентификатором уже существует.',
  UNBALANCED_OPERATION: 'Дебет и кредит операции не сходятся.',
  VAT_EXCEEDS_AMOUNT: 'НДС не может превышать сумму с налогом.',
  ALLOCATION_NOT_100: 'Сумма долей распределения должна составлять 100%.',
  ALLOCATION_RULE_UNAVAILABLE:
    'Правило распределения недоступно на дату операции.',
  CORRECTION_REASON_REQUIRED: 'Укажите основание корректировки.',
  SETOFF_BASIS_REQUIRED: 'Укажите основание взаимозачета.',
  ORIGINAL_NOT_REVERSIBLE: 'Операция недоступна для отмены или уже отменена.',
  CASH_ADJUSTMENT_FORBIDDEN:
    'Деньги изменяются подтвержденной банковской или кассовой операцией.',
  CONSOLIDATION_ENTITIES_REQUIRED:
    'Корректировка свода должна ссылаться минимум на две свои организации.',
};
function fail(code, detail) {
  const userMessage =
    ERRORS[code] ||
    'Проверьте обязательные поля и допустимые значения финансовой операции.';
  const e = new Error(
    `FINANCE_${code}: ${userMessage}${detail ? ' ' + detail : ''}`,
  );
  e.code = `FINANCE_${code}`;
  e.userMessage = userMessage;
  e.status =
    code === 'PERIOD_CLOSED' || code === 'DEPENDENT_OPERATIONS' ? 409 : 400;
  throw e;
}
function integer(value) {
  if (typeof value === 'string' && /^-?\d+$/.test(value))
    return safe(BigInt(value));
  if (!Number.isSafeInteger(value)) fail('INVALID_MONEY');
  return value;
}
function safe(value) {
  if (value > MAX || value < -MAX) fail('AMOUNT_OVERFLOW');
  return Number(value);
}
function sum(values) {
  return safe(values.reduce((a, v) => a + BigInt(integer(v)), 0n));
}
function toKopecks(value) {
  const text = String(value ?? '')
    .trim()
    .replace(/\u00a0/g, '');
  if (!/^-?(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/.test(text)) fail('INVALID_MONEY');
  const negative = text[0] === '-';
  const [whole, fraction = ''] = text.replace(/^-/, '').split(/[.,]/);
  return safe(
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) *
      (negative ? -1n : 1n),
  );
}
function formatMoney(value) {
  const n = BigInt(integer(value));
  const abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
function money(input, name = 'amount', optional = false) {
  const value =
    input[`${name}Kopecks`] !== undefined
      ? integer(input[`${name}Kopecks`])
      : input[name] !== undefined
        ? toKopecks(input[name])
        : optional
          ? 0
          : fail('AMOUNT_REQUIRED');
  if (value < 0 || (!optional && value === 0)) fail('INVALID_AMOUNT');
  return value;
}
function date(value, optional = false) {
  if (optional && (value === null || value === undefined || value === ''))
    return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    fail('INVALID_DATE');
  return value;
}
function required(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000)
    fail(code);
  return value.trim();
}
function unpack(row) {
  return row?.data && typeof row.data === 'object'
    ? { ...row, ...row.data, id: row.id || row.data.id }
    : row;
}
function operations(state = {}) {
  return (state.operations || []).map(unpack);
}
function catalogs(state = {}) {
  return (state.catalogs || []).map(unpack);
}
function getCatalog(state, id, kind) {
  return catalogs(state).find((c) => c.id === id && (!kind || c.kind === kind));
}
function sameOwner(a, b, context = {}) {
  if (a.legalEntityId !== b.legalEntityId) fail('CROSS_ENTITY_SETTLEMENT');
  if (
    !context.allowCrossScopeSettlements &&
    a.responsibilityScopeId &&
    b.responsibilityScopeId &&
    a.responsibilityScopeId !== b.responsibilityScopeId
  )
    fail('CROSS_SCOPE_SETTLEMENT');
  if (a.accessScopeIds)
    a.accessScopeIds = [
      ...new Set(
        [
          ...a.accessScopeIds,
          ...(b.accessScopeIds || []),
          b.responsibilityScopeId,
        ].filter(Boolean),
      ),
    ];
}
function scopeOf(input) {
  return {
    legalEntityId: input.legalEntityId || input.scope?.legalEntityId,
    regionId: input.regionId || input.scope?.regionId,
    projectId: input.projectId || input.scope?.projectId,
    responsibilityScopeId:
      input.responsibilityScopeId || input.scope?.responsibilityScopeId,
  };
}
function weights(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    fail('INVALID_ALLOCATION');
  const ids = new Set();
  const result = input.map((item) => {
    const directionId = required(item.directionId, 'DIRECTION_REQUIRED');
    if (ids.has(directionId)) fail('DUPLICATE_DIRECTION');
    ids.add(directionId);
    const basisPoints =
      item.basisPoints !== undefined
        ? integer(item.basisPoints)
        : toKopecks(item.percent);
    if (basisPoints <= 0 || basisPoints > 10000) fail('INVALID_ALLOCATION');
    return { directionId, basisPoints };
  });
  if (sum(result.map((w) => w.basisPoints)) !== 10000)
    fail('ALLOCATION_NOT_100');
  return result;
}
function allocateAmount(amountKopecks, inputWeights) {
  const ws = weights(inputWeights);
  const n = integer(amountKopecks);
  const sign = n < 0 ? -1 : 1;
  const amount = BigInt(Math.abs(n));
  const rows = ws.map((w) => ({
    ...w,
    amountKopecks: Number((amount * BigInt(w.basisPoints)) / 10000n),
    remainder: Number((amount * BigInt(w.basisPoints)) % 10000n),
  }));
  let residual = Math.abs(n) - sum(rows.map((r) => r.amountKopecks));
  const ordered = [...rows].sort(
    (a, b) =>
      b.remainder - a.remainder || a.directionId.localeCompare(b.directionId),
  );
  for (let i = 0; i < residual; i++) ordered[i].amountKopecks++;
  return rows.map(({ directionId, amountKopecks: amount }) => ({
    directionId,
    amountKopecks: amount * sign,
  }));
}
function validateCatalog(kind, raw = {}, context = {}) {
  if (typeof kind === 'object') {
    context = raw || {};
    raw = kind;
    kind = raw.kind;
  }
  if (
    ![
      'parties',
      'directions',
      'articles',
      'accounts',
      'allocation_rules',
      'plans',
      'import_previews',
      'settings',
      'classification_rules',
      'reconciliations',
    ].includes(kind)
  )
    fail('INVALID_CATALOG_KIND');
  const input = unpack(raw);
  const value = {
    ...input,
    kind,
    id: input.id || randomUUID(),
    name: required(input.name || input.label, 'NAME_REQUIRED'),
  };
  if (kind === 'articles') return validateArticle(value);
  if (kind === 'parties') {
    if (value.inn && !/^\d{10}(?:\d{2})?$/.test(value.inn)) fail('INVALID_INN');
    if (value.kpp && !/^\d{9}$/.test(value.kpp)) fail('INVALID_KPP');
    value.roles = Array.isArray(value.roles)
      ? [...new Set(value.roles.map(String))]
      : [];
    value.identityLinks = Array.isArray(value.identityLinks)
      ? value.identityLinks
      : [];
  }
  if (kind === 'accounts') {
    value.type = value.type || 'bank';
    if (!['bank', 'cash'].includes(value.type)) fail('INVALID_CASH_ACCOUNT');
    value.directionId = value.directionId || COMMON;
    if (value.statementDate || value.statementBalanceKopecks !== undefined) {
      value.statementDate = date(value.statementDate);
      value.statementBalanceKopecks = integer(value.statementBalanceKopecks);
    }
  }
  if (kind === 'allocation_rules') {
    value.effectiveFrom = date(value.effectiveFrom);
    value.effectiveTo = date(value.effectiveTo, true);
    value.weights = weights(value.weights);
    if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom)
      fail('INVALID_PERIOD');
    value.version = Number(value.version || 1);
  }
  if (kind === 'plans') {
    value.amountKopecks = money(value);
    value.expectedDate = date(value.expectedDate || value.date, true);
    if (!['in', 'out'].includes(value.flow)) fail('INVALID_FLOW');
    value.status = value.status || 'planned';
    if (!['planned', 'approved', 'cancelled'].includes(value.status))
      fail('INVALID_PLAN_STATUS');
    value.directionId = value.directionId || COMMON;
    if (value.documentId) {
      const document = documentRows(
        operations(context).filter((o) => !o.consolidationOnly),
      ).find(
        (d) =>
          d.id === value.documentId && d.legalEntityId === value.legalEntityId,
      );
      if (document) {
        const previous = getCatalog(context, value.id, 'plans');
        value.settledBaselineKopecks =
          previous && previous.amountKopecks === value.amountKopecks
            ? integer(previous.settledBaselineKopecks || 0)
            : Math.max(0, document.amountKopecks - document.remainingKopecks);
        if (value.flow !== (document.side === 'receivable' ? 'in' : 'out'))
          fail('SETTLEMENT_SIDE_MISMATCH');
      }
    }
  }
  return value;
}
function ensureOpen(input, context) {
  for (const row of context.closures || []) {
    const c = unpack(row);
    if (c.reopenedAt || c.reopened_at) continue;
    if ((c.legalEntityId || c.legal_entity_id) !== input.legalEntityId)
      continue;
    const sid = c.responsibilityScopeId || c.responsibility_scope_id;
    if (
      sid &&
      input.responsibilityScopeId &&
      sid !== input.responsibilityScopeId
    )
      continue;
    if (
      (c.from || c.dateFrom || c.date_from) <= input.date &&
      (c.to || c.dateTo || c.date_to) >= input.date
    )
      fail('PERIOD_CLOSED');
  }
  const cutoverDate =
    context.cutoverDate ||
    catalogs(context).find(
      (c) => c.kind === 'settings' && c.legalEntityId === input.legalEntityId,
    )?.cutoverDate;
  if (cutoverDate && input.kind !== 'opening' && input.date < cutoverDate)
    fail('BEFORE_CUTOVER');
}
function isReversed(id, ops) {
  return ops.some((o) => (o.reversesId || o.originalOperationId) === id);
}
function accountBalance(context, owner, account, party, directionId) {
  return sum(
    operations(context)
      .filter(
        (o) =>
          !o.consolidationOnly &&
          o.legalEntityId === owner.legalEntityId &&
          o.date <= owner.date &&
          (context.allowCrossScopeSettlements ||
            !owner.responsibilityScopeId ||
            o.responsibilityScopeId === owner.responsibilityScopeId),
      )
      .flatMap((o) => o.postings || [])
      .filter(
        (p) =>
          p.account === account &&
          (!party || p.counterpartyId === party) &&
          (!directionId || p.directionId === directionId),
      )
      .map((p) => p.amountKopecks),
  );
}
function documentRows(ops) {
  const map = new Map();
  const byId = new Map(ops.map((o) => [o.id, o]));
  for (const op of ops)
    for (const p of op.postings || []) {
      if (!['ar', 'ap'].includes(p.account) || !p.documentId) continue;
      const postingEntity = p.legalEntityId || op.legalEntityId;
      const key = `${postingEntity}:${p.account}:${p.documentId}`;
      let row = map.get(key);
      const created = !row;
      if (!row) {
        row = {
          id: p.documentId,
          documentId: p.documentId,
          operationId: p.originOperationId || p.documentId,
          legalEntityId: postingEntity,
          regionId: p.regionId || op.regionId,
          projectId: p.projectId || op.projectId,
          responsibilityScopeId:
            p.responsibilityScopeId || op.responsibilityScopeId,
          counterpartyId: p.counterpartyId || null,
          directionId: p.directionId,
          side: p.account === 'ar' ? 'receivable' : 'payable',
          date: op.date,
          dueDate: p.dueDate || null,
          expectedDate: p.expectedDate || p.dueDate || null,
          amountKopecks: 0,
          remainingKopecks: 0,
          status: op.status,
          description: op.description || op.article || '',
          articleId: p.articleId || null,
          article: p.article || op.article || '',
          intercompany: p.intercompany || null,
          directionAmounts: {},
          originalDirectionAmounts: {},
        };
        map.set(key, row);
      }
      const n = p.amountKopecks * (p.account === 'ar' ? 1 : -1);
      row.remainingKopecks = sum([row.remainingKopecks, n]);
      row.directionAmounts[p.directionId] = sum([
        row.directionAmounts[p.directionId] || 0,
        n,
      ]);
      const reversed =
        op.kind === 'reversal'
          ? byId.get(op.reversesId || op.originalOperationId)
          : null;
      const adjustsAccrual =
        op.kind === 'adjustment' || reversed?.kind === 'adjustment';
      if (op.consolidationOnly) {
        row.eliminatedKopecks = sum([row.eliminatedKopecks || 0, -n]);
        row.eliminatedDirectionAmounts ||= {};
        row.eliminatedDirectionAmounts[p.directionId] = sum([
          row.eliminatedDirectionAmounts[p.directionId] || 0,
          -n,
        ]);
      } else if (
        reversed &&
        (p.documentId === reversed.id ||
          p.documentId === `${reversed.id}:cost` ||
          reversed.kind === 'opening')
      ) {
        row.cancelledKopecks = sum([row.cancelledKopecks || 0, -n]);
        row.cancelledDirectionAmounts ||= {};
        row.cancelledDirectionAmounts[p.directionId] = sum([
          row.cancelledDirectionAmounts[p.directionId] || 0,
          -n,
        ]);
      }
      if (
        !p.isSettlement &&
        (op.id === p.documentId ||
          p.documentId === `${op.id}:cost` ||
          op.kind === 'opening' ||
          adjustsAccrual)
      ) {
        row.amountKopecks = sum([row.amountKopecks, n]);
        row.originalDirectionAmounts[p.directionId] = sum([
          row.originalDirectionAmounts[p.directionId] || 0,
          n,
        ]);
        if (!adjustsAccrual || created) {
          row.operationId = op.id;
          row.date = op.date;
          row.description = op.description || op.article || '';
          row.status = op.status;
          row.dueDate = p.dueDate || op.dueDate || row.dueDate;
          row.expectedDate = p.expectedDate || op.expectedDate || row.dueDate;
          row.cashFlowCategory =
            op.cashFlowCategory ||
            (op.kind === 'asset_purchase' ? 'investing' : 'operating');
        }
      }
    }
  return [...map.values()].map((row) => ({
    ...row,
    status:
      row.cancelledKopecks && row.cancelledKopecks >= row.amountKopecks
        ? 'cancelled'
        : row.status,
    settledKopecks: sum([
      row.amountKopecks,
      -row.remainingKopecks,
      -(row.cancelledKopecks || 0),
      -(row.eliminatedKopecks || 0),
    ]),
  }));
}
function buildOperation(raw, context = {}) {
  if (!raw || typeof raw !== 'object') fail('INVALID_OPERATION');
  const owner = scopeOf(raw);
  required(owner.legalEntityId, 'LEGAL_ENTITY_REQUIRED');
  const kind = raw.kind;
  if (!OPERATION_KINDS.includes(kind)) fail('INVALID_OPERATION_KIND');
  if (!raw.articleId && !raw.article && raw.allocationRuleId) {
    const rule = getCatalog(context, raw.allocationRuleId, 'allocation_rules');
    if (rule?.articleId || rule?.article)
      raw = { ...raw, articleId: rule.articleId, article: rule.article };
  }
  const op = {
    ...raw,
    ...owner,
    accessScopeIds: [owner.responsibilityScopeId].filter(Boolean),
    id: raw.id || randomUUID(),
    version: 1,
    kind,
    date: date(raw.date),
    directionId:
      raw.directionId ||
      ([
        'sale',
        'expense',
        'fuel_sale',
        'fuel_own_consumption',
        'inventory_consumption',
      ].includes(kind)
        ? UNASSIGNED
        : COMMON),
    status: raw.status || 'confirmed',
    dueDate: date(raw.dueDate, true),
    expectedDate: date(raw.expectedDate || raw.plannedDate, true),
    description: String(raw.description || '').slice(0, 2000),
    article: String(raw.article || kind).slice(0, 200),
    articleId: raw.articleId || null,
    postings: [],
    allocations: [],
    cashFlows: [],
  };
  if (!['confirmed', 'provisional'].includes(op.status)) fail('INVALID_STATUS');
  if (
    raw.cashFlowCategory &&
    !['operating', 'investing', 'financing'].includes(raw.cashFlowCategory)
  )
    fail('INVALID_CASH_FLOW_CATEGORY');
  if (raw.currency && raw.currency !== 'RUB') fail('CURRENCY_UNSUPPORTED');
  op.currency = 'RUB';
  op.consolidationOnly = kind === 'consolidation_adjustment';
  ensureOpen(op, context);
  const existing = operations(context);
  if (existing.some((o) => o.id === op.id)) fail('DUPLICATE_OPERATION');
  if (raw.source) {
    op.source = {
      system: required(raw.source.system, 'SOURCE_REQUIRED'),
      id: required(String(raw.source.id || ''), 'SOURCE_REQUIRED'),
      version: String(raw.source.version || '1'),
    };
    if (
      existing.some(
        (o) =>
          o.legalEntityId === op.legalEntityId &&
          o.source?.system === op.source.system &&
          o.source.id === op.source.id &&
          o.source.version === op.source.version,
      )
    )
      fail('DUPLICATE_SOURCE');
  }
  const add = (account, amount, extra = {}) => {
    if (!ACCOUNTS[account]) fail('INVALID_ACCOUNT');
    const n = integer(amount);
    if (!n && op.kind !== 'opening') return;
    op.postings.push({
      legalEntityId: op.legalEntityId,
      regionId: op.regionId,
      projectId: op.projectId,
      responsibilityScopeId: op.responsibilityScopeId,
      directionId: op.directionId,
      counterpartyId: op.counterpartyId || null,
      article: op.article,
      articleId: op.articleId,
      ...(op.intercompany ? { intercompany: op.intercompany } : {}),
      ...extra,
      ...(extra.article &&
      extra.article !== op.article &&
      extra.articleId === undefined
        ? { articleId: null }
        : {}),
      account,
      amountKopecks: n,
    });
  };
  const party = () => required(op.counterpartyId, 'COUNTERPARTY_REQUIRED');
  const cash = (amount, flowDirection, category = 'operating', extra = {}) => {
    const cashAccountId =
      extra.cashAccountId || raw.cashAccountId || raw.accountId;
    required(cashAccountId, 'CASH_ACCOUNT_REQUIRED');
    const account = getCatalog(context, cashAccountId, 'accounts');
    if (
      account &&
      (account.archived ||
        (account.legalEntityId && account.legalEntityId !== op.legalEntityId))
    )
      fail('INVALID_CASH_ACCOUNT');
    const cashDirection = account?.directionId || raw.cashDirectionId || COMMON;
    const { flowScope, flowIntercompany, ...physical } = extra;
    add('cash', amount, {
      cashAccountId,
      directionId: cashDirection,
      ...physical,
    });
    op.cashFlows.push({
      responsibilityScopeId:
        flowScope?.responsibilityScopeId || op.responsibilityScopeId,
      regionId: flowScope?.regionId || op.regionId,
      projectId: flowScope?.projectId || op.projectId,
      amountKopecks: amount,
      flow: amount >= 0 ? 'in' : 'out',
      directionId: flowDirection,
      cashDirectionId: cashDirection,
      cashAccountId,
      category,
      article: op.article,
      articleId: op.articleId,
      ...(flowIntercompany || op.intercompany
        ? { intercompany: flowIntercompany || op.intercompany }
        : {}),
    });
  };
  const doc = (account, amount, extra = {}) =>
    add(account, amount, {
      documentId: op.id,
      dueDate: op.dueDate,
      expectedDate: op.expectedDate,
      ...extra,
    });
  const amount = [
    'opening',
    'adjustment',
    'consolidation_adjustment',
    'reversal',
    'settlement',
  ].includes(kind)
    ? money(raw, 'amount', true)
    : money(raw);
  const vat = money(raw, 'vat', true);
  if (vat > amount) fail('VAT_EXCEEDS_AMOUNT');
  op.amountKopecks = amount;
  op.vatKopecks = vat;
  const consumeAdvance = (gross, cp) => {
    const positions = new Map();
    for (const past of existing.filter(
      (o) =>
        !o.consolidationOnly &&
        o.legalEntityId === op.legalEntityId &&
        o.date <= op.date &&
        (context.allowCrossScopeSettlements ||
          !op.responsibilityScopeId ||
          o.responsibilityScopeId === op.responsibilityScopeId),
    )) {
      for (const p of past.postings)
        if (p.account === 'supplier_advance' && p.counterpartyId === cp) {
          const key = `${p.responsibilityScopeId || past.responsibilityScopeId}:${p.directionId}:${p.paymentId || 'opening'}`;
          const old = positions.get(key) || {
            directionId: p.directionId,
            paymentId: p.paymentId || null,
            balance: 0,
            source: past,
            postingScope: {
              responsibilityScopeId:
                p.responsibilityScopeId || past.responsibilityScopeId,
              regionId: p.regionId || past.regionId,
              projectId: p.projectId || past.projectId,
            },
          };
          old.balance = sum([old.balance, p.amountKopecks]);
          positions.set(key, old);
        }
    }
    let remaining = gross;
    for (const {
      directionId,
      paymentId,
      balance,
      source,
      postingScope,
    } of positions.values()) {
      const used = Math.min(remaining, Math.max(0, balance));
      if (used) {
        sameOwner(op, source, context);
        add('supplier_advance', -used, {
          ...postingScope,
          directionId,
          paymentId,
          counterpartyId: cp,
          intercompany: null,
        });
      }
      remaining -= used;
      if (!remaining) break;
    }
    if (remaining) fail('INSUFFICIENT_ADVANCE');
  };
  const costs = (
    gross,
    tax,
    target,
    creditAccount = 'ap',
    cp = op.counterpartyId,
    documentId = op.id,
  ) => {
    const recoverable = raw.vatRecoverable !== false;
    const net = gross - (recoverable ? tax : 0);
    add(target, net, {
      recognitionDocumentId: documentId,
      counterpartyId: cp,
      intercompany:
        target === 'expense' && kind === 'fuel_sale'
          ? null
          : op.intercompany || null,
    });
    if (recoverable && tax)
      add('input_vat', tax, {
        counterpartyId: cp,
        vatConfirmed: raw.vatConfirmed === true,
        intercompany: null,
      });
    if (creditAccount === 'supplier_advance') {
      // Preserve the purchase document even when it is immediately covered by
      // prepayment, so its confirmation and original amount remain auditable.
      add('ap', -gross, {
        counterpartyId: cp,
        documentId,
        dueDate: op.dueDate,
        expectedDate: op.expectedDate,
        intercompany: null,
      });
      consumeAdvance(gross, cp);
      add('ap', gross, {
        counterpartyId: cp,
        documentId,
        isSettlement: true,
        intercompany: null,
      });
    } else
      add(creditAccount, -gross, {
        counterpartyId: cp,
        documentId: creditAccount === 'ap' ? documentId : null,
        dueDate: op.dueDate,
        expectedDate: op.expectedDate,
        intercompany: kind === 'fuel_sale' ? null : op.intercompany || null,
      });
  };
  let targetDocs;
  const getDoc = (id) => {
    if (!targetDocs)
      targetDocs = documentRows(existing.filter((o) => !o.consolidationOnly));
    const d = targetDocs.find(
      (d) => d.documentId === id && d.legalEntityId === op.legalEntityId,
    );
    if (!d) fail('DOCUMENT_NOT_FOUND');
    if (d.date > op.date) fail('SETTLEMENT_BEFORE_DOCUMENT');
    sameOwner(op, d, context);
    return d;
  };
  const allocations = (rows, flow, max) => {
    if (!Array.isArray(rows) || rows.length > 500) fail('INVALID_SETTLEMENT');
    const seen = new Set();
    let used = 0;
    for (const row of rows) {
      const d = getDoc(row.documentId);
      if (seen.has(d.id)) fail('DUPLICATE_SETTLEMENT');
      seen.add(d.id);
      const n = money(row);
      if (d.side !== (flow === 'in' ? 'receivable' : 'payable'))
        fail('SETTLEMENT_SIDE_MISMATCH');
      if (op.counterpartyId && d.counterpartyId !== op.counterpartyId)
        fail('SETTLEMENT_PARTY_MISMATCH');
      if (n > d.remainingKopecks) fail('OVER_SETTLEMENT');
      used = sum([used, n]);
      if (used > max) fail('OVER_SETTLEMENT');
      const shares = Object.entries(d.directionAmounts).filter(
        ([, value]) => value > 0,
      );
      let left = n;
      let balance = d.remainingKopecks;
      const portions = shares.map(([directionId, value], index) => {
        const part =
          index === shares.length - 1
            ? left
            : safe((BigInt(n) * BigInt(value)) / BigInt(balance));
        left -= part;
        return { directionId, amountKopecks: part };
      });
      for (const portion of portions)
        add(
          flow === 'in' ? 'ar' : 'ap',
          portion.amountKopecks * (flow === 'in' ? -1 : 1),
          {
            responsibilityScopeId: d.responsibilityScopeId,
            regionId: d.regionId,
            projectId: d.projectId,
            documentId: d.id,
            originOperationId: d.operationId,
            directionId: portion.directionId,
            counterpartyId: d.counterpartyId,
            intercompany: d.intercompany,
          },
        );
      op.allocations.push({
        documentId: d.id,
        amountKopecks: n,
        side: d.side,
        directionId: d.directionId,
        responsibilityScopeId: d.responsibilityScopeId,
        projectId: d.projectId,
        regionId: d.regionId,
        counterpartyId: d.counterpartyId,
        cashFlowCategory: d.cashFlowCategory || 'operating',
        intercompany: d.intercompany || null,
        portions,
      });
    }
    return used;
  };
  if (kind === 'sale' || kind === 'fuel_sale') {
    party();
    doc('ar', amount);
    add('revenue', -(amount - vat), { recognitionDocumentId: op.id });
    add('output_vat', -vat, { intercompany: null });
    if (kind === 'fuel_sale') {
      const cost = money(raw, 'cost');
      const costVat = money(raw, 'costVat', true);
      if (costVat > cost) fail('VAT_EXCEEDS_AMOUNT');
      op.costKopecks = cost;
      op.costVatKopecks = costVat;
      const purchaseMode = raw.purchaseMode || 'payable';
      if (purchaseMode === 'inventory') {
        if (
          cost > accountBalance(context, op, 'inventory', null, op.directionId)
        )
          fail('INSUFFICIENT_INVENTORY');
        add('expense', cost, { intercompany: null });
        add('inventory', -cost, { intercompany: null });
      } else {
        const supplier = required(
          raw.supplierCounterpartyId,
          'SUPPLIER_REQUIRED',
        );
        if (!['advance', 'payable'].includes(purchaseMode))
          fail('INVALID_PURCHASE_MODE');
        if (
          purchaseMode === 'advance' &&
          cost > accountBalance(context, op, 'supplier_advance', supplier)
        )
          fail('INSUFFICIENT_ADVANCE');
        costs(
          cost,
          costVat,
          'expense',
          purchaseMode === 'advance' ? 'supplier_advance' : 'ap',
          supplier,
          `${op.id}:cost`,
        );
      }
    }
  } else if (
    ['expense', 'asset_purchase', 'inventory_purchase', 'interest'].includes(
      kind,
    )
  ) {
    party();
    costs(
      amount,
      vat,
      kind === 'asset_purchase'
        ? 'fixed_asset'
        : kind === 'inventory_purchase'
          ? 'inventory'
          : 'expense',
    );
  } else if (
    [
      'payment_in',
      'payment_out',
      'customer_advance',
      'supplier_advance',
      'cash_in',
      'cash_out',
      'capital_in',
      'owner_distribution',
      'loan_received',
      'loan_repayment',
      'loan_issued',
      'loan_returned',
    ].includes(kind)
  ) {
    const incoming = [
      'payment_in',
      'customer_advance',
      'cash_in',
      'capital_in',
      'loan_received',
      'loan_returned',
    ].includes(kind);
    const flow = incoming ? 'in' : 'out';
    const sign = incoming ? 1 : -1;
    const category = [
      'capital_in',
      'owner_distribution',
      'loan_received',
      'loan_repayment',
    ].includes(kind)
      ? 'financing'
      : ['loan_issued', 'loan_returned'].includes(kind)
        ? 'investing'
        : raw.cashFlowCategory || 'operating';
    if (
      [
        'payment_in',
        'payment_out',
        'customer_advance',
        'supplier_advance',
      ].includes(kind)
    )
      party();
    if (['payment_in', 'payment_out'].includes(kind)) {
      const used = allocations(raw.allocations || [], flow, amount);
      const remainder = amount - used;
      if (remainder)
        add(
          incoming ? 'customer_advance' : 'supplier_advance',
          -sign * remainder,
          { paymentId: op.id },
        );
      for (const a of op.allocations)
        for (const portion of a.portions)
          cash(
            sign * portion.amountKopecks,
            portion.directionId,
            a.cashFlowCategory,
            { flowScope: a, flowIntercompany: a.intercompany },
          );
      if (remainder) cash(sign * remainder, op.directionId, category);
    } else {
      const account = {
        customer_advance: 'customer_advance',
        supplier_advance: 'supplier_advance',
        cash_in: 'suspense',
        cash_out: 'suspense',
        capital_in: 'equity',
        owner_distribution: 'retained_earnings',
        loan_received: 'loan_payable',
        loan_repayment: 'loan_payable',
        loan_issued: 'loan_receivable',
        loan_returned: 'loan_receivable',
      }[kind];
      if (
        kind === 'loan_repayment' &&
        amount > -accountBalance(context, op, account, op.counterpartyId)
      )
        fail('LOAN_OVER_REPAYMENT');
      if (
        kind === 'loan_returned' &&
        amount > accountBalance(context, op, account, op.counterpartyId)
      )
        fail('LOAN_OVER_REPAYMENT');
      add(account, -sign * amount, {
        paymentId: ['customer_advance', 'supplier_advance'].includes(kind)
          ? op.id
          : null,
      });
      cash(sign * amount, op.directionId, category);
    }
  } else if (kind === 'settlement') {
    const payment = existing.find((o) => o.id === raw.paymentId);
    if (
      !payment ||
      ![
        'payment_in',
        'payment_out',
        'customer_advance',
        'supplier_advance',
      ].includes(payment.kind) ||
      isReversed(payment.id, existing)
    )
      fail('PAYMENT_NOT_FOUND');
    sameOwner(op, payment, context);
    if (payment.date > op.date) fail('SETTLEMENT_BEFORE_PAYMENT');
    op.counterpartyId = payment.counterpartyId;
    const incoming = ['payment_in', 'customer_advance'].includes(payment.kind);
    const credit = incoming ? 'customer_advance' : 'supplier_advance';
    const available =
      sum(
        existing
          .filter((o) => o.legalEntityId === op.legalEntityId)
          .flatMap((o) => o.postings)
          .filter((p) => p.account === credit && p.paymentId === payment.id)
          .map((p) => p.amountKopecks),
      ) * (incoming ? -1 : 1);
    const used = allocations(
      raw.allocations || [],
      incoming ? 'in' : 'out',
      available,
    );
    if (!used) fail('EMPTY_SETTLEMENT');
    op.amountKopecks = used;
    add(credit, incoming ? used : -used, {
      responsibilityScopeId: payment.responsibilityScopeId,
      regionId: payment.regionId,
      projectId: payment.projectId,
      directionId: payment.directionId,
      counterpartyId: payment.counterpartyId,
      paymentId: payment.id,
    });
  } else if (kind === 'setoff') {
    required(raw.reason || raw.description, 'SETOFF_BASIS_REQUIRED');
    const ar = getDoc(raw.receivableId);
    const ap = getDoc(raw.payableId);
    if (
      ar.side !== 'receivable' ||
      ap.side !== 'payable' ||
      ar.counterpartyId !== ap.counterpartyId
    )
      fail('INVALID_SETOFF');
    if (amount > ar.remainingKopecks || amount > ap.remainingKopecks)
      fail('OVER_SETTLEMENT');
    op.counterpartyId = ar.counterpartyId;
    allocations([{ documentId: ar.id, amountKopecks: amount }], 'in', amount);
    allocations([{ documentId: ap.id, amountKopecks: amount }], 'out', amount);
  } else if (
    ['depreciation', 'inventory_consumption', 'fuel_own_consumption'].includes(
      kind,
    )
  ) {
    if (kind === 'depreciation') {
      const available = sum([
        accountBalance(context, op, 'fixed_asset', null, op.directionId),
        accountBalance(
          context,
          op,
          'accumulated_depreciation',
          null,
          op.directionId,
        ),
      ]);
      if (amount > available) fail('EXCESS_DEPRECIATION');
      add('expense', amount);
      add('accumulated_depreciation', -amount);
    } else if (
      kind === 'inventory_consumption' ||
      raw.purchaseMode === 'inventory'
    ) {
      if (
        amount > accountBalance(context, op, 'inventory', null, op.directionId)
      )
        fail('INSUFFICIENT_INVENTORY');
      add('expense', amount);
      add('inventory', -amount);
    } else {
      const supplier = required(
        raw.supplierCounterpartyId || op.counterpartyId,
        'SUPPLIER_REQUIRED',
      );
      const credit = raw.purchaseMode === 'advance' ? 'supplier_advance' : 'ap';
      if (
        credit === 'supplier_advance' &&
        amount > accountBalance(context, op, credit, supplier)
      )
        fail('INSUFFICIENT_ADVANCE');
      costs(amount, vat, 'expense', credit, supplier);
    }
  } else if (kind === 'transfer') {
    const toAccountId = required(raw.toCashAccountId, 'CASH_ACCOUNT_REQUIRED');
    if (toAccountId === (raw.cashAccountId || raw.accountId))
      fail('SAME_CASH_ACCOUNT');
    cash(-amount, op.directionId, 'internal');
    cash(amount, op.directionId, 'internal', {
      cashAccountId: toAccountId,
    });
  } else if (
    ['opening', 'adjustment', 'consolidation_adjustment'].includes(kind)
  ) {
    if (kind !== 'opening') required(raw.reason, 'CORRECTION_REASON_REQUIRED');
    if (kind === 'consolidation_adjustment') {
      if (
        !Array.isArray(raw.consolidationEntityIds) ||
        new Set(raw.consolidationEntityIds).size < 2 ||
        raw.consolidationEntityIds.some((id) => typeof id !== 'string' || !id)
      )
        fail('CONSOLIDATION_ENTITIES_REQUIRED');
      op.consolidationEntityIds = [...new Set(raw.consolidationEntityIds)];
      if (!op.consolidationEntityIds.includes(op.legalEntityId))
        fail('CONSOLIDATION_ENTITIES_REQUIRED');
      op.replacesAutomaticEliminationKeys = Array.isArray(
        raw.replacesAutomaticEliminationKeys,
      )
        ? [...new Set(raw.replacesAutomaticEliminationKeys.map(String))]
        : [];
    }
    if (
      !Array.isArray(raw.postings) ||
      raw.postings.length < 2 ||
      raw.postings.length > 2000
    )
      fail('INVALID_POSTINGS');
    for (const p of raw.postings) {
      let documentScope;
      if (kind === 'opening' && ['revenue', 'expense'].includes(p.account))
        fail('OPENING_PNL_FORBIDDEN');
      if (
        ['ar', 'ap'].includes(p.account) &&
        (!p.documentId || !p.counterpartyId)
      )
        fail('OPENING_DOCUMENT_REQUIRED');
      if (p.account === 'cash' && !p.cashAccountId)
        fail('CASH_ACCOUNT_REQUIRED');
      if (kind !== 'opening' && p.account === 'cash')
        fail('CASH_ADJUSTMENT_FORBIDDEN');
      if (
        kind === 'consolidation_adjustment' &&
        !op.consolidationEntityIds.includes(p.legalEntityId || op.legalEntityId)
      )
        fail('CONSOLIDATION_ENTITIES_REQUIRED');
      if (
        kind !== 'consolidation_adjustment' &&
        p.legalEntityId &&
        p.legalEntityId !== op.legalEntityId
      )
        fail('CROSS_ENTITY_POSTING');
      if (kind === 'adjustment' && ['ar', 'ap'].includes(p.account)) {
        const target = getDoc(p.documentId);
        if (target.counterpartyId !== p.counterpartyId)
          fail('SETTLEMENT_PARTY_MISMATCH');
        if (target.side !== (p.account === 'ar' ? 'receivable' : 'payable'))
          fail('SETTLEMENT_SIDE_MISMATCH');
        // Corrections retain the document's owner and change its accrual,
        // never masquerade as payments or move debt to another project.
        documentScope = { ...scopeOf(target), isSettlement: false };
      }
      add(p.account, p.amountKopecks, {
        ...p,
        ...documentScope,
        directionId: p.directionId || op.directionId,
      });
    }
  } else if (kind === 'reversal') {
    required(raw.reason, 'CORRECTION_REASON_REQUIRED');
    const original = existing.find(
      (o) => o.id === (raw.originalOperationId || raw.reversesId),
    );
    if (
      !original ||
      original.projected ||
      original.kind === 'reversal' ||
      isReversed(original.id, existing)
    )
      fail('ORIGINAL_NOT_REVERSIBLE');
    sameOwner(op, original, context);
    if (op.date < original.date) fail('REVERSAL_BEFORE_ORIGINAL');
    const originalDocs = new Set(
      original.postings
        .filter(
          (p) =>
            ['ar', 'ap'].includes(p.account) &&
            (original.kind === 'opening' ||
              p.documentId === original.id ||
              p.documentId === `${original.id}:cost`),
        )
        .map((p) => p.documentId),
    );
    if (
      existing.some(
        (o) =>
          o.id !== original.id &&
          o.kind !== 'reversal' &&
          !isReversed(o.id, existing) &&
          (o.paymentId === original.id ||
            o.postings?.some((p) => p.paymentId === original.id) ||
            o.allocations?.some((a) => originalDocs.has(a.documentId))),
      )
    )
      fail('DEPENDENT_OPERATIONS');
    for (const account of [
      'inventory',
      'fixed_asset',
      'loan_receivable',
      'loan_payable',
    ]) {
      const originalAmount = sum(
        original.postings
          .filter((p) => p.account === account)
          .map((p) => p.amountKopecks),
      );
      if (!originalAmount) continue;
      const after = sum([
        accountBalance(
          context,
          { ...op, responsibilityScopeId: original.responsibilityScopeId },
          account,
          account.startsWith('loan') ? original.counterpartyId : null,
          original.directionId,
        ),
        -originalAmount,
        account === 'fixed_asset'
          ? accountBalance(
              context,
              { ...original, date: op.date },
              'accumulated_depreciation',
              null,
              original.directionId,
            )
          : 0,
      ]);
      if ((account === 'loan_payable' ? -after : after) < 0)
        fail('DEPENDENT_OPERATIONS');
    }
    op.reversesId = original.id;
    op.originalOperationId = original.id;
    op.amountKopecks = original.amountKopecks;
    op.vatKopecks = original.vatKopecks;
    op.directionId = original.directionId;
    op.consolidationOnly = original.consolidationOnly === true;
    if (op.consolidationOnly) {
      op.consolidationEntityIds = [...original.consolidationEntityIds];
      op.replacesAutomaticEliminationKeys = [
        ...(original.replacesAutomaticEliminationKeys || []),
      ];
    }
    op.postings = original.postings.map((p) => ({
      ...p,
      amountKopecks: -p.amountKopecks,
    }));
    op.cashFlows = (original.cashFlows || []).map((p) => ({
      ...p,
      amountKopecks: -p.amountKopecks,
    }));
    op.articleId = original.articleId || null;
    op.article = original.article;
    if (original.articleWarning)
      op.articleWarning = { ...original.articleWarning };
  }
  // Allocation changes the management direction, never the legal owner or cash.
  if (
    raw.allocationRuleId &&
    !['reversal', 'opening', 'adjustment', 'consolidation_adjustment'].includes(
      kind,
    )
  ) {
    if (
      ![
        'expense',
        'interest',
        'depreciation',
        'fuel_own_consumption',
        'inventory_consumption',
      ].includes(kind)
    )
      fail('ALLOCATION_KIND_UNSUPPORTED');
    const rule = getCatalog(context, raw.allocationRuleId, 'allocation_rules');
    if (
      !rule ||
      rule.archived ||
      rule.effectiveFrom > op.date ||
      (rule.effectiveTo && rule.effectiveTo <= op.date)
    )
      fail('ALLOCATION_RULE_UNAVAILABLE');
    op.allocationRule = {
      id: rule.id,
      version: rule.version || 1,
      effectiveFrom: rule.effectiveFrom,
      weights: weights(rule.weights),
    };
    op.postings = op.postings.flatMap((p) =>
      ['expense', 'ap', 'input_vat'].includes(p.account)
        ? allocateAmount(p.amountKopecks, op.allocationRule.weights)
            .filter((s) => s.amountKopecks)
            .map((s) => ({ ...p, ...s, allocationRuleId: rule.id }))
        : [p],
    );
  }
  if (kind !== 'reversal') {
    const pnlPostings = op.postings.filter((p) =>
      ['revenue', 'expense'].includes(p.account),
    );
    const economic = pnlPostings.length
      ? pnlPostings
      : op.cashFlows.length
        ? op.cashFlows
        : op.postings.filter((p) => !['cash', 'treasury'].includes(p.account));
    const usesPrimary = (p) =>
      (p.articleId || null) === (raw.articleId || null) &&
      p.article === op.article;
    const primaryTargets = economic.filter(usesPrimary);
    const preserveSnapshot =
      raw.articleId &&
      context.preserveArticleSnapshot &&
      context.preserveArticleSnapshot.articleId === raw.articleId;
    const resolved = resolveArticle(
      {
        ...op,
        article: raw.article,
        responsibilityScopeIds: [
          ...new Set(
            primaryTargets.map((p) => p.responsibilityScopeId).filter(Boolean),
          ),
        ],
      },
      context,
      {
        directionIds: op.allocationRule?.weights?.map(
          (weight) => weight.directionId,
        ) || [...new Set(primaryTargets.map((p) => p.directionId))],
        allowArchived: !!preserveSnapshot,
      },
    );
    if (preserveSnapshot)
      resolved.article = context.preserveArticleSnapshot.article;
    delete op.articleWarning;
    for (const p of [...op.postings, ...op.cashFlows]) {
      const value = usesPrimary(p)
        ? resolved
        : resolveArticle(p, context, {
            directionIds: economic.includes(p) ? [p.directionId] : [],
          });
      p.articleId = value.articleId;
      p.article = value.article || p.article;
      if (value.articleWarning) p.articleWarning = value.articleWarning;
      else delete p.articleWarning;
    }
    op.articleId = resolved.articleId;
    op.article = resolved.article || op.article;
    if (resolved.articleWarning) op.articleWarning = resolved.articleWarning;
  }
  if (sum(op.postings.map((p) => p.amountKopecks)) !== 0)
    fail('UNBALANCED_OPERATION');
  if (kind !== 'reversal') {
    const byDirection = new Map();
    for (const p of op.postings) {
      const key = `${p.responsibilityScopeId || ''}:${p.directionId}`;
      const old = byDirection.get(key) || {
        legalEntityId: p.legalEntityId,
        directionId: p.directionId,
        responsibilityScopeId: p.responsibilityScopeId,
        regionId: p.regionId,
        projectId: p.projectId,
        balance: 0,
      };
      old.balance = sum([old.balance, p.amountKopecks]);
      byDirection.set(key, old);
    }
    for (const {
      directionId,
      balance,
      ...postingScope
    } of byDirection.values())
      if (
        (directionId !== COMMON ||
          postingScope.responsibilityScopeId !== op.responsibilityScopeId) &&
        balance
      ) {
        add('treasury', -balance, {
          ...postingScope,
          directionId,
          counterpartyId: null,
          intercompany: null,
        });
        add('treasury', balance, {
          directionId: COMMON,
          counterpartyId: null,
          intercompany: null,
        });
      }
  }
  if (
    op.postings.length < 2 ||
    sum(op.postings.map((p) => p.amountKopecks)) !== 0
  )
    fail('UNBALANCED_OPERATION');
  op.relatedScopeIds = [
    ...new Set(
      [...op.postings, ...op.cashFlows]
        .map((p) => p.responsibilityScopeId)
        .filter(Boolean),
    ),
  ];
  op.accessScopeIds = [...op.relatedScopeIds];
  return op;
}
function validateSettlement(input, context) {
  return buildOperation({ ...input, kind: 'settlement' }, context);
}

function selectedOperations(state, filters) {
  const ids =
    filters.legalEntityIds ||
    (filters.legalEntityId ? [filters.legalEntityId] : null);
  const availableIds = ids || [
    ...new Set([
      ...operations(state).flatMap((o) => [
        o.legalEntityId,
        ...(o.consolidationEntityIds || []),
      ]),
      ...catalogs(state).map((c) => c.legalEntityId),
    ]),
  ];
  return operations(state)
    .filter(
      (o) =>
        (!ids || ids.includes(o.legalEntityId)) &&
        (!o.consolidationOnly ||
          (!o.projected &&
            availableIds.length > 1 &&
            o.consolidationEntityIds?.every((id) =>
              availableIds.includes(id),
            ) &&
            (!filters.responsibilityScopeIds ||
              o.relatedScopeIds.every((id) =>
                filters.responsibilityScopeIds.includes(id),
              )))) &&
        (!filters.responsibilityScopeIds ||
          (o.relatedScopeIds || [o.responsibilityScopeId]).some((id) =>
            filters.responsibilityScopeIds.includes(id),
          )),
    )
    .map((o) => {
      if (!filters.responsibilityScopeIds) return o;
      const postings = (o.postings || []).filter((p) =>
        filters.responsibilityScopeIds.includes(
          p.responsibilityScopeId || o.responsibilityScopeId,
        ),
      );
      const cashFlows = (o.cashFlows || []).filter((p) =>
        filters.responsibilityScopeIds.includes(
          p.responsibilityScopeId || o.responsibilityScopeId,
        ),
      );
      const projected =
        o.projected ||
        postings.length !== (o.postings || []).length ||
        cashFlows.length !== (o.cashFlows || []).length;
      return projected
        ? {
            ...o,
            projected: true,
            amountKopecks: null,
            postings,
            cashFlows,
          }
        : o;
    });
}
function internalKey(legalEntityId, intercompany) {
  return JSON.stringify([
    intercompany.key,
    ...[legalEntityId, intercompany.counterpartyLegalEntityId].sort(),
  ]);
}
function buildReports(state = {}, filters = {}) {
  const from = date(filters.from || '1900-01-01');
  const to = date(filters.to || new Date().toISOString().slice(0, 10));
  if (from > to) fail('INVALID_PERIOD');
  const all = selectedOperations(state, filters);
  const ops = all.filter((o) => o.date <= to);
  const period = ops.filter((o) => o.date >= from && o.kind !== 'opening');
  const reversedIds = new Set(
    ops.map((o) => o.reversesId || o.originalOperationId).filter(Boolean),
  );
  const direction = filters.directionId || null;
  const select = (p) => !direction || p.directionId === direction;
  const controls = [];
  const balances = new Map();
  const pnlMap = new Map();
  const cfMap = new Map();
  const articleNames = new Map(
    catalogs(state)
      .filter((row) => row.kind === 'articles')
      .map((row) => [row.id, row.name]),
  );
  const warnings = (code, message, amountKopecks = 0, severity = 'warning') =>
    controls.push({ code, severity, message, amountKopecks });
  for (const o of ops) {
    if (sum((o.postings || []).map((p) => p.amountKopecks)) !== 0)
      warnings(
        'UNBALANCED_OPERATION',
        `Несбалансированная операция ${o.id}`,
        0,
        'error',
      );
    for (const p of o.postings || [])
      if (select(p))
        balances.set(
          p.account,
          sum([balances.get(p.account) || 0, p.amountKopecks]),
        );
  }
  for (const o of period)
    for (const p of o.postings || [])
      if (select(p) && ['revenue', 'expense'].includes(p.account)) {
        const articleId = p.articleId || null;
        const name = p.article || o.article;
        const key = `${p.account}:${articleId ? 'id:' + articleId : 'text:' + name}:${p.allocationRuleId || 'direct'}`;
        const r = pnlMap.get(key) || {
          account: p.account,
          articleId,
          article: articleNames.get(articleId) || name,
          articleNames: [],
          allocated: !!p.allocationRuleId,
          amountKopecks: 0,
        };
        if (!r.articleNames.includes(name)) r.articleNames.push(name);
        r.amountKopecks = sum([
          r.amountKopecks,
          p.account === 'revenue' ? -p.amountKopecks : p.amountKopecks,
        ]);
        pnlMap.set(key, r);
      }
  // Eliminate only completely paired internal positions. Unknown/mismatched
  // counterparties remain visible and prevent a 'closed' consolidated report.
  const entityIds = new Set(
    filters.legalEntityIds ||
      (filters.legalEntityId
        ? [filters.legalEntityId]
        : [
            ...ops.map((o) => o.legalEntityId),
            ...catalogs(state)
              .map((c) => c.legalEntityId)
              .filter(Boolean),
          ]),
  );
  if (
    entityIds.size > 1 &&
    (all.some((o) => o.projected) ||
      operations(state).some((o) => o.consolidationOnly && o.projected) ||
      (state.fullEntityIds &&
        [...entityIds].some((id) => !state.fullEntityIds.includes(id))))
  )
    controls.push({
      code: 'CONSOLIDATION_SCOPE_INCOMPLETE',
      severity: 'warning',
      blocking: true,
      message:
        'Свод ограничен доступными данными; полнота внутригрупповых исключений не подтверждена',
    });
  const eliminationRows = [];
  if (entityIds.size > 1) {
    const groups = new Map();
    for (const o of ops)
      for (const p of o.postings || [])
        if (
          p.intercompany?.key &&
          entityIds.has(p.intercompany.counterpartyLegalEntityId)
        ) {
          const key = internalKey(o.legalEntityId, p.intercompany);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({
            ...p,
            legalEntityId: o.legalEntityId,
            date: o.date,
            operationId: o.id,
          });
        }
    for (const [key, rows] of groups) {
      if (
        ops.some(
          (o) =>
            o.kind === 'consolidation_adjustment' &&
            !reversedIds.has(o.id) &&
            (o.replacesAutomaticEliminationKeys || []).includes(
              rows[0]?.intercompany?.key,
            ) &&
            rows.every((p) =>
              o.consolidationEntityIds.includes(p.legalEntityId),
            ),
        )
      )
        continue;
      if (new Set(rows.map((r) => r.legalEntityId)).size < 2) {
        warnings(
          'INTERCOMPANY_UNMATCHED',
          `Не сопоставлены внутренние операции: ${key}`,
        );
        continue;
      }
      for (const [left, right] of [
        ['ar', 'ap'],
        ['supplier_advance', 'customer_advance'],
        ['loan_receivable', 'loan_payable'],
        ['revenue', 'expense'],
      ]) {
        const ls = rows.filter((r) => r.account === left);
        const rs = rows.filter((r) => r.account === right);
        const l = sum(ls.map((r) => r.amountKopecks));
        const r = sum(rs.map((r) => r.amountKopecks));
        if (!l && !r) continue;
        if (l + r !== 0) {
          warnings(
            'INTERCOMPANY_MISMATCH',
            `Расхождение внутренних оборотов ${key}: ${left}/${right}`,
            Math.abs(sum([l, r])),
          );
          continue;
        }
        for (const row of [...ls, ...rs]) {
          eliminationRows.push({
            ...row,
            amountKopecks: -row.amountKopecks,
            key,
          });
          if (!select(row)) continue;
          balances.set(
            row.account,
            sum([balances.get(row.account) || 0, -row.amountKopecks]),
          );
          if (
            row.date >= from &&
            ['revenue', 'expense'].includes(row.account)
          ) {
            const pk = `${row.account}:Внутригрупповые исключения`;
            const old = pnlMap.get(pk) || {
              account: row.account,
              article: 'Внутригрупповые исключения',
              amountKopecks: 0,
            };
            old.amountKopecks = sum([
              old.amountKopecks,
              row.account === 'revenue'
                ? row.amountKopecks
                : -row.amountKopecks,
            ]);
            pnlMap.set(pk, old);
          }
        }
      }
      if (
        rows.some(
          (r) => r.account === 'inventory' || r.account === 'fixed_asset',
        )
      )
        warnings(
          'INTERCOMPANY_ASSET_PROFIT_REVIEW',
          `Требуется подтвержденное исключение внутренней наценки в активах: ${key}`,
        );
    }
    const eliminationDirections = new Map();
    for (const p of eliminationRows)
      eliminationDirections.set(
        p.directionId,
        sum([eliminationDirections.get(p.directionId) || 0, p.amountKopecks]),
      );
    for (const [directionId, delta] of eliminationDirections)
      if (directionId !== COMMON && delta) {
        if (!direction || direction === directionId)
          balances.set(
            'treasury',
            sum([balances.get('treasury') || 0, -delta]),
          );
        if (!direction || direction === COMMON)
          balances.set('treasury', sum([balances.get('treasury') || 0, delta]));
      }
  }
  let inflow = 0,
    outflow = 0;
  const internalCash = new Map();
  for (const o of period)
    for (const f of o.cashFlows || [])
      if (
        entityIds.size > 1 &&
        f.intercompany?.key &&
        entityIds.has(f.intercompany.counterpartyLegalEntityId)
      ) {
        const key = internalKey(o.legalEntityId, f.intercompany);
        const old = internalCash.get(key) || {
          amountKopecks: 0,
          entities: new Set(),
        };
        old.amountKopecks = sum([old.amountKopecks, f.amountKopecks]);
        old.entities.add(o.legalEntityId);
        internalCash.set(key, old);
      }
  for (const [key, group] of internalCash)
    if (group.amountKopecks || group.entities.size < 2)
      warnings(
        'INTERCOMPANY_CASH_UNMATCHED',
        `Не сопоставлен внутренний перевод ${key}`,
        Math.abs(group.amountKopecks),
      );
  for (const o of period)
    for (const f of o.cashFlows || []) {
      if (!select(f) || f.category === 'internal') continue;
      if (
        entityIds.size > 1 &&
        f.intercompany &&
        entityIds.has(f.intercompany.counterpartyLegalEntityId)
      ) {
        const group = internalCash.get(
          internalKey(o.legalEntityId, f.intercompany),
        );
        if (group && group.amountKopecks === 0 && group.entities.size > 1)
          continue;
      }
      const key = `${f.category}:${f.articleId ? 'id:' + f.articleId : 'text:' + f.article}`;
      const row = cfMap.get(key) || {
        category: f.category,
        articleId: f.articleId || null,
        article: articleNames.get(f.articleId) || f.article,
        articleNames: [],
        inflowKopecks: 0,
        outflowKopecks: 0,
        netKopecks: 0,
      };
      if (!row.articleNames.includes(f.article))
        row.articleNames.push(f.article);
      if (f.flow === 'in' || (!f.flow && f.amountKopecks >= 0)) {
        inflow = sum([inflow, f.amountKopecks]);
        row.inflowKopecks = sum([row.inflowKopecks, f.amountKopecks]);
      } else {
        outflow = sum([outflow, -f.amountKopecks]);
        row.outflowKopecks = sum([row.outflowKopecks, -f.amountKopecks]);
      }
      row.netKopecks = sum([row.inflowKopecks, -row.outflowKopecks]);
      cfMap.set(key, row);
    }
  const cashBalance = (predicate) =>
    sum(
      ops
        .filter(predicate)
        .flatMap((o) => o.postings || [])
        .filter((p) => p.account === 'cash' && select(p))
        .map((p) => p.amountKopecks),
    );
  const opening = cashBalance((o) => o.date < from || o.kind === 'opening');
  const closing = cashBalance(() => true);
  const net = sum([inflow, -outflow]);
  const treasuryMovement = sum([closing, -opening, -net]);
  if (!direction && !ops.some((o) => o.projected) && treasuryMovement)
    warnings(
      'CASH_RECONCILIATION',
      'Движение денег не объясняет изменение остатка',
      treasuryMovement,
      'error',
    );
  const pnlRows = [...pnlMap.values()];
  const revenue = sum(
    pnlRows.filter((p) => p.account === 'revenue').map((p) => p.amountKopecks),
  );
  const expense = sum(
    pnlRows.filter((p) => p.account === 'expense').map((p) => p.amountKopecks),
  );
  const balanceRows = [];
  let assets = 0,
    liabilities = 0,
    equity = 0;
  const retained = -sum([
    balances.get('revenue') || 0,
    balances.get('expense') || 0,
  ]);
  for (const [account, signed] of balances) {
    if (!signed || ['revenue', 'expense'].includes(account)) continue;
    const meta = ACCOUNTS[account];
    if (!meta) {
      warnings('UNKNOWN_ACCOUNT', account, signed, 'error');
      continue;
    }
    let section = meta.section;
    if (section === 'dynamic') section = signed >= 0 ? 'assets' : 'liabilities';
    const value = ['liabilities', 'equity'].includes(section)
      ? -signed
      : signed;
    balanceRows.push({
      account,
      label: meta.label,
      section,
      amountKopecks: value,
    });
    if (section === 'assets') assets = sum([assets, value]);
    else if (section === 'liabilities') liabilities = sum([liabilities, value]);
    else if (section === 'equity') equity = sum([equity, value]);
  }
  if (retained) {
    balanceRows.push({
      account: 'current_result',
      label: 'Результат с начала учета',
      section: 'equity',
      amountKopecks: retained,
    });
    equity = sum([equity, retained]);
  }
  const difference = sum([assets, -liabilities, -equity]);
  if (difference)
    warnings('BALANCE_DIFFERENCE', 'Баланс не сходится', difference, 'error');
  const confirmedDocuments = new Set(state.confirmedDocumentIds || []);
  const documents = documentRows(ops)
    .filter(
      (d) =>
        !direction ||
        Object.prototype.hasOwnProperty.call(d.directionAmounts, direction),
    )
    .map((d) => ({
      ...d,
      status:
        d.status !== 'cancelled' && confirmedDocuments.has(d.id)
          ? 'confirmed'
          : d.status,
    }))
    .map((d) =>
      direction
        ? {
            ...d,
            amountKopecks: d.originalDirectionAmounts[direction] || 0,
            remainingKopecks: d.directionAmounts[direction] || 0,
            cancelledKopecks: d.cancelledDirectionAmounts?.[direction] || 0,
            eliminatedKopecks: d.eliminatedDirectionAmounts?.[direction] || 0,
            settledKopecks:
              (d.originalDirectionAmounts[direction] || 0) -
              (d.directionAmounts[direction] || 0) -
              (d.cancelledDirectionAmounts?.[direction] || 0) -
              (d.eliminatedDirectionAmounts?.[direction] || 0),
          }
        : d,
    )
    .map((d) => {
      const eliminated = -sum(
        eliminationRows
          .filter(
            (p) =>
              p.legalEntityId === d.legalEntityId &&
              p.documentId === d.id &&
              p.account === (d.side === 'receivable' ? 'ar' : 'ap') &&
              select(p),
          )
          .map((p) => p.amountKopecks * (d.side === 'receivable' ? 1 : -1)),
      );
      return eliminated
        ? {
            ...d,
            eliminatedKopecks: eliminated,
            remainingKopecks: sum([d.remainingKopecks, -eliminated]),
          }
        : d;
    });
  const provisional = sum(
    period
      .filter(
        (o) =>
          o.status === 'provisional' &&
          o.kind !== 'reversal' &&
          !reversedIds.has(o.id),
      )
      .flatMap((o) =>
        (o.postings || []).map((p) => ({
          ...p,
          recognitionDocumentId:
            p.recognitionDocumentId ||
            (o.kind === 'fuel_sale' && p.account === 'expense'
              ? `${o.id}:cost`
              : o.id),
        })),
      )
      .filter(
        (p) =>
          select(p) &&
          ['revenue', 'expense'].includes(p.account) &&
          !confirmedDocuments.has(p.recognitionDocumentId),
      )
      .map((p) => Math.abs(p.amountKopecks)),
  );
  if (provisional)
    warnings(
      'PROVISIONAL_ACCRUALS',
      'Есть предварительные начисления',
      provisional,
    );
  const legacyArticles = ops
    .filter((o) => o.kind !== 'reversal' && !reversedIds.has(o.id))
    .flatMap((o) => {
      const pnl = (o.postings || []).filter((p) =>
        ['revenue', 'expense'].includes(p.account),
      );
      return (pnl.length ? pnl : o.cashFlows || [])
        .filter(
          (p) =>
            select(p) &&
            !p.articleId &&
            p.article &&
            !OPERATION_KINDS.includes(p.article),
        )
        .map((p) => ({
          article: p.article,
          amountKopecks: p.amountKopecks,
        }));
    });
  if (legacyArticles.length)
    controls.push({
      code: 'LEGACY_ARTICLE',
      severity: 'warning',
      blocking: false,
      message: 'Есть статьи из источников, не сопоставленные со справочником',
      amountKopecks: sum(legacyArticles.map((p) => Math.abs(p.amountKopecks))),
      articleNames: [...new Set(legacyArticles.map((p) => p.article))],
      postingCount: legacyArticles.length,
    });
  const suspense = sum(
    ops
      .filter((o) => o.kind !== 'reversal' && !reversedIds.has(o.id))
      .flatMap((o) => o.postings || [])
      .filter((p) => p.account === 'suspense' && select(p))
      .map((p) => Math.abs(p.amountKopecks)),
  );
  if (suspense)
    warnings(
      'UNCLASSIFIED_CASH',
      'Есть неразобранные денежные операции',
      suspense,
    );
  const unassigned = ops
    .filter((o) => o.kind !== 'reversal' && !reversedIds.has(o.id))
    .flatMap((o) => o.postings || [])
    .filter(
      (p) =>
        select(p) &&
        p.directionId === UNASSIGNED &&
        ['revenue', 'expense'].includes(p.account),
    );
  if (unassigned.length) {
    const grossAmountKopecks = sum(
      unassigned.map((p) => Math.abs(p.amountKopecks)),
    );
    controls.push({
      code: 'UNASSIGNED_DIRECTION',
      severity: 'error',
      blocking: true,
      message: 'Есть доходы или расходы без назначенного направления',
      amountKopecks: grossAmountKopecks,
      grossAmountKopecks,
      netAmountKopecks: sum(unassigned.map((p) => -p.amountKopecks)),
      postingCount: unassigned.length,
    });
  }
  const cutover =
    state.cutoverDate ||
    catalogs(state).find((c) => c.kind === 'settings')?.cutoverDate;
  if (cutover && from < cutover)
    warnings(
      'INCOMPLETE_HISTORY',
      'Период начинается до даты перехода; история не восстановлена',
    );
  for (const entityId of entityIds)
    if (
      !ops.some(
        (o) =>
          o.kind === 'opening' &&
          o.status === 'confirmed' &&
          o.legalEntityId === entityId &&
          !reversedIds.has(o.id),
      )
    )
      warnings(
        'OPENING_BALANCES_UNVERIFIED',
        `Входящие остатки не подтверждены: ${entityId}`,
      );
  for (const account of catalogs(state).filter(
    (c) =>
      c.kind === 'accounts' && !c.archived && entityIds.has(c.legalEntityId),
  )) {
    const accountOps = all.filter(
      (o) =>
        o.legalEntityId === account.legalEntityId &&
        (o.postings || []).some((p) => p.cashAccountId === account.id),
    );
    if (!accountOps.length) continue;
    if (
      !account.statementDate ||
      account.statementBalanceKopecks === undefined
    ) {
      warnings(
        'CASH_STATEMENT_UNVERIFIED',
        `Нет независимого остатка: ${account.name}`,
      );
      continue;
    }
    const book = sum(
      accountOps
        .filter((o) => o.date <= account.statementDate)
        .flatMap((o) => o.postings)
        .filter((p) => p.account === 'cash' && p.cashAccountId === account.id)
        .map((p) => p.amountKopecks),
    );
    const difference = sum([book, -integer(account.statementBalanceKopecks)]);
    if (difference)
      warnings(
        'CASH_STATEMENT_DIFFERENCE',
        `Не сходится остаток: ${account.name}`,
        difference,
        'error',
      );
    if (account.statementDate < to)
      warnings(
        'CASH_STATEMENT_STALE',
        `Остаток ${account.name} подтвержден только на ${account.statementDate}`,
      );
  }
  if (!ops.length)
    warnings('NO_DATA', 'Операции не загружены; отчет не подтвержден');
  return {
    from,
    to,
    cf: {
      openingKopecks: opening,
      inflowKopecks: inflow,
      outflowKopecks: outflow,
      netKopecks: net,
      closingKopecks: closing,
      treasuryMovementKopecks: treasuryMovement,
      rows: [...cfMap.values()],
    },
    pnl: {
      revenueKopecks: revenue,
      expenseKopecks: expense,
      directExpenseKopecks: sum(
        pnlRows
          .filter((p) => p.account === 'expense' && !p.allocated)
          .map((p) => p.amountKopecks),
      ),
      allocatedExpenseKopecks: sum(
        pnlRows
          .filter((p) => p.account === 'expense' && p.allocated)
          .map((p) => p.amountKopecks),
      ),
      profitKopecks: sum([revenue, -expense]),
      rows: pnlRows,
    },
    balance: {
      assetsKopecks: assets,
      liabilitiesKopecks: liabilities,
      equityKopecks: equity,
      differenceKopecks: difference,
      rows: balanceRows,
    },
    receivables: documents.filter((d) => d.side === 'receivable'),
    payables: documents.filter((d) => d.side === 'payable'),
    eliminations: eliminationRows,
    controls,
    status: controls.length ? 'provisional' : 'ready',
  };
}
function buildCalendar(state = {}, filters = {}) {
  const from = date(filters.from || new Date().toISOString().slice(0, 10));
  const to = date(
    filters.to ||
      new Date(Date.parse(`${from}T00:00:00Z`) + 90 * 86400000)
        .toISOString()
        .slice(0, 10),
  );
  if (to < from || Date.parse(to) - Date.parse(from) > 370 * 86400000)
    fail('INVALID_CALENDAR_PERIOD');
  // Calendar is an as-of forecast: past/future obligations are computed using
  // facts through asOf (today by default), independently of displayed window.
  const asOf = date(filters.asOf || new Date().toISOString().slice(0, 10));
  const ops = selectedOperations(state, filters).filter((o) => o.date <= asOf);
  const reversedIds = new Set(
    ops.map((o) => o.reversesId || o.originalOperationId).filter(Boolean),
  );
  const confirmedDocuments = new Set(state.confirmedDocumentIds || []);
  const docs = documentRows(ops.filter((o) => !o.consolidationOnly))
    .filter(
      (d) =>
        d.remainingKopecks > 0 &&
        (!filters.directionId ||
          (d.directionAmounts[filters.directionId] || 0) > 0),
    )
    .map((d) => ({
      ...d,
      status:
        d.status !== 'cancelled' && confirmedDocuments.has(d.id)
          ? 'confirmed'
          : d.status,
    }))
    .map((d) =>
      filters.directionId
        ? {
            ...d,
            amountKopecks: d.originalDirectionAmounts[filters.directionId] || 0,
            remainingKopecks: d.directionAmounts[filters.directionId],
            directionId: filters.directionId,
          }
        : d,
    );
  const entities =
    filters.legalEntityIds ||
    (filters.legalEntityId ? [filters.legalEntityId] : null);
  const plans = catalogs(state)
    .filter(
      (c) =>
        c.kind === 'plans' &&
        !c.archived &&
        c.status !== 'cancelled' &&
        (!entities || entities.includes(c.legalEntityId)) &&
        (!filters.directionId || c.directionId === filters.directionId),
    )
    .sort(
      (a, b) =>
        (a.expectedDate || a.date || '9999').localeCompare(
          b.expectedDate || b.date || '9999',
        ) || a.id.localeCompare(b.id),
    );
  const rows = [];
  const linked = new Map();
  const applied = new Map();
  for (const plan of plans) {
    let amount = integer(plan.amountKopecks || 0);
    let document = null;
    if (plan.documentId) {
      document = docs.find(
        (d) =>
          d.documentId === plan.documentId &&
          d.legalEntityId === plan.legalEntityId,
      );
      if (!document) continue;
      if (!applied.has(document.id))
        applied.set(
          document.id,
          Math.max(
            0,
            document.amountKopecks -
              document.remainingKopecks -
              integer(plan.settledBaselineKopecks || 0),
          ),
        );
      const settled = Math.min(amount, applied.get(document.id));
      applied.set(document.id, applied.get(document.id) - settled);
      amount -= settled;
      const used = linked.get(document.id) || 0;
      amount = Math.min(amount, Math.max(0, document.remainingKopecks - used));
      linked.set(document.id, sum([used, amount]));
    } else {
      const paid = sum(
        ops
          .filter(
            (o) =>
              o.planId === plan.id &&
              o.kind !== 'reversal' &&
              !reversedIds.has(o.id),
          )
          .map((o) =>
            o.amountKopecks === null
              ? sum((o.cashFlows || []).map((f) => Math.abs(f.amountKopecks)))
              : o.amountKopecks,
          ),
      );
      amount = Math.max(0, amount - paid);
    }
    if (!amount) continue;
    rows.push({
      id: plan.id,
      documentId: plan.documentId || null,
      date: plan.expectedDate || plan.date || null,
      legalEntityId: plan.legalEntityId,
      directionId: plan.directionId || COMMON,
      counterpartyId: plan.counterpartyId || document?.counterpartyId || null,
      cashAccountId: plan.cashAccountId || null,
      flow: plan.flow,
      amountKopecks: amount,
      description: plan.name,
      status: plan.status || 'planned',
    });
  }
  for (const d of docs) {
    const amount = d.remainingKopecks - (linked.get(d.id) || 0);
    if (amount <= 0) continue;
    rows.push({
      id: `document:${d.id}`,
      documentId: d.id,
      date: d.expectedDate || d.dueDate || null,
      dueDate: d.dueDate,
      legalEntityId: d.legalEntityId,
      directionId: d.directionId,
      counterpartyId: d.counterpartyId,
      flow: d.side === 'receivable' ? 'in' : 'out',
      amountKopecks: amount,
      description: d.description,
      status: d.status,
    });
  }
  let opening = sum(
    ops
      .flatMap((o) => o.postings || [])
      .filter(
        (p) =>
          p.account === 'cash' &&
          (!filters.cashAccountId ||
            p.cashAccountId === filters.cashAccountId) &&
          (!filters.directionId || p.directionId === filters.directionId),
      )
      .map((p) => p.amountKopecks),
  );
  const relevant = rows.filter(
    (r) => !filters.cashAccountId || r.cashAccountId === filters.cashAccountId,
  );
  const forecastFrom = from > asOf ? from : asOf;
  opening = sum([
    opening,
    ...relevant
      .filter((r) => r.date && r.date >= asOf && r.date < forecastFrom)
      .map((r) => (r.flow === 'in' ? r.amountKopecks : -r.amountKopecks)),
  ]);
  const days = [];
  let balance = opening;
  for (
    let ms = Date.parse(`${forecastFrom}T00:00:00Z`);
    ms <= Date.parse(`${to}T00:00:00Z`);
    ms += 86400000
  ) {
    const day = new Date(ms).toISOString().slice(0, 10);
    const scheduled = relevant.filter((r) => r.date === day);
    const inflow = sum(
      scheduled.filter((r) => r.flow === 'in').map((r) => r.amountKopecks),
    );
    const outflow = sum(
      scheduled.filter((r) => r.flow === 'out').map((r) => r.amountKopecks),
    );
    balance = sum([balance, inflow, -outflow]);
    days.push({
      date: day,
      inflowKopecks: inflow,
      outflowKopecks: outflow,
      closingKopecks: balance,
      deficitKopecks: Math.max(0, -balance),
    });
  }
  return {
    from,
    to,
    asOf,
    forecastFrom,
    openingKopecks: opening,
    closingKopecks: balance,
    rows: relevant,
    days,
    undated: relevant.filter((r) => !r.date),
    overdue: relevant.filter((r) => r.date && r.date < asOf),
    controls: relevant.some((r) => !r.date)
      ? [
          {
            code: 'UNDATED_PLANS',
            severity: 'warning',
            message: 'Есть платежи без ожидаемой даты',
          },
        ]
      : [],
  };
}
module.exports = {
  ACCOUNTS,
  OPERATION_KINDS,
  COMMON,
  UNASSIGNED,
  toKopecks,
  formatMoney,
  allocateAmount,
  validateCatalog,
  parseCatalog: validateCatalog,
  buildOperation,
  validateSettlement,
  buildReports,
  buildCalendar,
};
