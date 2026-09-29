'use strict';

const { createHash } = require('node:crypto');
const { resolveArticle } = require('./finance-articles');
const fail = (message) => {
  const e = new Error(message);
  e.code = 'FINANCE_AUTOMATION_INVALID';
  e.status = 400;
  throw e;
};
const validDate = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const safe = (n) => {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < 0n)
    fail('Сумма выходит за допустимые пределы.');
  return Number(n);
};
const integer = (v, label, zero = false) => {
  if (!Number.isSafeInteger(v) || v < (zero ? 0 : 1))
    fail('Некорректное значение: ' + label);
  return v;
};
const round = (numerator, denominator) =>
  safe((numerator * 2n + denominator) / (2n * denominator));
const vatFromGross = (amount, rate) =>
  round(BigInt(amount) * BigInt(rate), BigInt(10000 + rate));
const includesEntity = (r, id) =>
  r.legalEntityId === id || (r.legalEntityIds || []).includes(id);
function deterministicId(value) {
  const hash = createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function validateAutomationCatalog(kind, value) {
  if (kind === 'classification_rules' && value.ruleType === 'fuel') {
    if (!['RN', 'LC'].includes(value.provider))
      fail('Для карты выберите поставщика RN или LC.');
    if (
      typeof value.card !== 'string' ||
      !value.card.trim() ||
      value.card.length > 100
    )
      fail('Укажите точный номер топливной карты.');
    if (
      !value.counterpartyId ||
      !value.supplierCounterpartyId ||
      !value.directionId
    )
      fail('Для правила топлива нужны покупатель, поставщик и направление.');
    if (
      !validDate(value.effectiveFrom) ||
      (value.effectiveTo &&
        (!validDate(value.effectiveTo) ||
          value.effectiveTo < value.effectiveFrom))
    )
      fail('Укажите корректный период действия цены.');
    if (!['payable', 'advance'].includes(value.purchaseMode || 'payable'))
      fail('Выберите закупку в кредит или за счет аванса.');
    const pricing = value.pricing;
    if (pricing?.type === 'per_litre')
      integer(pricing.priceKopecksPerLitre, 'цена литра');
    else if (pricing?.type === 'markup') {
      integer(pricing.basisPoints, 'наценка', true);
      if (pricing.basisPoints > 100000)
        fail('Наценка больше 1000%. Проверьте правило.');
    } else fail('Задайте цену литра или наценку к закупке.');
    for (const key of ['saleVatBasisPoints', 'costVatBasisPoints'])
      if (value[key] != null) {
        integer(value[key], 'ставка НДС', true);
        if (value[key] > 10000) fail('Некорректная ставка НДС.');
      }
  }
  if (kind === 'plans' && value.recurrence) {
    const r = value.recurrence;
    if (
      r.frequency !== 'monthly' ||
      !validDate(r.startDate) ||
      (r.endDate && (!validDate(r.endDate) || r.endDate < r.startDate))
    )
      fail('Задайте период ежемесячного платежа.');
    integer(r.dayOfMonth, 'день месяца');
    if (r.dayOfMonth > 31) fail('День месяца должен быть от 1 до 31.');
    if (value.documentId)
      fail(
        'Регулярный шаблон не связывается с одним документом; для документа создайте отдельный платеж.',
      );
    if (value.accrual) {
      if (
        value.flow !== 'out' ||
        value.accrual.kind !== 'expense' ||
        !value.counterpartyId
      )
        fail(
          'Регулярное начисление услуги требует поставщика и расходного плана.',
        );
      integer(value.accrual.vatKopecks, 'НДС услуги', true);
      if (value.accrual.vatKopecks > value.amountKopecks)
        fail('НДС больше суммы услуги.');
      if (
        !value.accrual.articleId &&
        !value.articleId &&
        !value.accrual.article?.trim()
      )
        fail('Укажите статью регулярного расхода.');
    }
  }
  return value;
}

function applyFuelRules(row, rules, articleContext) {
  if (!row.fuel) return row;
  const out = structuredClone(row),
    op = out.operation;
  const sheet = String(out.sourceSheet || '')
    .toUpperCase()
    .replace(/С/g, 'C');
  const provider = /^(RN|РН)$/.test(sheet)
    ? 'RN'
    : /^(LC|ЛC)$/.test(sheet)
      ? 'LC'
      : null;
  const matches = rules.filter(
    (r) =>
      r.kind === 'classification_rules' &&
      r.ruleType === 'fuel' &&
      !r.archived &&
      r.provider === provider &&
      r.card.trim() === String(out.fuel.card).trim() &&
      includesEntity(r, op.legalEntityId) &&
      (!op.responsibilityScopeId ||
        r.responsibilityScopeIds?.includes(op.responsibilityScopeId)) &&
      op.date &&
      r.effectiveFrom <= op.date &&
      (!r.effectiveTo || r.effectiveTo >= op.date),
  );
  if (matches.length !== 1) {
    out.issues.push(
      matches.length
        ? 'На дату пролива действуют несколько правил карты: выберите одно.'
        : 'Не найдено действующее правило карты и цены продажи.',
    );
    return out;
  }
  const rule = matches[0];
  validateAutomationCatalog('classification_rules', rule);
  const cost = out.fuel.costKopecks;
  if (!Number.isSafeInteger(cost) || cost <= 0) {
    out.issues.push('Нет подтвержденной закупочной стоимости пролива.');
    return out;
  }
  const litres = String(out.fuel.litres)
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.');
  if (!/^\d+(?:\.\d{1,6})?$/.test(litres) || Number(litres) <= 0) {
    out.issues.push(
      'Уточните положительный объем пролива с точностью до 6 знаков.',
    );
    return out;
  }
  const [whole, fraction = ''] = litres.split('.');
  const units = BigInt(whole + fraction),
    scale = 10n ** BigInt(fraction.length);
  const amount =
    rule.pricing.type === 'per_litre'
      ? round(units * BigInt(rule.pricing.priceKopecksPerLitre), scale)
      : round(BigInt(cost) * BigInt(10000 + rule.pricing.basisPoints), 10000n);
  out.issues = out.issues.filter(
    (s) => !s.startsWith('Нужна продажная стоимость'),
  );
  Object.assign(op, {
    kind: 'fuel_sale',
    amountKopecks: amount,
    costKopecks: cost,
    counterpartyId: rule.counterpartyId,
    supplierCounterpartyId: rule.supplierCounterpartyId,
    directionId: rule.directionId,
    purchaseMode: rule.purchaseMode || 'payable',
    article: rule.article || 'Продажа топлива',
    articleId: rule.articleId || null,
    status: 'provisional',
    litres,
    fuelCard: out.fuel.card,
    fuelProduct: out.fuel.product,
    managerName: rule.managerName || null,
    pricingRule: {
      id: rule.id,
      version: rule.version,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo || null,
      pricing: structuredClone(rule.pricing),
    },
  });
  if (!op.responsibilityScopeId && rule.responsibilityScopeIds?.length === 1)
    op.responsibilityScopeId = rule.responsibilityScopeIds[0];
  if (articleContext) {
    try {
      Object.assign(op, resolveArticle(op, articleContext));
    } catch (error) {
      out.status = 'error';
      out.issues.push(error.userMessage || error.message);
    }
  }
  for (const [key, target, base] of [
    ['saleVatBasisPoints', 'vatKopecks', amount],
    ['costVatBasisPoints', 'costVatKopecks', cost],
  ]) {
    if (rule[key] != null) op[target] = vatFromGross(base, rule[key]);
    else
      out.issues.push(
        'Уточните НДС ' +
          (key === 'saleVatBasisPoints' ? 'продажи' : 'закупки') +
          ': ставка в правиле не задана.',
      );
  }
  out.status = 'review';
  out.ruleExplanation = `Карта ${out.fuel.card}, ${provider}, правило «${rule.name}», версия ${rule.version || 1}; расчет по цене на ${op.date}.`;
  out.issues.push(
    'Проверьте договор, цену и покупателя; правило не подтверждает закрывающий документ.',
  );
  return out;
}

function occurrences(plan, to) {
  validateAutomationCatalog('plans', plan);
  if (!plan.recurrence || plan.archived || plan.status === 'cancelled')
    return [];
  const r = plan.recurrence,
    finish = r.endDate && r.endDate < to ? r.endDate : to;
  let year = Number(r.startDate.slice(0, 4)),
    month = Number(r.startDate.slice(5, 7));
  const result = [];
  while (`${year}-${String(month).padStart(2, '0')}-01` <= finish) {
    if (result.length >= 240)
      fail('Шаблон охватывает больше 20 лет. Уточните дату начала.');
    const monthKey = `${year}-${String(month).padStart(2, '0')}`,
      endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const expectedDate = `${monthKey}-${String(Math.min(r.dayOfMonth, endDay)).padStart(2, '0')}`;
    if (expectedDate >= r.startDate && expectedDate <= finish)
      result.push({
        expectedDate,
        accrualDate: `${monthKey}-${endDay}`,
        month: monthKey,
        sourceId: `${plan.id}:${monthKey}`,
      });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return result;
}

function recurringState(state, to) {
  const output = { ...state, catalogs: [] },
    pending = [];
  for (const plan of state.catalogs || []) {
    if (plan.kind !== 'plans' || !plan.recurrence) {
      output.catalogs.push(plan);
      continue;
    }
    for (const period of occurrences(plan, to)) {
      const document = (state.operations || []).find(
        (op) =>
          op.source?.system === 'recurring' &&
          op.source.id === period.sourceId &&
          !(state.operations || []).some((rev) => rev.reversesId === op.id),
      );
      const virtual = {
        ...plan,
        id: deterministicId(period.sourceId),
        name: `${plan.name} · ${period.month}`,
        recurrence: undefined,
        expectedDate: period.expectedDate,
        recurrenceTemplateId: plan.id,
        recurringSourceId: period.sourceId,
        documentId: document?.id,
        directionId: plan.directionId || '__unassigned__',
      };
      output.catalogs.push(virtual);
      if (
        plan.accrual &&
        period.accrualDate <= to &&
        !document &&
        plan.status === 'approved'
      )
        pending.push({ plan, period, virtual });
    }
  }
  return { state: output, pending };
}

function recurringPreviewRows(state, from, to) {
  return recurringState(state, to)
    .pending.filter(({ period }) => period.accrualDate >= from)
    .map(({ plan, period }, index) => ({
      rowNumber: index + 1,
      sourceSheet: 'Регулярные услуги',
      sourceRow: index + 1,
      sourceId: period.sourceId,
      status: 'review',
      issues: [
        'Проверьте выполнение услуги за месяц; поздний акт 1С нужно связать с этим начислением.',
      ],
      operation: {
        kind: 'expense',
        date: period.accrualDate,
        expectedDate: period.expectedDate,
        dueDate: period.expectedDate,
        amountKopecks: plan.amountKopecks,
        vatKopecks: plan.accrual.vatKopecks,
        counterpartyId: plan.counterpartyId,
        legalEntityId: plan.legalEntityId,
        responsibilityScopeId:
          plan.responsibilityScopeIds?.length === 1
            ? plan.responsibilityScopeIds[0]
            : undefined,
        directionId: plan.directionId || '__unassigned__',
        allocationRuleId: plan.allocationRuleId,
        description: `${plan.name} · ${period.month}`,
        article: plan.accrual.article,
        articleId: plan.accrual.articleId || plan.articleId || null,
        status: 'provisional',
        source: {
          system: 'recurring',
          id: period.sourceId,
          version: String(plan.version || 1),
        },
      },
    }))
    .map((row) => {
      try {
        const plan = state.catalogs.find(
          (item) =>
            item.kind === 'plans' && row.sourceId.startsWith(item.id + ':'),
        );
        const allocation = state.catalogs.find(
          (item) => item.id === row.operation.allocationRuleId,
        );
        Object.assign(
          row.operation,
          resolveArticle(
            {
              ...row.operation,
              responsibilityScopeIds: plan?.responsibilityScopeIds,
            },
            state,
            {
              directionIds: allocation?.weights?.map(
                (item) => item.directionId,
              ) || [row.operation.directionId],
            },
          ),
        );
      } catch (error) {
        row.status = 'error';
        row.issues.push(error.userMessage || error.message);
      }
      return row;
    });
}
module.exports = {
  validateAutomationCatalog,
  applyFuelRules,
  recurringState,
  recurringPreviewRows,
};
