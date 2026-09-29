const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../recovered/apps/api/src/modules/finance/domain/finance-ledger.js');
const BASE = {
  legalEntityId: 'company',
  regionId: 'region',
  projectId: 'project',
  responsibilityScopeId: 'scope',
  date: '2026-09-01',
  directionId: 'delivery',
};
function fixture() {
  const state = {
    operations: [],
    catalogs: [
      {
        kind: 'accounts',
        id: 'bank',
        name: 'Расчетный счет',
        legalEntityId: 'company',
        directionId: '__common__',
        type: 'bank',
      },
    ],
  };
  const post = (input) => {
    const result = ledger.buildOperation({ ...BASE, ...input }, state);
    state.operations.push(result);
    return result;
  };
  return {
    state,
    post,
    report: (filters) =>
      ledger.buildReports(state, {
        from: '2026-09-01',
        to: '2026-09-30',
        ...filters,
      }),
  };
}
test('money never rounds binary floats and large decimal inputs stay exact', () => {
  assert.equal(ledger.toKopecks('9999999999.99'), 999999999999);
  assert.equal(ledger.toKopecks('0,01'), 1);
  assert.equal(ledger.formatMoney(-10001), '-100.01');
  assert.throws(() => ledger.toKopecks(0.1 + 0.2), /INVALID_MONEY/);
  assert.throws(() => ledger.toKopecks('1e3'), /INVALID_MONEY/);
  assert.throws(
    () => ledger.toKopecks('900719925474099.99'),
    /AMOUNT_OVERFLOW/,
  );
});
test('unpaid service, carrier cost and partial receipt agree across all reports', () => {
  const { post, report, state } = fixture();
  const sale = post({
    kind: 'sale',
    amount: '100',
    counterpartyId: 'client',
    dueDate: '2026-09-10',
  });
  post({
    kind: 'expense',
    amount: '70',
    counterpartyId: 'carrier',
    dueDate: '2026-09-11',
  });
  post({
    kind: 'payment_in',
    amount: '40',
    counterpartyId: 'client',
    cashAccountId: 'bank',
    allocations: [{ documentId: sale.id, amount: '40' }],
  });
  const r = report();
  assert.equal(r.pnl.profitKopecks, 3000);
  assert.equal(r.cf.netKopecks, 4000);
  assert.equal(r.receivables[0].remainingKopecks, 6000);
  assert.equal(r.payables[0].remainingKopecks, 7000);
  assert.equal(r.balance.assetsKopecks, 10000);
  assert.equal(r.balance.liabilitiesKopecks, 7000);
  assert.equal(r.balance.differenceKopecks, 0);
  const direction = report({ directionId: 'delivery' });
  assert.equal(direction.cf.closingKopecks, 0);
  assert.equal(direction.cf.inflowKopecks, 4000);
  assert.equal(direction.cf.treasuryMovementKopecks, -4000);
  assert.equal(
    direction.balance.rows.find((r) => r.account === 'treasury').amountKopecks,
    4000,
  );
  assert.equal(direction.balance.differenceKopecks, 0);
  assert.equal(
    report({ directionId: '__common__' }).balance.differenceKopecks,
    0,
  );
  const calendar = ledger.buildCalendar(state, {
    from: '2026-09-01',
    to: '2026-09-12',
    asOf: '2026-09-01',
  });
  assert.equal(calendar.rows.find((r) => r.flow === 'in').amountKopecks, 6000);
  assert.equal(calendar.rows.find((r) => r.flow === 'out').amountKopecks, 7000);
});
test('VAT is separate from profit and payments never create a second sale', () => {
  const { post, report } = fixture();
  const sale = post({
    kind: 'sale',
    amount: '120',
    vat: '20',
    counterpartyId: 'client',
  });
  post({ kind: 'expense', amount: '84', vat: '14', counterpartyId: 'carrier' });
  post({
    kind: 'payment_in',
    amount: '120',
    cashAccountId: 'bank',
    counterpartyId: 'client',
    allocations: [{ documentId: sale.id, amount: '120' }],
  });
  const r = report();
  assert.equal(r.pnl.revenueKopecks, 10000);
  assert.equal(r.pnl.expenseKopecks, 7000);
  assert.equal(r.pnl.profitKopecks, 3000);
  assert.equal(r.cf.netKopecks, 12000);
  assert.equal(r.balance.differenceKopecks, 0);
  assert.equal(
    r.balance.rows.find((r) => r.account === 'input_vat').amountKopecks,
    1400,
  );
});
test('one payment settles multiple documents and later settlement applies only free advance', () => {
  const { post, report } = fixture();
  const a = post({ kind: 'sale', amount: '60', counterpartyId: 'client' });
  const b = post({ kind: 'sale', amount: '50', counterpartyId: 'client' });
  const payment = post({
    kind: 'payment_in',
    amount: '100',
    cashAccountId: 'bank',
    counterpartyId: 'client',
    allocations: [
      { documentId: a.id, amount: '60' },
      { documentId: b.id, amount: '10' },
    ],
  });
  const settlement = post({
    kind: 'settlement',
    paymentId: payment.id,
    allocations: [{ documentId: b.id, amount: '30' }],
  });
  assert.equal(
    report().receivables.find((r) => r.id === b.id).remainingKopecks,
    1000,
  );
  assert.equal(report().cf.netKopecks, 10000);
  assert.throws(
    () =>
      post({
        kind: 'settlement',
        paymentId: payment.id,
        allocations: [{ documentId: b.id, amount: '1' }],
      }),
    /OVER_SETTLEMENT/,
  );
  assert.throws(
    () =>
      post({
        kind: 'reversal',
        originalOperationId: payment.id,
        reason: 'ошибка',
      }),
    /DEPENDENT_OPERATIONS/,
  );
  post({
    kind: 'reversal',
    originalOperationId: settlement.id,
    reason: 'отмена разноски',
  });
  post({
    kind: 'reversal',
    originalOperationId: payment.id,
    reason: 'отмена платежа',
  });
  assert.equal(report().cf.netKopecks, 0);
  assert.equal(
    report().receivables.find((r) => r.id === b.id).remainingKopecks,
    5000,
  );
});
test('supplier prepayment and fuel sale consume paid balance, not cash twice', () => {
  const { post, report } = fixture();
  post({
    kind: 'capital_in',
    amount: '100',
    cashAccountId: 'bank',
    directionId: '__common__',
  });
  post({
    kind: 'supplier_advance',
    amount: '100',
    cashAccountId: 'bank',
    counterpartyId: 'supplier',
    directionId: '__common__',
  });
  post({
    kind: 'fuel_sale',
    amount: '90',
    cost: '60',
    counterpartyId: 'buyer',
    supplierCounterpartyId: 'supplier',
    purchaseMode: 'advance',
    directionId: 'fuel',
  });
  const r = report();
  assert.equal(r.pnl.profitKopecks, 3000);
  assert.equal(r.cf.closingKopecks, 0);
  assert.equal(
    r.balance.rows.find((r) => r.account === 'supplier_advance').amountKopecks,
    4000,
  );
  assert.equal(r.balance.differenceKopecks, 0);
  assert.equal(report({ directionId: 'fuel' }).balance.differenceKopecks, 0);
  assert.throws(
    () =>
      post({
        kind: 'fuel_sale',
        amount: '90',
        cost: '50',
        counterpartyId: 'buyer',
        supplierCounterpartyId: 'supplier',
        purchaseMode: 'advance',
      }),
    /INSUFFICIENT_ADVANCE/,
  );
});
test('fuel carrier setoff reduces two debts and never changes cash', () => {
  const { post, report } = fixture();
  const sale = post({
    kind: 'sale',
    amount: '90',
    counterpartyId: 'carrier',
    directionId: 'fuel',
  });
  const cost = post({
    kind: 'expense',
    amount: '70',
    counterpartyId: 'carrier',
  });
  post({
    kind: 'setoff',
    amount: '50',
    receivableId: sale.id,
    payableId: cost.id,
    reason: 'Соглашение 1',
  });
  assert.equal(report().receivables[0].remainingKopecks, 4000);
  assert.equal(report().payables[0].remainingKopecks, 2000);
  assert.equal(report().cf.netKopecks, 0);
  assert.equal(report({ directionId: 'fuel' }).balance.differenceKopecks, 0);
  assert.equal(
    report({ directionId: 'delivery' }).balance.differenceKopecks,
    0,
  );
});
test('shared expense allocation preserves every kopeck and follows payment', () => {
  const { post, report, state } = fixture();
  state.catalogs.push({
    ...ledger.validateCatalog('allocation_rules', {
      id: 'rule',
      name: 'Офис',
      effectiveFrom: '2026-01-01',
      weights: [
        { directionId: 'crew', percent: '60' },
        { directionId: 'delivery', percent: '40' },
      ],
    }),
    version: 1,
  });
  const cost = post({
    kind: 'expense',
    amount: '200.01',
    counterpartyId: 'landlord',
    allocationRuleId: 'rule',
    directionId: '__common__',
  });
  assert.equal(report({ directionId: 'crew' }).pnl.expenseKopecks, 12001);
  assert.equal(report({ directionId: 'delivery' }).pnl.expenseKopecks, 8000);
  post({
    kind: 'payment_out',
    amount: '200.01',
    counterpartyId: 'landlord',
    cashAccountId: 'bank',
    allocations: [{ documentId: cost.id, amount: '200.01' }],
  });
  assert.equal(report({ directionId: 'crew' }).cf.outflowKopecks, 12001);
  assert.equal(report({ directionId: 'delivery' }).cf.outflowKopecks, 8000);
  state.catalogs.find((c) => c.id === 'rule').weights = [
    { directionId: 'crew', basisPoints: 5000 },
    { directionId: 'delivery', basisPoints: 5000 },
  ];
  assert.equal(report({ directionId: 'crew' }).pnl.expenseKopecks, 12001);
  assert.equal(cost.allocationRule.version, 1);
  for (const directionId of ['crew', 'delivery', '__common__'])
    assert.equal(report({ directionId }).balance.differenceKopecks, 0);
});
test('opening cash, financed asset, depreciation and principal have distinct effects', () => {
  const { post, report } = fixture();
  post({
    kind: 'opening',
    directionId: '__common__',
    postings: [
      { account: 'cash', amountKopecks: 10000, cashAccountId: 'bank' },
      { account: 'equity', amountKopecks: -10000 },
    ],
  });
  post({ kind: 'loan_received', amount: '100', cashAccountId: 'bank' });
  const asset = post({
    kind: 'asset_purchase',
    amount: '150',
    counterpartyId: 'seller',
  });
  post({
    kind: 'payment_out',
    amount: '150',
    counterpartyId: 'seller',
    cashAccountId: 'bank',
    allocations: [{ documentId: asset.id, amount: '150' }],
  });
  post({ kind: 'depreciation', amount: '10' });
  post({ kind: 'loan_repayment', amount: '20', cashAccountId: 'bank' });
  const r = report();
  assert.equal(r.pnl.expenseKopecks, 1000);
  assert.equal(r.cf.openingKopecks, 10000);
  assert.equal(r.cf.closingKopecks, 3000);
  assert.equal(r.balance.differenceKopecks, 0);
  assert.equal(
    r.cf.rows.find((r) => r.category === 'investing').outflowKopecks,
    15000,
  );
  assert.equal(
    r.balance.rows.find((r) => r.account === 'loan_payable').amountKopecks,
    8000,
  );
  assert.throws(
    () => post({ kind: 'depreciation', amount: '151' }),
    /EXCESS_DEPRECIATION/,
  );
});
test('bank transfers do not inflate external CF and keep account balances', () => {
  const { post, report, state } = fixture();
  state.catalogs.push({
    kind: 'accounts',
    id: 'bank2',
    name: 'Счет 2',
    legalEntityId: 'company',
    directionId: '__common__',
  });
  post({ kind: 'capital_in', amount: '100', cashAccountId: 'bank' });
  post({
    kind: 'transfer',
    amount: '40',
    cashAccountId: 'bank',
    toCashAccountId: 'bank2',
  });
  assert.equal(report().cf.inflowKopecks, 10000);
  assert.equal(report().cf.outflowKopecks, 0);
  assert.equal(report().cf.closingKopecks, 10000);
});
test('internal service sales and debts cancel only in complete group reports', () => {
  const { post, report } = fixture();
  post({
    kind: 'sale',
    amount: '100',
    counterpartyId: 'B',
    legalEntityId: 'company',
    intercompany: { key: 'internal1', counterpartyLegalEntityId: 'B' },
  });
  post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'company',
    legalEntityId: 'B',
    intercompany: { key: 'internal1', counterpartyLegalEntityId: 'company' },
  });
  const group = report();
  assert.equal(group.pnl.revenueKopecks, 0);
  assert.equal(group.pnl.expenseKopecks, 0);
  assert.equal(group.balance.assetsKopecks, 0);
  assert.equal(group.balance.liabilitiesKopecks, 0);
  assert.equal(group.balance.differenceKopecks, 0);
  assert.equal(report({ legalEntityId: 'company' }).pnl.revenueKopecks, 10000);
});
test('closed periods, invalid status, foreign scope, unbalanced journal and duplicate source are rejected', () => {
  const { post, state } = fixture();
  assert.throws(
    () =>
      post({
        kind: 'sale',
        amount: '10',
        counterpartyId: 'x',
        status: 'posted',
      }),
    /INVALID_STATUS/,
  );
  assert.throws(
    () =>
      post({
        kind: 'opening',
        postings: [
          { account: 'cash', cashAccountId: 'bank', amountKopecks: 1 },
          { account: 'equity', amountKopecks: -2 },
        ],
      }),
    /UNBALANCED_OPERATION/,
  );
  const sale = post({
    kind: 'sale',
    amount: '10',
    counterpartyId: 'x',
    source: { system: '1c', id: 'doc', version: '1' },
  });
  assert.throws(
    () =>
      post({
        kind: 'sale',
        amount: '10',
        counterpartyId: 'x',
        source: { system: '1c', id: 'doc', version: '1' },
      }),
    /DUPLICATE_SOURCE/,
  );
  assert.throws(
    () =>
      post({
        kind: 'payment_in',
        amount: '10',
        cashAccountId: 'bank',
        counterpartyId: 'x',
        responsibilityScopeId: 'other',
        allocations: [{ documentId: sale.id, amount: '10' }],
      }),
    /CROSS_SCOPE_SETTLEMENT/,
  );
  state.closures = [
    {
      legalEntityId: 'company',
      responsibilityScopeId: 'scope',
      from: '2026-09-01',
      to: '2026-09-30',
    },
  ];
  assert.throws(
    () => post({ kind: 'cash_in', amount: '1', cashAccountId: 'bank' }),
    /PERIOD_CLOSED/,
  );
});
test('calendar documents and linked plans do not duplicate obligation; undated remains undated', () => {
  const { post, state } = fixture();
  const bill = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'seller',
    dueDate: '2026-09-10',
  });
  state.catalogs.push(
    ledger.validateCatalog('plans', {
      name: 'Первая часть',
      legalEntityId: 'company',
      flow: 'out',
      amount: '60',
      documentId: bill.id,
      expectedDate: '2026-09-12',
    }),
  );
  state.catalogs.push(
    ledger.validateCatalog('plans', {
      name: 'Будущий расход',
      legalEntityId: 'company',
      flow: 'out',
      amount: '30',
    }),
  );
  const calendar = ledger.buildCalendar(state, {
    from: '2026-09-01',
    to: '2026-09-15',
    asOf: '2026-09-01',
  });
  assert.equal(
    calendar.rows
      .filter((r) => r.documentId === bill.id)
      .reduce((a, r) => a + r.amountKopecks, 0),
    10000,
  );
  assert.equal(calendar.undated.length, 1);
  assert.equal(
    calendar.days.find((d) => d.date === '2026-09-12').outflowKopecks,
    6000,
  );
});
test('fuel consumption and later settlement cannot use the same supplier advance twice', () => {
  const { post } = fixture();
  const prepay = post({
    kind: 'supplier_advance',
    amount: '100',
    cashAccountId: 'bank',
    counterpartyId: 'supplier',
  });
  post({
    kind: 'fuel_sale',
    amount: '90',
    cost: '60',
    counterpartyId: 'buyer',
    supplierCounterpartyId: 'supplier',
    purchaseMode: 'advance',
  });
  assert.throws(
    () =>
      post({
        kind: 'reversal',
        originalOperationId: prepay.id,
        reason: 'Нельзя отменять использованный аванс',
      }),
    /DEPENDENT_OPERATIONS/,
  );
  const invoice = post({
    kind: 'expense',
    amount: '50',
    counterpartyId: 'supplier',
  });
  assert.throws(
    () =>
      post({
        kind: 'settlement',
        paymentId: prepay.id,
        allocations: [{ documentId: invoice.id, amount: '50' }],
      }),
    /OVER_SETTLEMENT/,
  );
  post({
    kind: 'settlement',
    paymentId: prepay.id,
    allocations: [{ documentId: invoice.id, amount: '40' }],
  });
});
test('opposite unknown money movements remain unresolved even when net suspense is zero', () => {
  const { post, report } = fixture();
  post({ kind: 'cash_in', amount: '100', cashAccountId: 'bank' });
  post({ kind: 'cash_out', amount: '100', cashAccountId: 'bank' });
  const warning = report().controls.find((c) => c.code === 'UNCLASSIFIED_CASH');
  assert.equal(warning.amountKopecks, 20000);
});
test('every selected entity needs its own opening and independent bank statement', () => {
  const { post, report, state } = fixture();
  post({
    kind: 'opening',
    postings: [
      { account: 'cash', cashAccountId: 'bank', amountKopecks: 10000 },
      { account: 'equity', amountKopecks: -10000 },
    ],
    directionId: '__common__',
  });
  let r = report({ legalEntityIds: ['company', 'other'] });
  assert.equal(
    r.controls.filter((c) => c.code === 'OPENING_BALANCES_UNVERIFIED').length,
    1,
  );
  assert.ok(r.controls.some((c) => c.code === 'CASH_STATEMENT_UNVERIFIED'));
  Object.assign(state.catalogs[0], {
    statementDate: '2026-09-30',
    statementBalanceKopecks: 9999,
  });
  r = report();
  assert.equal(
    r.controls.find((c) => c.code === 'CASH_STATEMENT_DIFFERENCE')
      .amountKopecks,
    1,
  );
  state.catalogs[0].statementBalanceKopecks = 10000;
  assert.ok(
    !report().controls.some((c) => c.code.startsWith('CASH_STATEMENT')),
  );
  assert.equal(ledger.buildReports(state).cf.openingKopecks, 10000);
});
test('authorized multi-project payment projects a balanced read-only ledger for each project', () => {
  const { post, state } = fixture();
  const first = post({
    kind: 'sale',
    amount: '60',
    counterpartyId: 'client',
    responsibilityScopeId: 'scope-a',
    projectId: 'project-a',
    directionId: 'crew',
  });
  const second = post({
    kind: 'sale',
    amount: '40',
    counterpartyId: 'client',
    responsibilityScopeId: 'scope-b',
    projectId: 'project-b',
    directionId: 'delivery',
  });
  const payment = ledger.buildOperation(
    {
      ...BASE,
      kind: 'payment_in',
      amount: '75',
      cashAccountId: 'bank',
      counterpartyId: 'client',
      responsibilityScopeId: 'bank-scope',
      projectId: 'bank-project',
      allocations: [
        { documentId: first.id, amount: '60' },
        { documentId: second.id, amount: '15' },
      ],
    },
    { ...state, allowCrossScopeSettlements: true },
  );
  state.operations.push(payment);
  assert.deepEqual(
    new Set(payment.relatedScopeIds),
    new Set(['scope-a', 'scope-b', 'bank-scope']),
  );
  for (const scopeId of payment.relatedScopeIds) {
    const parts = payment.postings.filter(
      (p) => p.responsibilityScopeId === scopeId,
    );
    assert.equal(
      parts.reduce((s, p) => s + p.amountKopecks, 0),
      0,
    );
    const r = ledger.buildReports(state, {
      responsibilityScopeIds: [scopeId],
      from: '2026-09-01',
      to: '2026-09-30',
    });
    assert.equal(r.balance.differenceKopecks, 0);
    assert.ok(!r.controls.some((c) => c.code === 'CASH_RECONCILIATION'));
    if (scopeId === 'scope-b') {
      assert.equal(r.receivables[0].remainingKopecks, 2500);
      assert.equal(r.cf.inflowKopecks, 1500);
      assert.equal(r.cf.closingKopecks, 0);
    }
  }
  assert.equal(
    ledger.buildReports(state, { from: '2026-09-01', to: '2026-09-30' }).cf
      .inflowKopecks,
    7500,
  );
});
test('allocated debts appear in direction calendar after partial payment with exact share', () => {
  const { post, state } = fixture();
  state.catalogs.push(
    ledger.validateCatalog('allocation_rules', {
      id: 'rule',
      name: 'Офис',
      effectiveFrom: '2026-01-01',
      weights: [
        { directionId: 'crew', percent: '60' },
        { directionId: 'delivery', percent: '40' },
      ],
    }),
  );
  const invoice = post({
    kind: 'expense',
    amount: '200',
    counterpartyId: 'landlord',
    allocationRuleId: 'rule',
    directionId: '__common__',
    dueDate: '2026-09-10',
  });
  post({
    kind: 'payment_out',
    amount: '100',
    counterpartyId: 'landlord',
    cashAccountId: 'bank',
    allocations: [{ documentId: invoice.id, amount: '100' }],
    date: '2026-09-05',
  });
  const calendar = ledger.buildCalendar(state, {
    from: '2026-09-01',
    to: '2026-09-30',
    asOf: '2026-09-06',
    directionId: 'crew',
  });
  assert.equal(calendar.rows[0].amountKopecks, 6000);
  assert.equal(calendar.days[0].date, '2026-09-06');
});
test('installment plans shrink earliest installments after partial payment without duplicate residual', () => {
  const { post, state } = fixture();
  const invoice = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'seller',
    dueDate: '2026-09-30',
  });
  state.catalogs.push(
    ledger.validateCatalog('plans', {
      id: 'p1',
      name: 'Первая часть',
      legalEntityId: 'company',
      flow: 'out',
      amount: '60',
      documentId: invoice.id,
      expectedDate: '2026-09-12',
    }),
  );
  state.catalogs.push(
    ledger.validateCatalog('plans', {
      id: 'p2',
      name: 'Вторая часть',
      legalEntityId: 'company',
      flow: 'out',
      amount: '40',
      documentId: invoice.id,
      expectedDate: '2026-09-20',
    }),
  );
  post({
    kind: 'payment_out',
    amount: '40',
    cashAccountId: 'bank',
    counterpartyId: 'seller',
    allocations: [{ documentId: invoice.id, amount: '40' }],
    date: '2026-09-04',
  });
  const calendar = ledger.buildCalendar(state, {
    from: '2026-09-01',
    to: '2026-09-30',
    asOf: '2026-09-05',
  });
  assert.equal(calendar.rows.find((r) => r.id === 'p1').amountKopecks, 2000);
  assert.equal(calendar.rows.find((r) => r.id === 'p2').amountKopecks, 4000);
  assert.equal(calendar.rows.length, 2);
});
test('intragroup loans and advances disappear from group balances, not separate entities', () => {
  const { post, report, state } = fixture();
  state.catalogs.push({
    id: 'bank-b',
    kind: 'accounts',
    legalEntityId: 'B',
    name: 'B',
    directionId: '__common__',
  });
  post({ kind: 'capital_in', amount: '100', cashAccountId: 'bank' });
  post({
    kind: 'loan_issued',
    amount: '50',
    cashAccountId: 'bank',
    counterpartyId: 'B',
    intercompany: { key: 'loan-1', counterpartyLegalEntityId: 'B' },
  });
  post({
    kind: 'loan_received',
    amount: '50',
    cashAccountId: 'bank-b',
    counterpartyId: 'company',
    legalEntityId: 'B',
    intercompany: { key: 'loan-1', counterpartyLegalEntityId: 'company' },
  });
  post({
    kind: 'supplier_advance',
    amount: '20',
    cashAccountId: 'bank',
    counterpartyId: 'B',
    intercompany: { key: 'advance-1', counterpartyLegalEntityId: 'B' },
  });
  post({
    kind: 'customer_advance',
    amount: '20',
    cashAccountId: 'bank-b',
    counterpartyId: 'company',
    legalEntityId: 'B',
    intercompany: { key: 'advance-1', counterpartyLegalEntityId: 'company' },
  });
  const group = report();
  assert.equal(group.cf.inflowKopecks, 10000);
  assert.equal(group.cf.outflowKopecks, 0);
  assert.equal(group.cf.closingKopecks, 10000);
  assert.equal(group.balance.assetsKopecks, 10000);
  assert.equal(group.balance.liabilitiesKopecks, 0);
  assert.equal(group.balance.differenceKopecks, 0);
  assert.equal(report({ legalEntityId: 'B' }).balance.liabilitiesKopecks, 7000);
});
test('same intercompany key with unrelated reciprocal parties does not trigger elimination', () => {
  const { post, report, state } = fixture();
  state.catalogs.push(
    {
      id: 'bank-b',
      kind: 'accounts',
      legalEntityId: 'B',
      name: 'B',
      directionId: '__common__',
    },
    { id: 'bank-c', kind: 'accounts', legalEntityId: 'C', name: 'C' },
  );
  post({
    kind: 'loan_issued',
    amount: '50',
    cashAccountId: 'bank',
    intercompany: { key: 'shared', counterpartyLegalEntityId: 'B' },
  });
  post({
    kind: 'loan_received',
    amount: '50',
    cashAccountId: 'bank-b',
    legalEntityId: 'B',
    intercompany: { key: 'shared', counterpartyLegalEntityId: 'C' },
  });
  const r = report({ legalEntityIds: ['company', 'B', 'C'] });
  assert.ok(r.controls.some((c) => c.code === 'INTERCOMPANY_UNMATCHED'));
  assert.ok(r.balance.rows.some((r) => r.account === 'loan_receivable'));
});
test('a mixed payment preserves operating and investing components', () => {
  const { post, report } = fixture();
  const asset = post({
    kind: 'asset_purchase',
    amount: '60',
    counterpartyId: 'supplier',
  });
  const service = post({
    kind: 'expense',
    amount: '40',
    counterpartyId: 'supplier',
  });
  post({
    kind: 'payment_out',
    amount: '100',
    cashAccountId: 'bank',
    counterpartyId: 'supplier',
    allocations: [
      { documentId: asset.id, amount: '60' },
      { documentId: service.id, amount: '40' },
    ],
  });
  const cf = report().cf;
  assert.equal(
    cf.rows.find((r) => r.category === 'investing').outflowKopecks,
    6000,
  );
  assert.equal(
    cf.rows.find((r) => r.category === 'operating').outflowKopecks,
    4000,
  );
});
test('partial-scope consolidation never asserts readiness with missing peers', () => {
  const { post, state } = fixture();
  post({
    kind: 'sale',
    amount: '50',
    counterpartyId: 'B',
    intercompany: { key: 'int', counterpartyLegalEntityId: 'B' },
  });
  const r = ledger.buildReports(
    { ...state, fullEntityIds: [] },
    { legalEntityIds: ['company', 'B'], from: '2026-09-01', to: '2026-09-30' },
  );
  assert.equal(r.status, 'provisional');
  assert.ok(
    r.controls.some(
      (c) => c.code === 'CONSOLIDATION_SCOPE_INCOMPLETE' && c.blocking,
    ),
  );
  assert.ok(r.controls.some((c) => c.code === 'INTERCOMPANY_UNMATCHED'));
});
test('a plan created for the remaining debt does not subtract old payments again', () => {
  const { post, state } = fixture();
  const invoice = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'seller',
    dueDate: '2026-09-10',
  });
  post({
    kind: 'payment_out',
    amount: '40',
    cashAccountId: 'bank',
    counterpartyId: 'seller',
    allocations: [{ documentId: invoice.id, amount: '40' }],
  });
  const plan = ledger.validateCatalog(
    'plans',
    {
      id: 'rescheduled',
      name: 'Остаток',
      legalEntityId: 'company',
      flow: 'out',
      amount: '60',
      documentId: invoice.id,
      expectedDate: '2026-09-20',
      settledBaselineKopecks: 999999,
    },
    state,
  );
  assert.equal(plan.settledBaselineKopecks, 4000);
  state.catalogs.push(plan);
  let c = ledger.buildCalendar(state, {
    from: '2026-09-01',
    to: '2026-09-30',
    asOf: '2026-09-01',
  });
  assert.equal(c.rows.length, 1);
  assert.equal(c.rows[0].amountKopecks, 6000);
  assert.equal(c.rows[0].date, '2026-09-20');
  post({
    kind: 'payment_out',
    amount: '10',
    cashAccountId: 'bank',
    counterpartyId: 'seller',
    allocations: [{ documentId: invoice.id, amount: '10' }],
  });
  c = ledger.buildCalendar(state, {
    from: '2026-09-01',
    to: '2026-09-30',
    asOf: '2026-09-01',
  });
  assert.equal(c.rows.length, 1);
  assert.equal(c.rows[0].amountKopecks, 5000);
});
test('document confirmation overrides only its own side of a provisional fuel trade', () => {
  const { post, state } = fixture();
  const fuel = post({
    kind: 'fuel_sale',
    amount: '100',
    cost: '70',
    counterpartyId: 'buyer',
    supplierCounterpartyId: 'supplier',
    status: 'provisional',
  });
  let r = ledger.buildReports(
    { ...state, confirmedDocumentIds: [fuel.id] },
    { from: '2026-09-01', to: '2026-09-30' },
  );
  assert.equal(
    r.controls.find((c) => c.code === 'PROVISIONAL_ACCRUALS').amountKopecks,
    7000,
  );
  assert.equal(r.receivables[0].status, 'confirmed');
  assert.equal(r.payables[0].status, 'provisional');
  r = ledger.buildReports(
    { ...state, confirmedDocumentIds: [fuel.id, `${fuel.id}:cost`] },
    { from: '2026-09-01', to: '2026-09-30' },
  );
  assert.ok(!r.controls.some((c) => c.code === 'PROVISIONAL_ACCRUALS'));
  assert.equal(fuel.status, 'provisional');
});
test('explicit group stock profit correction leaves individual books unchanged and can be reversed', () => {
  const { post, state, report } = fixture();
  state.catalogs.push({
    id: 'bank-b',
    kind: 'accounts',
    legalEntityId: 'B',
    name: 'B',
  });
  const seller = post({
    kind: 'fuel_sale',
    amount: '120',
    cost: '80',
    counterpartyId: 'B',
    supplierCounterpartyId: 'external',
    directionId: 'fuel',
    intercompany: { key: 'internal-stock', counterpartyLegalEntityId: 'B' },
  });
  const buyer = post({
    kind: 'inventory_purchase',
    amount: '120',
    counterpartyId: 'company',
    legalEntityId: 'B',
    responsibilityScopeId: 'b-scope',
    projectId: 'b-project',
    directionId: 'fleet',
    intercompany: {
      key: 'internal-stock',
      counterpartyLegalEntityId: 'company',
    },
  });
  const row = (account, n, entity, direction, extra = {}) => ({
    account,
    amountKopecks: n,
    legalEntityId: entity,
    directionId: direction,
    responsibilityScopeId: entity === 'B' ? 'b-scope' : 'scope',
    projectId: entity === 'B' ? 'b-project' : 'project',
    regionId: 'region',
    ...extra,
  });
  const adjustment = post({
    kind: 'consolidation_adjustment',
    reason: 'Внутригрупповая наценка 40, запас не продан',
    consolidationEntityIds: ['company', 'B'],
    replacesAutomaticEliminationKeys: ['internal-stock'],
    postings: [
      row('revenue', 12000, 'company', 'fuel'),
      row('expense', -8000, 'company', 'fuel'),
      row('inventory', -4000, 'B', 'fleet'),
      row('ar', -12000, 'company', 'fuel', {
        documentId: seller.id,
        counterpartyId: 'B',
      }),
      row('ap', 12000, 'B', 'fleet', {
        documentId: buyer.id,
        counterpartyId: 'company',
      }),
    ],
  });
  const group = report({ legalEntityIds: ['company', 'B'] });
  assert.equal(group.pnl.profitKopecks, 0);
  assert.equal(group.balance.assetsKopecks, 8000);
  assert.equal(group.balance.liabilitiesKopecks, 8000);
  assert.equal(group.balance.differenceKopecks, 0);
  assert.equal(group.cf.netKopecks, 0);
  assert.equal(report({ legalEntityId: 'company' }).pnl.profitKopecks, 4000);
  assert.equal(report({ legalEntityId: 'B' }).balance.assetsKopecks, 12000);
  assert.ok(
    !group.controls.some((c) => c.code === 'INTERCOMPANY_ASSET_PROFIT_REVIEW'),
  );
  post({
    kind: 'reversal',
    originalOperationId: adjustment.id,
    reason: 'Пересмотр подтвержденной корректировки',
  });
  assert.equal(
    report({ legalEntityIds: ['company', 'B'] }).pnl.profitKopecks,
    4000,
  );
  assert.equal(report({ legalEntityId: 'company' }).pnl.profitKopecks, 4000);
});
test('cancelled invoices are not falsely reported as paid', () => {
  const { post, report } = fixture();
  const sale = post({ kind: 'sale', amount: '100', counterpartyId: 'client' });
  post({
    kind: 'reversal',
    originalOperationId: sale.id,
    reason: 'Заявка отменена',
  });
  const debt = report().receivables[0];
  assert.equal(debt.remainingKopecks, 0);
  assert.equal(debt.settledKopecks, 0);
  assert.equal(debt.cancelledKopecks, 10000);
  assert.equal(debt.status, 'cancelled');
});
test('document corrections change accrual and residual without changing identity or fabricating payments', () => {
  const { post, report } = fixture();
  const sale = post({
    kind: 'sale',
    amount: '100',
    counterpartyId: 'client',
    dueDate: '2026-09-10',
    description: 'Исходный акт',
  });
  post({
    kind: 'payment_in',
    amount: '40',
    counterpartyId: 'client',
    cashAccountId: 'bank',
    allocations: [{ documentId: sale.id, amount: '40' }],
  });
  const correction = {
    kind: 'adjustment',
    date: '2026-09-02',
    reason: 'Уточнение стоимости',
    postings: [
      {
        account: 'ar',
        amountKopecks: 2000,
        documentId: sale.id,
        counterpartyId: 'client',
      },
      { account: 'revenue', amountKopecks: -2000 },
    ],
  };
  for (const change of [
    { counterpartyId: 'other' },
    { account: 'ap' },
    { legalEntityId: 'other-company' },
  ]) {
    assert.throws(
      () =>
        post({
          ...correction,
          postings: [
            { ...correction.postings[0], ...change },
            correction.postings[1],
          ],
        }),
      /PARTY_MISMATCH|SIDE_MISMATCH|CROSS_ENTITY_POSTING/,
    );
  }
  assert.throws(
    () => post({ ...correction, legalEntityId: 'other-company' }),
    /DOCUMENT_NOT_FOUND/,
  );
  const adjustment = post(correction);
  let debt = report().receivables[0];
  assert.equal(debt.amountKopecks, 12000);
  assert.equal(debt.remainingKopecks, 8000);
  assert.equal(debt.settledKopecks, 4000);
  assert.equal(debt.operationId, sale.id);
  assert.equal(debt.date, sale.date);
  assert.equal(debt.description, 'Исходный акт');
  assert.equal(debt.dueDate, '2026-09-10');
  post({
    kind: 'reversal',
    originalOperationId: adjustment.id,
    date: '2026-09-03',
    reason: 'Отмена уточнения',
  });
  debt = report().receivables[0];
  assert.equal(debt.amountKopecks, 10000);
  assert.equal(debt.remainingKopecks, 6000);
  assert.equal(debt.settledKopecks, 4000);
  assert.equal(report().balance.differenceKopecks, 0);
});
test('missing business direction stays unresolved while explicit common overhead remains valid', () => {
  const { post, state, report } = fixture();
  const sale = post({
    kind: 'sale',
    amount: '100',
    counterpartyId: 'client',
    directionId: undefined,
  });
  const expense = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'supplier',
    directionId: undefined,
  });
  const common = post({
    kind: 'expense',
    amount: '20',
    counterpartyId: 'landlord',
    directionId: ledger.COMMON,
  });
  const capital = post({
    kind: 'capital_in',
    amount: '50',
    cashAccountId: 'bank',
    directionId: undefined,
  });
  state.confirmedDocumentIds = [sale.id, expense.id, common.id];
  assert.equal(sale.directionId, ledger.UNASSIGNED);
  assert.equal(expense.directionId, ledger.UNASSIGNED);
  assert.equal(common.directionId, ledger.COMMON);
  assert.equal(capital.directionId, ledger.COMMON);
  const control = report().controls.find(
    (c) => c.code === 'UNASSIGNED_DIRECTION',
  );
  assert.equal(control.blocking, true);
  assert.equal(control.grossAmountKopecks, 20000);
  assert.equal(control.amountKopecks, 20000);
  assert.equal(control.netAmountKopecks, 0);
  assert.equal(control.postingCount, 2);
  assert.ok(
    !report({ directionId: ledger.COMMON }).controls.some(
      (c) => c.code === 'UNASSIGNED_DIRECTION',
    ),
  );
  post({
    kind: 'reversal',
    originalOperationId: sale.id,
    reason: 'Исправление направления',
  });
  post({
    kind: 'reversal',
    originalOperationId: expense.id,
    reason: 'Исправление направления',
  });
  assert.ok(!report().controls.some((c) => c.code === 'UNASSIGNED_DIRECTION'));
});
