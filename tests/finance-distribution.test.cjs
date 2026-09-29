const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../recovered/apps/api/src/modules/finance/domain/finance-ledger');
const BASE = {
  legalEntityId: 'company',
  regionId: 'region',
  projectId: 'project',
  responsibilityScopeId: 'scope',
  directionId: ledger.COMMON,
  date: '2026-09-10',
};
const split = [
  { directionId: 'delivery', percent: 60 },
  { directionId: 'fleet', percent: 40 },
];
function fixture() {
  const state = {
    operations: [],
    catalogs: [
      {
        kind: 'accounts',
        id: 'bank',
        legalEntityId: 'company',
        directionId: ledger.COMMON,
      },
    ],
  };
  const post = (input) => {
    const op = ledger.buildOperation({ ...BASE, ...input }, state);
    state.operations.push(op);
    return op;
  };
  const report = (directionId) =>
    ledger.buildReports(state, {
      from: '2026-09-01',
      to: '2026-09-30',
      directionId,
    });
  return { state, post, report };
}
const cash = (op) =>
  op.postings
    .filter((p) => p.account === 'cash')
    .reduce((n, p) => n + p.amountKopecks, 0);
test('one-off common expense distribution keeps VAT, payable and exact company total separate', () => {
  const { post, report } = fixture();
  const op = post({
    kind: 'expense',
    amount: '100.01',
    vat: '20',
    counterpartyId: 'office',
    allocationWeights: split,
  });
  assert.deepEqual(op.allocationWeights, [
    { directionId: 'delivery', basisPoints: 6000 },
    { directionId: 'fleet', basisPoints: 4000 },
  ]);
  assert.equal(op.allocationMethod, 'manual');
  assert.equal(op.allocationRule, undefined);
  assert.equal(report().pnl.expenseKopecks, 8001);
  assert.equal(report().payables[0].remainingKopecks, 10001);
  assert.equal(report().cf.netKopecks, 0);
  assert.equal(report('delivery').pnl.expenseKopecks, 4801);
  assert.equal(report('fleet').pnl.expenseKopecks, 3200);
  assert.equal(report('delivery').payables[0].remainingKopecks, 6001);
  for (const direction of [undefined, 'delivery', 'fleet', ledger.COMMON])
    assert.equal(report(direction).balance.differenceKopecks, 0);
});
test('an imported outgoing bank fact can be split without creating an expense or changing physical cash', () => {
  const { post, report } = fixture();
  const op = post({
    kind: 'cash_out',
    amount: '100.01',
    cashAccountId: 'bank',
    allocationWeights: split,
    source: { system: 'bank', id: 'row1', version: '1' },
  });
  assert.equal(cash(op), -10001);
  assert.equal(op.postings.filter((p) => p.account === 'cash').length, 1);
  assert.equal(
    op.postings.find((p) => p.account === 'cash').directionId,
    ledger.COMMON,
  );
  assert.equal(report().pnl.expenseKopecks, 0);
  assert.equal(report('delivery').cf.outflowKopecks, 6001);
  assert.equal(report('fleet').cf.outflowKopecks, 4000);
  assert.ok(report().controls.some((row) => row.code === 'UNCLASSIFIED_CASH'));
  post({
    kind: 'reversal',
    originalOperationId: op.id,
    reason: 'Уточнение процентов',
  });
  const updated = post({
    kind: 'cash_out',
    amount: '100.01',
    cashAccountId: 'bank',
    allocationWeights: [
      { directionId: 'delivery', percent: 20 },
      { directionId: 'fleet', percent: 80 },
    ],
  });
  assert.equal(cash(updated), cash(op));
  assert.equal(report().cf.outflowKopecks, 10001);
  assert.equal(report('delivery').cf.outflowKopecks, 2000);
  assert.equal(report('fleet').cf.outflowKopecks, 8001);
  assert.equal(report().balance.differenceKopecks, 0);
});
test('later settlement consumes a distributed supplier advance from its actual direction positions', () => {
  const { state, post, report } = fixture();
  const payment = post({
    kind: 'payment_out',
    amount: '100.03',
    cashAccountId: 'bank',
    counterpartyId: 'office',
    allocationWeights: split,
  });
  const invoice = post({
    kind: 'expense',
    amount: '100.03',
    counterpartyId: 'office',
    allocationWeights: split,
  });
  const first = post({
    kind: 'settlement',
    paymentId: payment.id,
    allocations: [{ documentId: invoice.id, amount: '40.01' }],
  });
  assert.equal(
    first.postings.find(
      (p) =>
        p.account === 'supplier_advance' && p.directionId === ledger.COMMON,
    ),
    undefined,
  );
  for (const dir of ['delivery', 'fleet']) {
    const remaining = state.operations
      .flatMap((op) => op.postings)
      .filter((p) => p.account === 'supplier_advance' && p.directionId === dir)
      .reduce((n, p) => n + p.amountKopecks, 0);
    assert.ok(remaining >= 0);
  }
  post({
    kind: 'settlement',
    paymentId: payment.id,
    allocations: [{ documentId: invoice.id, amount: '60.02' }],
  });
  assert.equal(report().payables[0].remainingKopecks, 0);
  assert.equal(
    report().balance.rows.find((p) => p.account === 'supplier_advance'),
    undefined,
  );
  assert.equal(report().cf.outflowKopecks, 10003);
  for (const direction of [undefined, 'delivery', 'fleet', ledger.COMMON])
    assert.equal(report(direction).balance.differenceKopecks, 0);
  assert.throws(
    () =>
      post({
        kind: 'reversal',
        originalOperationId: payment.id,
        reason: 'Нельзя отменять использованный аванс',
      }),
    /DEPENDENT_OPERATIONS/,
  );
});
test('post-payment redistribution can reverse and replay dependencies while preserving every cash fact', () => {
  const { post, report } = fixture();
  const invoice = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'office',
    dueDate: '2026-09-20',
  });
  const payment = post({
    kind: 'payment_out',
    amount: '40',
    cashAccountId: 'bank',
    counterpartyId: 'office',
    allocations: [{ documentId: invoice.id, amount: '40' }],
  });
  assert.throws(
    () =>
      post({
        kind: 'reversal',
        originalOperationId: invoice.id,
        reason: 'Доли',
      }),
    /DEPENDENT_OPERATIONS/,
  );
  post({
    kind: 'reversal',
    originalOperationId: payment.id,
    reason: 'Перераспределение начисления',
  });
  post({
    kind: 'reversal',
    originalOperationId: invoice.id,
    reason: 'Перераспределение начисления',
  });
  const distributed = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'office',
    dueDate: invoice.dueDate,
    allocationWeights: split,
  });
  const replay = post({
    kind: 'payment_out',
    amount: '40',
    cashAccountId: 'bank',
    counterpartyId: 'office',
    allocations: [
      {
        documentId: distributed.id,
        amount: '40',
        portions: [{ directionId: ledger.COMMON, amountKopecks: 4000 }],
      },
    ],
  });
  assert.equal(cash(replay), cash(payment));
  assert.equal(replay.date, payment.date);
  assert.equal(report().cf.outflowKopecks, 4000);
  assert.equal(report().pnl.expenseKopecks, 10000);
  assert.equal(report('delivery').cf.outflowKopecks, 2400);
  assert.equal(report('fleet').cf.outflowKopecks, 1600);
  assert.equal(
    report('delivery').payables.find((d) => d.id === distributed.id)
      .remainingKopecks,
    3600,
  );
  assert.equal(
    report('fleet').payables.find((d) => d.id === distributed.id)
      .remainingKopecks,
    2400,
  );
  assert.equal(report().balance.differenceKopecks, 0);
});
test('linked outgoing payments inherit document directions and reject an independent contradictory split', () => {
  const { post } = fixture();
  const invoice = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'office',
    allocationWeights: split,
  });
  assert.throws(
    () =>
      post({
        kind: 'payment_out',
        amount: '40',
        cashAccountId: 'bank',
        counterpartyId: 'office',
        allocations: [{ documentId: invoice.id, amount: '40' }],
        allocationWeights: split,
      }),
    /ALLOCATION_LINKED_DOCUMENTS/,
  );
  for (const allocationWeights of [
    [],
    [{ directionId: 'delivery', percent: 99 }],
    [
      { directionId: 'delivery', percent: 50 },
      { directionId: 'delivery', percent: 50 },
    ],
    [
      { directionId: 'delivery', percent: -1 },
      { directionId: 'fleet', percent: 101 },
    ],
  ])
    assert.throws(
      () =>
        post({
          kind: 'expense',
          amount: '100',
          counterpartyId: 'office',
          allocationWeights,
        }),
      /ALLOCATION|DUPLICATE_DIRECTION/,
    );
});
test('partial penny payments never over-settle the final allocated direction', () => {
  const { post, report } = fixture();
  const invoice = post({
    kind: 'expense',
    amount: '0.03',
    counterpartyId: 'office',
    allocationWeights: [
      { directionId: 'a', basisPoints: 3334 },
      { directionId: 'b', basisPoints: 3333 },
      { directionId: 'c', basisPoints: 3333 },
    ],
  });
  const payment = post({
    kind: 'payment_out',
    amount: '0.02',
    counterpartyId: 'office',
    cashAccountId: 'bank',
    allocations: [{ documentId: invoice.id, amount: '0.02' }],
  });
  assert.equal(
    payment.allocations[0].portions.reduce((n, p) => n + p.amountKopecks, 0),
    2,
  );
  for (const direction of ['a', 'b', 'c'])
    assert.ok(report(direction).payables[0].remainingKopecks >= 0);
  assert.equal(report().payables[0].remainingKopecks, 1);
});
test('named rules remain compatible, switching or clearing removes stale metadata, and article destinations stay enforced', () => {
  const { state, post } = fixture();
  state.catalogs.push({
    kind: 'allocation_rules',
    id: 'office-split',
    name: 'Офис',
    effectiveFrom: '2026-01-01',
    version: 3,
    weights: split,
  });
  const old = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'office',
    allocationRuleId: 'office-split',
  });
  assert.equal(old.allocationMethod, 'rule');
  assert.equal(old.allocationWeights, undefined);
  assert.equal(old.allocationRule.version, 3);
  assert.throws(
    () =>
      post({
        kind: 'expense',
        amount: '100',
        counterpartyId: 'office',
        allocationRuleId: 'office-split',
        allocationWeights: split,
      }),
    /ALLOCATION_CONFLICT/,
  );
  const cleared = post({
    ...old,
    id: undefined,
    allocationRuleId: null,
    allocationWeights: null,
  });
  assert.equal(cleared.allocationRule, undefined);
  assert.equal(cleared.allocationMethod, undefined);
  assert.ok(cleared.postings.every((p) => p.directionId === ledger.COMMON));
  state.catalogs.push({
    kind: 'articles',
    id: 'direct-only',
    name: 'Прямой расход',
    category: 'expense',
    legalEntityId: 'company',
    responsibilityScopeIds: ['scope'],
    directionIds: ['delivery'],
  });
  assert.throws(
    () =>
      post({
        kind: 'expense',
        amount: '0.01',
        counterpartyId: 'office',
        articleId: 'direct-only',
        allocationWeights: split,
      }),
    /ARTICLE_DIRECTION/,
  );
});
