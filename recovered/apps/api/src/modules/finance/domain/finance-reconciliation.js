'use strict';
const { createHash } = require('node:crypto');
const { buildReports } = require('./finance-ledger');
const fail = (message) => {
  const e = new Error(message);
  e.code = 'FINANCE_RECONCILIATION_INVALID';
  e.status = 400;
  throw e;
};
const day = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const sum = (values) => {
  const n = values.reduce((s, v) => {
    if (!Number.isSafeInteger(v)) fail('Некорректная сумма сверки.');
    return s + BigInt(v);
  }, 0n);
  if (
    n > BigInt(Number.MAX_SAFE_INTEGER) ||
    n < BigInt(-Number.MAX_SAFE_INTEGER)
  )
    fail('Сумма сверки слишком велика.');
  return Number(n);
};
const hash = (op) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        id: op.id,
        kind: op.kind,
        date: op.date,
        source: op.source,
        status: op.status,
        postings: op.postings,
      }),
    )
    .digest('hex');
// Journal records are immutable. The request-local array only grows when a new
// operation is posted, so its identity and length safely invalidate this index.
// This avoids scanning the entire journal for every document in every registry.
const contexts = new WeakMap();
function reconciliationContext(state) {
  const operations = state.operations || [];
  const cached = contexts.get(operations);
  if (cached?.length === operations.length) return cached;
  const byId = new Map(operations.map((op) => [op.id, op]));
  const reversed = new Set(
    operations
      .map((op) => op.reversesId || op.originalOperationId)
      .filter(Boolean),
  );
  const operationHashes = new Map(),
    economicEntries = new Map();
  const operationHash = (op) => {
    if (!operationHashes.has(op.id)) operationHashes.set(op.id, hash(op));
    return operationHashes.get(op.id);
  };
  for (const op of operations) {
    if (
      op.consolidationOnly ||
      reversed.has(op.id) ||
      !['adjustment', 'opening'].includes(op.kind)
    )
      continue;
    const ids = new Set(
      (op.postings || [])
        .filter((p) => ['ar', 'ap'].includes(p.account) && p.documentId)
        .map((p) => `${op.legalEntityId}:${p.documentId}`),
    );
    for (const id of ids) {
      const values = economicEntries.get(id) || [];
      values.push(operationHash(op));
      economicEntries.set(id, values);
    }
  }
  const economicHashes = new Map(
    [...economicEntries].map(([id, values]) => [
      id,
      createHash('sha256').update(JSON.stringify(values.sort())).digest('hex'),
    ]),
  );
  const result = {
    length: operations.length,
    byId,
    reversed,
    operationHash,
    economicHashes,
  };
  contexts.set(operations, result);
  return result;
}
function documentsOf(state, to) {
  const reports =
    state.reports || buildReports(state, { from: '1900-01-01', to });
  return [...(reports.receivables || []), ...(reports.payables || [])];
}
function validateReconciliation(body, state = {}) {
  if (!body || !['receivable', 'payable'].includes(body.side))
    fail('Выберите сверку с клиентом или поставщиком.');
  if (!day(body.from) || !day(body.to) || body.from > body.to)
    fail('Укажите корректный период сверки.');
  if (!body.legalEntityId || !body.counterpartyId)
    fail('Укажите свое юридическое лицо и контрагента.');
  if (
    !Array.isArray(body.documentIds) ||
    !body.documentIds.length ||
    body.documentIds.length > 1000 ||
    new Set(body.documentIds).size !== body.documentIds.length
  )
    fail('Выберите от 1 до 1000 разных документов.');
  if (
    !Number.isSafeInteger(body.externalAmountKopecks) ||
    body.externalAmountKopecks < 0
  )
    fail('Укажите сумму реестра контрагента в копейках.');
  if (!['draft', 'confirmed', 'disputed'].includes(body.status || 'draft'))
    fail('Неизвестный статус сверки.');
  const sourceReference = String(body.sourceReference || '').trim();
  if (sourceReference.length > 2000) fail('Основание сверки слишком длинное.');
  if (body.status === 'confirmed' && !sourceReference)
    fail('Укажите основание подтверждения: реестр, акт или согласование.');
  const disputedIds = new Set(body.disputedDocumentIds || []);
  if ([...disputedIds].some((id) => !body.documentIds.includes(id)))
    fail('Спорный документ должен входить в состав сверки.');
  const available = new Map(
    documentsOf(state, body.to).map((doc) => [
      `${doc.legalEntityId}:${doc.side}:${doc.documentId}`,
      doc,
    ]),
  );
  const context = reconciliationContext(state);
  const documents = body.documentIds.map((id) => {
    const doc = available.get(`${body.legalEntityId}:${body.side}:${id}`),
      op = doc && context.byId.get(doc.operationId);
    if (
      !doc ||
      !op ||
      op.projected ||
      doc.legalEntityId !== body.legalEntityId ||
      doc.counterpartyId !== body.counterpartyId ||
      doc.side !== body.side ||
      doc.date < body.from ||
      doc.date > body.to ||
      context.reversed.has(op.id) ||
      doc.amountKopecks <= 0
    )
      fail(
        'Выбранный документ не соответствует контрагенту, периоду или стороне сверки.',
      );
    return {
      documentId: id,
      operationId: op.id,
      sourceHash: context.operationHash(op),
      linkedEconomicHash:
        context.economicHashes.get(`${body.legalEntityId}:${id}`) || '',
      amountKopecks: doc.amountKopecks,
      responsibilityScopeId: doc.responsibilityScopeId,
      disputed: disputedIds.has(id),
    };
  });
  const ourAmountKopecks = sum(documents.map((d) => d.amountKopecks)),
    differenceKopecks = sum([ourAmountKopecks, -body.externalAmountKopecks]);
  if (body.status === 'confirmed' && differenceKopecks !== 0)
    fail(
      'Суммы различаются. Сохраните сверку как спорную и разберите расхождение.',
    );
  const status =
    body.status === 'confirmed' && disputedIds.size
      ? 'partially_confirmed'
      : body.status || 'draft';
  return {
    name: String(body.name || `Сверка ${body.from} — ${body.to}`).slice(0, 200),
    legalEntityId: body.legalEntityId,
    counterpartyId: body.counterpartyId,
    side: body.side,
    from: body.from,
    to: body.to,
    documentIds: [...body.documentIds],
    documents,
    ourAmountKopecks,
    externalAmountKopecks: body.externalAmountKopecks,
    differenceKopecks,
    confirmedAmountKopecks: ['confirmed', 'partially_confirmed'].includes(
      status,
    )
      ? sum(documents.filter((d) => !d.disputed).map((d) => d.amountKopecks))
      : 0,
    status,
    sourceReference,
  };
}
function assessReconciliation(row, state = {}) {
  const context = reconciliationContext(state);
  const staleDocumentIds = (row.documents || [])
    .filter((doc) => {
      const op = context.byId.get(doc.operationId);
      return (
        !op ||
        op.projected ||
        context.operationHash(op) !== doc.sourceHash ||
        (context.economicHashes.get(`${row.legalEntityId}:${doc.documentId}`) ||
          '') !== (doc.linkedEconomicHash || '') ||
        context.reversed.has(op.id)
      );
    })
    .map((doc) => doc.documentId);
  return {
    ...row,
    stale: staleDocumentIds.length > 0,
    staleDocumentIds,
    currentStatus: staleDocumentIds.length ? 'needs_review' : row.status,
  };
}
module.exports = { validateReconciliation, assessReconciliation };
