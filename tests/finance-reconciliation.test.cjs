const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  buildOperation,
} = require('../recovered/apps/api/src/modules/finance/domain/finance-ledger');
const {
  validateReconciliation,
  assessReconciliation,
} = require('../recovered/apps/api/src/modules/finance/domain/finance-reconciliation');
const base = {
  legalEntityId: 'entity',
  responsibilityScopeId: 'scope',
  date: '2026-09-10',
  counterpartyId: 'party',
};
function fixture() {
  const state = {
    operations: [],
    catalogs: [{ kind: 'accounts', id: 'bank', legalEntityId: 'entity' }],
  };
  const post = (p) => {
    const o = buildOperation({ ...base, ...p }, state);
    state.operations.push(o);
    return o;
  };
  const sale = post({ kind: 'sale', amountKopecks: 10000 }),
    cost = post({ kind: 'expense', amountKopecks: 7000 });
  return {
    state,
    post,
    sale,
    cost,
    body: {
      legalEntityId: 'entity',
      side: 'receivable',
      counterpartyId: 'party',
      from: '2026-09-01',
      to: '2026-09-30',
      documentIds: [sale.id],
      externalAmountKopecks: 10000,
      status: 'confirmed',
      sourceReference: 'Согласованный реестр 42',
    },
  };
}
test('registry compares gross documents; subsequent partial payment does not invalidate confirmation', () => {
  const f = fixture(),
    r = validateReconciliation(f.body, f.state);
  f.post({
    kind: 'payment_in',
    amountKopecks: 4000,
    cashAccountId: 'bank',
    allocations: [{ documentId: f.sale.id, amountKopecks: 4000 }],
  });
  assert.equal(r.ourAmountKopecks, 10000);
  assert.equal(assessReconciliation(r, f.state).stale, false);
  assert.equal(validateReconciliation(f.body, f.state).differenceKopecks, 0);
});
test('registry validates owner, party, side, duplicates and external total before confirmation', () => {
  const f = fixture();
  for (const patch of [
    { legalEntityId: 'other' },
    { counterpartyId: 'other' },
    { documentIds: [f.cost.id] },
    { documentIds: [f.sale.id, f.sale.id] },
    { externalAmountKopecks: 9999 },
    { sourceReference: '' },
  ])
    assert.throws(
      () => validateReconciliation({ ...f.body, ...patch }, f.state),
      /./,
    );
  assert.equal(
    validateReconciliation(
      { ...f.body, status: 'disputed', externalAmountKopecks: 9999 },
      f.state,
    ).differenceKopecks,
    1,
  );
});
test('registry preserves disputed selection and original evidence; correction returns it to review', () => {
  const f = fixture(),
    other = f.post({ kind: 'sale', amountKopecks: 1000 });
  const r = validateReconciliation(
    {
      ...f.body,
      documentIds: [f.sale.id, other.id],
      disputedDocumentIds: [other.id],
      externalAmountKopecks: 11000,
    },
    f.state,
  );
  assert.equal(r.status, 'partially_confirmed');
  assert.equal(r.confirmedAmountKopecks, 10000);
  f.post({
    kind: 'reversal',
    originalOperationId: other.id,
    reason: 'Исправлен акт',
  });
  const checked = assessReconciliation(r, f.state);
  assert.equal(checked.currentStatus, 'needs_review');
  assert.deepEqual(checked.staleDocumentIds, [other.id]);
  assert.equal(r.status, 'partially_confirmed');
});
test('a later noncash adjustment of the reconciled document invalidates confirmation', () => {
  const f = fixture(),
    registry = validateReconciliation(f.body, f.state);
  f.post({
    kind: 'adjustment',
    reason: 'Уточнение стоимости акта',
    postings: [
      {
        account: 'ar',
        documentId: f.sale.id,
        counterpartyId: 'party',
        amountKopecks: 2000,
      },
      { account: 'revenue', amountKopecks: -2000 },
    ],
  });
  assert.equal(
    assessReconciliation(registry, f.state).currentStatus,
    'needs_review',
  );
});
