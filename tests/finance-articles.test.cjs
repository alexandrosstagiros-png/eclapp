const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../recovered/apps/api/src/modules/finance/domain/finance-ledger');
const articles = require('../recovered/apps/api/src/modules/finance/domain/finance-articles');
const classification = require('../recovered/apps/api/src/modules/finance/domain/finance-classification');
const automation = require('../recovered/apps/api/src/modules/finance/domain/finance-automation');
const BASE = {
  legalEntityId: 'company',
  regionId: 'region',
  projectId: 'project',
  responsibilityScopeId: 'scope',
  directionId: 'delivery',
  date: '2026-09-01',
};
function article(id = 'rent', extra = {}) {
  return {
    kind: 'articles',
    id,
    name: 'Аренда офиса',
    category: 'expense',
    legalEntityId: 'company',
    responsibilityScopeIds: ['scope'],
    directionIds: [],
    ...extra,
  };
}
function fixture(catalogs = [article()]) {
  const state = {
    operations: [],
    catalogs: [
      ...catalogs,
      {
        kind: 'accounts',
        id: 'bank',
        legalEntityId: 'company',
        directionId: ledger.COMMON,
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
    report: () =>
      ledger.buildReports(state, { from: '2026-09-01', to: '2026-09-30' }),
  };
}
test('article catalog validates real fields without adding a hierarchy or deriving accounting behavior', () => {
  for (const malformed of [
    { archived: 'false' },
    { active: 'false' },
    { archived: 0 },
  ])
    assert.throws(
      () => articles.validateArticle(article('a', malformed)),
      /ARTICLE_INVALID/,
    );
  const item = ledger.validateCatalog(
    'articles',
    article('a', {
      name: ' Аренда   офиса ',
      code: ' ар-01 ',
      group: 'Общие расходы',
      directionIds: ['delivery', 'delivery', ledger.COMMON],
    }),
  );
  assert.equal(item.name, 'Аренда офиса');
  assert.equal(item.code, 'АР-01');
  assert.deepEqual(item.directionIds, ['delivery', ledger.COMMON]);
  assert.equal(
    articles.normalizeArticleName(' УЧЁТ   ТОПЛИВА '),
    'учет топлива',
  );
  assert.throws(
    () =>
      ledger.validateCatalog('articles', article('a', { category: 'asset' })),
    /ARTICLE_CATEGORY/,
  );
  assert.throws(
    () =>
      ledger.validateCatalog(
        'articles',
        article('a', { directionIds: [ledger.UNASSIGNED] }),
      ),
    /ARTICLE_DIRECTIONS/,
  );
});
test('exact legacy names resolve; unknown and ambiguous names remain visible without mutating catalogs', () => {
  const state = { catalogs: [article('a', { name: 'Учёт топлива' })] };
  const before = JSON.stringify(state);
  assert.deepEqual(
    articles.resolveArticle({ ...BASE, article: ' УЧЕТ  ТОПЛИВА ' }, state),
    { articleId: 'a', article: 'Учёт топлива' },
  );
  const unknown = articles.resolveArticle(
    { ...BASE, article: 'Из старой таблицы' },
    state,
  );
  assert.equal(unknown.articleId, null);
  assert.equal(unknown.articleWarning.code, 'LEGACY_ARTICLE');
  assert.equal(JSON.stringify(state), before);
  state.catalogs.push(article('b', { name: 'Учёт топлива' }));
  assert.equal(
    articles.resolveArticle({ ...BASE, article: 'Учёт топлива' }, state)
      .articleId,
    null,
  );
  assert.throws(
    () => articles.resolveArticle({ ...BASE, articleId: 'missing' }, state),
    /ARTICLE_UNAVAILABLE/,
  );
});
test('text and ID cannot bypass archive, direction or scope applicability', () => {
  for (const selection of [{ articleId: 'a' }, { article: 'Аренда офиса' }]) {
    assert.throws(
      () =>
        articles.resolveArticle(
          { ...BASE, ...selection },
          { catalogs: [article('a', { archived: true })] },
        ),
      /ARTICLE_ARCHIVED/,
    );
    assert.throws(
      () =>
        articles.resolveArticle(
          { ...BASE, ...selection },
          { catalogs: [article('a', { directionIds: ['fuel'] })] },
        ),
      /ARTICLE_DIRECTION/,
    );
  }
  assert.throws(
    () =>
      articles.resolveArticle(
        { ...BASE, articleId: 'a' },
        {
          catalogs: [article('a', { responsibilityScopeIds: ['foreign'] })],
        },
      ),
    /ARTICLE_UNAVAILABLE/,
  );
  assert.throws(
    () =>
      articles.resolveArticle(
        {
          ...BASE,
          articleId: 'a',
          responsibilityScopeIds: ['scope', 'foreign'],
        },
        { catalogs: [article('a')] },
      ),
    /ARTICLE_UNAVAILABLE/,
  );
});
test('renamed articles preserve document snapshots and aggregate by ID with current report labels', () => {
  const { state, post, report } = fixture();
  const first = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'landlord',
    articleId: 'rent',
  });
  state.catalogs[0].name = 'Аренда помещений';
  const second = post({
    kind: 'expense',
    amount: '50',
    counterpartyId: 'landlord',
    articleId: 'rent',
  });
  assert.equal(first.article, 'Аренда офиса');
  assert.equal(
    first.postings.find((p) => p.account === 'expense').article,
    'Аренда офиса',
  );
  assert.equal(second.article, 'Аренда помещений');
  const row = report().pnl.rows.find((r) => r.articleId === 'rent');
  assert.equal(row.amountKopecks, 15000);
  assert.equal(row.article, 'Аренда помещений');
  assert.deepEqual(row.articleNames, ['Аренда офиса', 'Аренда помещений']);
  state.catalogs.push(article('different', { name: 'Аренда помещений' }));
  post({
    kind: 'expense',
    amount: '30',
    counterpartyId: 'landlord',
    articleId: 'different',
  });
  assert.equal(report().pnl.rows.length, 2);
  const legacy = post({
    kind: 'expense',
    amount: '5',
    counterpartyId: 'landlord',
    article: 'Несопоставленный расход',
  });
  assert.equal(legacy.articleId, null);
  assert.equal(
    report().controls.filter((c) => c.code === 'LEGACY_ARTICLE').length,
    1,
  );
});
test('allocation validates every destination including rounded-zero shares and can inherit its article', () => {
  const rule = {
    kind: 'allocation_rules',
    id: 'split',
    name: 'Общий офис',
    effectiveFrom: '2026-01-01',
    articleId: 'rent',
    weights: [
      { directionId: 'delivery', basisPoints: 5000 },
      { directionId: 'fleet', basisPoints: 5000 },
    ],
  };
  const { post, state } = fixture([
    article('rent', { directionIds: ['delivery'] }),
    rule,
  ]);
  assert.throws(
    () =>
      post({
        kind: 'expense',
        amount: '0.01',
        counterpartyId: 'landlord',
        allocationRuleId: 'split',
        directionId: ledger.COMMON,
      }),
    /ARTICLE_DIRECTION/,
  );
  state.catalogs[0].directionIds.push('fleet');
  const operation = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'landlord',
    allocationRuleId: 'split',
    directionId: ledger.COMMON,
  });
  assert.equal(operation.articleId, 'rent');
  assert.ok(operation.postings.every((p) => p.articleId === 'rent'));
});
test('payment validates the settled economic direction, not central bank direction; CF groups by ID', () => {
  const { post, state, report } = fixture([
    article('rent', { directionIds: ['delivery'] }),
  ]);
  const invoice = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'landlord',
    articleId: 'rent',
  });
  const pay = () =>
    post({
      kind: 'payment_out',
      amount: '20',
      counterpartyId: 'landlord',
      cashAccountId: 'bank',
      directionId: ledger.COMMON,
      articleId: 'rent',
      allocations: [{ documentId: invoice.id, amount: '20' }],
    });
  const payment = pay();
  assert.equal(payment.cashFlows[0].directionId, 'delivery');
  assert.equal(
    payment.postings.find((p) => p.account === 'cash').directionId,
    ledger.COMMON,
  );
  state.catalogs[0].name = 'Аренда помещений';
  pay();
  const row = report().cf.rows.find((r) => r.articleId === 'rent');
  assert.equal(row.outflowKopecks, 4000);
  assert.equal(row.article, 'Аренда помещений');
  assert.deepEqual(row.articleNames, ['Аренда офиса', 'Аренда помещений']);
});
test('archived article history reverses and trusted unchanged correction preserves name but not forbidden direction', () => {
  const { post, state } = fixture([
    article('rent', { directionIds: ['delivery'] }),
  ]);
  const original = post({
    kind: 'expense',
    amount: '100',
    counterpartyId: 'landlord',
    articleId: 'rent',
  });
  state.catalogs[0].name = 'Переименована';
  state.catalogs[0].archived = true;
  assert.throws(
    () =>
      post({
        kind: 'expense',
        amount: '100',
        counterpartyId: 'landlord',
        articleId: 'rent',
      }),
    /ARTICLE_ARCHIVED/,
  );
  const reversal = post({
    kind: 'reversal',
    originalOperationId: original.id,
    reason: 'Исправление описания',
  });
  assert.equal(reversal.article, 'Аренда офиса');
  const input = {
    ...BASE,
    kind: 'expense',
    amount: '100',
    counterpartyId: 'landlord',
    articleId: 'rent',
    article: 'Аренда офиса',
  };
  const trusted = {
    ...state,
    preserveArticleSnapshot: {
      articleId: original.articleId,
      article: original.article,
    },
  };
  assert.equal(ledger.buildOperation(input, trusted).article, 'Аренда офиса');
  assert.throws(
    () => ledger.buildOperation({ ...input, directionId: 'fleet' }, trusted),
    /ARTICLE_DIRECTION/,
  );
});
test('fuel category organizes the catalog without changing revenue and purchase postings', () => {
  const { post } = fixture([
    article('fuel', { category: 'income', directionIds: ['fuel'] }),
  ]);
  const operation = post({
    kind: 'fuel_sale',
    amount: '100',
    cost: '70',
    counterpartyId: 'carrier',
    supplierCounterpartyId: 'oil',
    directionId: 'fuel',
    articleId: 'fuel',
  });
  assert.equal(
    operation.postings.find((p) => p.account === 'revenue').amountKopecks,
    -10000,
  );
  assert.equal(
    operation.postings.find((p) => p.account === 'expense').amountKopecks,
    7000,
  );
  assert.ok(operation.postings.every((p) => p.articleId === 'fuel'));
});
test('manual posting articles validate their own direction and owner', () => {
  const { post } = fixture([article('rent', { directionIds: ['delivery'] })]);
  assert.throws(
    () =>
      post({
        kind: 'opening',
        postings: [
          {
            account: 'fixed_asset',
            amountKopecks: 100,
            directionId: 'fleet',
            articleId: 'rent',
          },
          { account: 'equity', amountKopecks: -100 },
        ],
      }),
    /ARTICLE_DIRECTION/,
  );
});
test('AI and rules select only active applicable article IDs; recurring accrual carries the same identity', () => {
  const row = {
    ...BASE,
    id: 'op',
    kind: 'cash_out',
    description: 'Аренда',
    counterpartyId: 'landlord',
    version: 1,
  };
  const active = article('rent', { directionIds: ['delivery'] });
  const context = {
    operations: [row],
    articles: [active, article('archived', { archived: true })],
    directions: [],
    counterparties: [],
    rules: [
      {
        kind: 'classification_rules',
        id: 'r',
        name: 'Аренда',
        legalEntityId: 'company',
        counterpartyId: 'landlord',
        articleId: 'rent',
      },
    ],
  };
  assert.deepEqual(classification.suggestionsFor(context)[0].patch, {
    articleId: 'rent',
    article: 'Аренда офиса',
  });
  const response = (id) =>
    JSON.stringify({
      suggestions: [
        { operationId: 'op', articleId: id, reason: 'Услуга аренды' },
      ],
    });
  assert.equal(
    classification.parseClassificationResponse(response('rent'), context)[0]
      .patch.articleId,
    'rent',
  );
  assert.throws(
    () =>
      classification.parseClassificationResponse(response('archived'), context),
    /ARTICLE_ARCHIVED/,
  );
  assert.throws(
    () =>
      classification.parseClassificationResponse(response('unknown'), context),
    /ARTICLE_UNAVAILABLE/,
  );
  assert.ok(
    !JSON.parse(
      classification.buildClassificationPrompt(context).prompt,
    ).articles.some((item) => item.id === 'archived'),
  );
  const state = {
    operations: [],
    catalogs: [
      active,
      {
        kind: 'plans',
        id: 'monthly',
        ...BASE,
        name: 'Аренда',
        articleId: 'rent',
        responsibilityScopeIds: ['scope'],
        counterpartyId: 'landlord',
        flow: 'out',
        status: 'approved',
        amountKopecks: 10000,
        recurrence: {
          frequency: 'monthly',
          startDate: '2026-09-01',
          dayOfMonth: 15,
        },
        accrual: { kind: 'expense', vatKopecks: 0, articleId: 'rent' },
      },
    ],
  };
  const preview = automation.recurringPreviewRows(
    state,
    '2026-09-01',
    '2026-09-30',
  );
  assert.equal(preview[0].operation.articleId, 'rent');
  assert.equal(preview[0].operation.article, 'Аренда офиса');
  state.catalogs[0].archived = true;
  assert.equal(
    automation.recurringPreviewRows(state, '2026-09-01', '2026-09-30')[0]
      .status,
    'error',
  );
});
