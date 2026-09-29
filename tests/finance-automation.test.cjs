const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyFuelRules,
  validateAutomationCatalog,
  recurringState,
  recurringPreviewRows,
} = require('../recovered/apps/api/src/modules/finance/domain/finance-automation');
const rule = {
  id: 'rule',
  kind: 'classification_rules',
  ruleType: 'fuel',
  provider: 'RN',
  card: '00123',
  name: 'Цена клиента',
  version: 2,
  legalEntityId: 'entity',
  responsibilityScopeIds: ['scope'],
  counterpartyId: 'buyer',
  supplierCounterpartyId: 'supplier',
  directionId: 'fuel',
  effectiveFrom: '2026-09-01',
  effectiveTo: '2026-09-30',
  pricing: { type: 'per_litre', priceKopecksPerLitre: 6037 },
  saleVatBasisPoints: 2000,
  costVatBasisPoints: 2000,
};
const row = {
  sourceSheet: 'RN',
  operation: { legalEntityId: 'entity', date: '2026-09-15' },
  fuel: { card: '00123', litres: '10,125', costKopecks: 50000 },
  issues: [
    'Нужна продажная стоимость по договору покупателя; закупочная сумма не является выручкой',
  ],
  status: 'error',
};
test('fuel card rule snapshots price and rounds decimal litres in integer kopecks', () => {
  const r = applyFuelRules(row, [rule]);
  assert.equal(r.operation.amountKopecks, 61125);
  assert.equal(r.operation.costKopecks, 50000);
  assert.equal(r.operation.vatKopecks, 10188);
  assert.equal(r.operation.pricingRule.version, 2);
  assert.equal(r.operation.responsibilityScopeId, 'scope');
  assert.equal(r.operation.status, 'provisional');
  assert.equal(row.status, 'error');
  assert.equal(r.status, 'review');
});
test('fuel mapping rejects overlaps, expired rules, foreign scopes and does not invent VAT', () => {
  assert.equal(
    applyFuelRules(row, [rule, rule]).operation.counterpartyId,
    undefined,
  );
  assert.equal(
    applyFuelRules(
      { ...row, operation: { ...row.operation, date: '2026-10-01' } },
      [rule],
    ).operation.amountKopecks,
    undefined,
  );
  assert.equal(
    applyFuelRules(
      {
        ...row,
        operation: { ...row.operation, responsibilityScopeId: 'other' },
      },
      [rule],
    ).operation.amountKopecks,
    undefined,
  );
  const r = applyFuelRules(row, [
    {
      ...rule,
      pricing: { type: 'markup', basisPoints: 1000 },
      saleVatBasisPoints: undefined,
      costVatBasisPoints: undefined,
    },
  ]);
  assert.equal(r.operation.amountKopecks, 55000);
  assert.equal(r.operation.vatKopecks, undefined);
  assert.ok(r.issues.some((s) => s.includes('НДС продажи')));
});
const plan = {
  id: 'rent',
  kind: 'plans',
  name: 'Аренда',
  version: 1,
  legalEntityId: 'entity',
  responsibilityScopeIds: ['scope'],
  flow: 'out',
  status: 'approved',
  counterpartyId: 'landlord',
  amountKopecks: 120000,
  recurrence: { frequency: 'monthly', startDate: '2026-01-01', dayOfMonth: 31 },
  accrual: { kind: 'expense', vatKopecks: 20000, article: 'Аренда' },
};
test('recurring calendar clamps last day and past accrual creates exactly one monthly candidate', () => {
  const state = { catalogs: [plan], operations: [] },
    r = recurringState(state, '2026-03-15');
  assert.equal(r.state.catalogs.length, 2);
  assert.equal(r.state.catalogs[1].expectedDate, '2026-02-28');
  assert.equal(r.pending.length, 2);
  const rows = recurringPreviewRows(state, '2026-02-01', '2026-03-15');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].operation.date, '2026-02-28');
  assert.equal(rows[0].operation.source.id, 'rent:2026-02');
  state.operations.push({
    id: 'expense',
    source: { system: 'recurring', id: 'rent:2026-02', version: '1' },
  });
  plan.version = 2;
  assert.equal(
    recurringPreviewRows(state, '2026-02-01', '2026-03-15').length,
    0,
  );
  assert.equal(
    recurringState(state, '2026-03-15').state.catalogs[1].documentId,
    'expense',
  );
});
test('regular services require explicit tax and counterparty, not inferred zero', () => {
  assert.throws(
    () =>
      validateAutomationCatalog('plans', {
        ...plan,
        accrual: { kind: 'expense', article: 'Rent' },
      }),
    /НДС/,
  );
  assert.throws(
    () => validateAutomationCatalog('plans', { ...plan, documentId: 'doc' }),
    /одним документом/,
  );
});
