'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test(
  'finance articles preserve scoped identities and immutable accounting history',
  { timeout: 180000 },
  async (t) => {
    const fixture = await createTestServer();
    t.after(() => fixture.close());
    const { request, devLogin, adminPool: db, ids } = fixture;
    await db.query(
      'UPDATE access_grants SET finance_visible=true WHERE user_id=$1',
      [ids.admin],
    );
    const token = (await devLogin(ids.admin)).accessToken;
    const base = '/finance/ledger';
    const ok = (response, status = 200) => {
      assert.equal(response.status, status, JSON.stringify(response.body));
      return response.body;
    };
    const catalog = (kind, input, auth = token) =>
      request(
        'PUT',
        `${base}/catalogs/${kind}`,
        {
          legalEntityId: ids.legal,
          version: 0,
          idempotencyKey: randomUUID(),
          ...input,
        },
        auth,
      );
    const article = (input, auth = token) =>
      catalog(
        'articles',
        {
          name: 'Аренда',
          category: 'expense',
          ...input,
        },
        auth,
      );
    const post = (input, auth = token) =>
      request(
        'POST',
        `${base}/operations`,
        {
          legalEntityId: ids.legal,
          responsibilityScopeId: ids.scope,
          kind: 'expense',
          date: '2026-09-15',
          amountKopecks: 10000,
          idempotencyKey: randomUUID(),
          ...input,
        },
        auth,
      );
    const snapshot = (query = '', auth = token) =>
      request(
        'GET',
        `${base}?from=2026-09-01&to=2026-09-30${query}`,
        undefined,
        auth,
      );
    const patch = (op, values) =>
      request(
        'PATCH',
        `${base}/operations/${op.id}`,
        {
          version: 1,
          idempotencyKey: randomUUID(),
          ...values,
        },
        token,
      );
    const detail = (id) =>
      request('GET', `${base}/operations/${id}`, undefined, token);
    const userId = randomUUID();
    await db.query(
      'INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',
      [userId, 'Article test manager', 'manager'],
    );
    await db.query(
      'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)',
      [userId, ids.legal, ids.region, ids.project, ids.scope],
    );
    const manager = (await devLogin(userId)).accessToken;
    const delivery = ok(await catalog('directions', { name: 'Доставка' }));
    const fuel = ok(await catalog('directions', { name: 'Топливо' }));
    const party = ok(
      await catalog('counterparties', {
        name: 'Синтетический поставщик',
        roles: ['supplier'],
      }),
    );
    const account = ok(
      await catalog('accounts', { name: 'Синтетический банк', type: 'bank' }),
    );
    const invoice = (extra = {}) => ({
      counterpartyId: party.id,
      directionId: delivery.id,
      ...extra,
    });
    let rent, first, archived, sharedCompany, sharedScope;

    await t.test(
      'create, retry and optimistic updates use the existing shared catalog',
      async () => {
        const input = {
          name: '  Аренда   офиса  ',
          code: ' rent ',
          directionIds: [delivery.id],
          idempotencyKey: randomUUID(),
        };
        rent = ok(await article(input));
        assert.equal(rent.name, 'Аренда офиса');
        assert.equal(rent.code, 'RENT');
        assert.equal(rent.version, 1);
        assert.equal(ok(await article(input)).id, rent.id);
        assert.equal(
          ok(await snapshot()).catalogs.articles.find(
            (row) => row.id === rent.id,
          ).canEdit,
          true,
        );
        ok(
          await article({
            ...input,
            id: rent.id,
            version: 0,
            idempotencyKey: randomUUID(),
          }),
          409,
        );
        ok(await article({ name: 'bad category', category: 'invented' }), 400);
        ok(
          await article({
            name: 'nested bypass',
            data: { responsibilityScopeIds: [randomUUID()], archived: true },
          }),
          400,
        );
        ok(await article({ name: 'not boolean', archived: 'false' }), 400);
        ok(
          await post(
            invoice({ articleId: rent.id, data: { articleId: randomUUID() } }),
          ),
          400,
        );
        ok(
          await article({
            name: 'bad direction',
            directionIds: [randomUUID()],
          }),
          404,
        );
      },
    );

    await t.test(
      'overlapping scopes serialize normalized name/code duplicates across different actors',
      async () => {
        const concurrent = await Promise.all([
          article({ name: '  Перевозки   ёлки ', code: 'same-code' }),
          article({ name: 'ПЕРЕВОЗКИ ЕЛКИ', code: 'another-code' }, manager),
        ]);
        assert.deepEqual(
          concurrent.map((row) => row.status).sort(),
          [200, 409],
        );
        const codeConcurrent = await Promise.all([
          article({ name: 'Название один', code: ' unique   code ' }),
          article({ name: 'Название два', code: 'UNIQUE CODE' }, manager),
        ]);
        assert.deepEqual(
          codeConcurrent.map((row) => row.status).sort(),
          [200, 409],
        );
      },
    );

    await t.test(
      'direct and distributed expenses validate every destination independently of allocation',
      async () => {
        first = ok(await post(invoice({ articleId: rent.id })), 201);
        assert.equal(first.article, 'Аренда офиса');
        assert.equal(first.articleId, rent.id);
        ok(
          await post(invoice({ directionId: fuel.id, articleId: rent.id })),
          400,
        );
        const rule = ok(
          await catalog('allocationRules', {
            name: 'Общий офис',
            effectiveFrom: '2026-09-01',
            weights: [
              { directionId: delivery.id, percent: '60' },
              { directionId: fuel.id, percent: '40' },
            ],
          }),
        );
        ok(
          await post(
            invoice({
              directionId: '__common__',
              allocationRuleId: rule.id,
              articleId: rent.id,
            }),
          ),
          400,
        );
        const allowed = ok(
          await article({
            name: 'Общий офис',
            directionIds: [delivery.id, fuel.id],
          }),
        );
        const distributed = ok(
          await post(
            invoice({
              directionId: '__common__',
              allocationRuleId: rule.id,
              articleId: allowed.id,
            }),
          ),
          201,
        );
        assert.deepEqual(
          new Set(
            distributed.postings
              .filter((p) => p.account === 'expense')
              .map((p) => p.directionId),
          ),
          new Set([delivery.id, fuel.id]),
        );
        ok(
          await catalog('allocationRules', {
            name: 'Неприменимая статья',
            effectiveFrom: '2026-09-01',
            articleId: rent.id,
            weights: rule.weights,
          }),
          400,
        );
        const inherited = ok(
          await catalog('allocationRules', {
            name: 'Наследование статьи',
            effectiveFrom: '2026-09-01',
            articleId: allowed.id,
            weights: rule.weights,
          }),
        );
        assert.equal(
          ok(
            await post(
              invoice({
                directionId: '__common__',
                allocationRuleId: inherited.id,
              }),
            ),
            201,
          ).articleId,
          allowed.id,
        );
        const exact = ok(
          await post(invoice({ article: '  АРЕНДА   ОФИСА ' })),
          201,
        );
        assert.equal(exact.articleId, rent.id);
        const legacy = ok(
          await post(invoice({ article: 'Неразобранная статья источника' })),
          201,
        );
        assert.equal(legacy.articleId, null);
        assert.equal(legacy.articleWarning.code, 'LEGACY_ARTICLE');
        assert.ok(
          ok(await snapshot()).controls.some(
            (row) => row.code === 'LEGACY_ARTICLE',
          ),
        );
      },
    );

    await t.test(
      'renaming never changes stored snapshots, while reports and drilldowns group stable article IDs',
      async () => {
        rent = ok(
          await article({
            ...rent,
            name: 'Аренда помещений',
            version: rent.version,
          }),
        );
        assert.equal(ok(await detail(first.id)).article, 'Аренда офиса');
        const next = ok(await post(invoice({ articleId: rent.id })), 201);
        assert.equal(next.article, 'Аренда помещений');
        const rows = ok(await snapshot()).reports.pnl.rows.filter(
          (row) => row.articleId === rent.id,
        );
        assert.equal(rows.length, 1);
        assert.deepEqual(
          new Set(rows[0].articleNames),
          new Set(['Аренда офиса', 'Аренда помещений']),
        );
        const filtered = ok(await snapshot(`&articleId=${rent.id}`));
        assert.ok(filtered.operations.items.length >= 3);
        assert.ok(
          filtered.operations.items.every((row) => row.articleId === rent.id),
        );
        const corrected = ok(
          await patch(first, { description: 'Исправлено только пояснение' }),
        ).items[0];
        assert.equal(corrected.article, 'Аренда офиса');
        assert.equal(corrected.articleId, rent.id);
        assert.equal(corrected.amountKopecks, first.amountKopecks);
        first = corrected;
      },
    );

    await t.test(
      'archive keeps history and unrelated corrections, and blocks selecting archived articles',
      async () => {
        archived = ok(
          await article({
            name: 'Историческая статья',
            directionIds: [delivery.id],
          }),
        );
        const old = ok(await post(invoice({ articleId: archived.id })), 201);
        archived = ok(await article({ ...archived, archived: true }));
        ok(await post(invoice({ articleId: archived.id })), 404);
        ok(await post(invoice({ article: archived.name })), 400);
        const unchanged = ok(
          await patch(old, { description: 'Уточнение после архива' }),
        ).items[0];
        assert.equal(unchanged.articleId, archived.id);
        assert.equal(unchanged.article, archived.name);
        ok(await patch(unchanged, { directionId: fuel.id }), 400);
        assert.equal(ok(await detail(old.id)).articleId, archived.id);
        const duplicate = ok(
          await article({ name: archived.name, directionIds: [delivery.id] }),
        );
        ok(await article({ ...archived, archived: false }), 409);
        archived = ok(
          await article({
            ...archived,
            name: 'Историческая восстановленная',
            archived: false,
          }),
        );
        assert.equal(archived.archived, false);
        assert.notEqual(archived.id, duplicate.id);
      },
    );

    await t.test(
      'active automation blocks archive, disabled rules and cancelled plans release it',
      async () => {
        let value = ok(
          await article({
            name: 'Статья правила',
            directionIds: [delivery.id],
          }),
        );
        let rule = ok(
          await catalog('classificationRules', {
            name: 'Правило',
            contains: 'поставщик',
            directionId: delivery.id,
            articleId: value.id,
          }),
        );
        ok(await article({ ...value, archived: true }), 409);
        ok(await article({ ...value, directionIds: [fuel.id] }), 409);
        ok(
          await article({
            ...value,
            archived: true,
            data: { archived: false },
          }),
          400,
        );
        rule = ok(
          await catalog('classificationRules', { ...rule, active: false }),
        );
        value = ok(await article({ ...value, archived: true }));
        assert.equal(value.archived, true);
        let planArticle = ok(
          await article({ name: 'Статья плана', directionIds: [delivery.id] }),
        );
        let plan = ok(
          await catalog('plans', {
            name: 'План',
            flow: 'out',
            amountKopecks: 5000,
            expectedDate: '2026-10-01',
            directionId: delivery.id,
            articleId: planArticle.id,
          }),
        );
        ok(await article({ ...planArticle, archived: true }), 409);
        ok(await article({ ...planArticle, directionIds: [fuel.id] }), 409);
        plan = ok(await catalog('plans', { ...plan, status: 'cancelled' }));
        planArticle = ok(await article({ ...planArticle, archived: true }));
        assert.equal(planArticle.archived, true);
        ok(
          await catalog('plans', {
            name: 'Неверное направление',
            flow: 'out',
            amountKopecks: 1000,
            directionId: fuel.id,
            articleId: rent.id,
          }),
          400,
        );
      },
    );

    await t.test(
      'bank classification corrections preserve actual money and immutable history',
      async () => {
        const bank = ok(
          await post({
            kind: 'cash_out',
            amountKopecks: 7500,
            cashAccountId: account.id,
            directionId: delivery.id,
            articleId: rent.id,
            source: { system: 'bank', id: 'articles-bank-1', version: '1' },
          }),
          201,
        );
        const selected = ok(
          await article({
            name: 'Банковские услуги',
            directionIds: [delivery.id],
          }),
        );
        const corrected = ok(await patch(bank, { articleId: selected.id }))
          .items[0];
        assert.equal(corrected.articleId, selected.id);
        const cash = (op) =>
          op.postings
            .filter((row) => row.account === 'cash')
            .map((row) => [row.cashAccountId, row.amountKopecks]);
        assert.deepEqual(cash(corrected), cash(bank));
        assert.equal(ok(await detail(bank.id)).articleId, rent.id);
      },
    );

    await t.test(
      'reviewed imports accept article IDs, validate restrictions and never create legacy articles',
      async () => {
        const payload = {
          schemaVersion: 'finance.import.v1',
          sourceSystem: '1С',
          sourceBaseId: 'articles-fixture',
          operations: [
            {
              kind: 'expense',
              date: '2026-09-20',
              amountKopecks: 2200,
              counterpartyId: party.id,
              directionId: delivery.id,
              articleId: rent.id,
              source: { id: 'articles-expense-1' },
            },
            {
              kind: 'expense',
              date: '2026-09-20',
              amountKopecks: 3300,
              counterpartyId: party.id,
              directionId: fuel.id,
              articleId: rent.id,
              source: { id: 'articles-expense-2' },
            },
          ],
        };
        const preview = ok(
          await request(
            'POST',
            `${base}/imports/preview`,
            {
              legalEntityId: ids.legal,
              sourceType: 'one_c',
              fileName: 'articles.json',
              contentBase64: Buffer.from(JSON.stringify(payload)).toString(
                'base64',
              ),
            },
            token,
          ),
          201,
        );
        const before = Number(
          (
            await db.query(
              'SELECT count(*) AS count FROM finance_ledger_operations',
            )
          ).rows[0].count,
        );
        ok(
          await request(
            'POST',
            `${base}/imports/${preview.id}/commit`,
            {
              selectedRows: [1, 2],
              overrides: { 1: { reviewed: true }, 2: { reviewed: true } },
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          400,
        );
        assert.equal(
          Number(
            (
              await db.query(
                'SELECT count(*) AS count FROM finance_ledger_operations',
              )
            ).rows[0].count,
          ),
          before,
        );
        const committed = ok(
          await request(
            'POST',
            `${base}/imports/${preview.id}/commit`,
            {
              selectedRows: [1],
              overrides: { 1: { reviewed: true } },
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          201,
        );
        assert.equal(
          ok(await detail(committed.items[0].id)).articleId,
          rent.id,
        );
      },
    );

    await t.test(
      'new own company reuses only fully common editable articles and directions',
      async () => {
        sharedCompany = ok(
          await request(
            'PUT',
            `${base}/companies`,
            {
              name: 'Вторая синтетическая компания',
              organizationKind: 'legal_entity',
              inn: '7707083893',
              version: 0,
              idempotencyKey: randomUUID(),
            },
            token,
          ),
        );
        const state = ok(await snapshot());
        sharedScope = state.context.scopes.find(
          (row) => row.legalEntityId === sharedCompany.id,
        );
        assert.ok(sharedScope);
        const linked = state.catalogs.articles.find(
          (row) => row.id === rent.id,
        );
        assert.ok(linked.legalEntityIds.includes(sharedCompany.id));
        assert.equal(linked.version, rent.version + 1);
        const cash = ok(
          await catalog('accounts', {
            legalEntityId: sharedCompany.id,
            name: 'Банк второй компании',
            type: 'bank',
          }),
        );
        const created = ok(
          await post({
            legalEntityId: sharedCompany.id,
            responsibilityScopeId: sharedScope.responsibilityScopeId,
            kind: 'cash_in',
            amountKopecks: 1200,
            cashAccountId: cash.id,
            directionId: delivery.id,
            articleId: rent.id,
          }),
          201,
        );
        assert.equal(created.articleId, rent.id);
        const managerState = ok(await snapshot('', manager));
        assert.equal(
          managerState.catalogs.articles.find((row) => row.id === rent.id)
            .canEdit,
          false,
        );
        assert.ok(
          !managerState.context.legalEntities.some(
            (row) => row.id === sharedCompany.id,
          ),
        );
      },
    );

    await t.test(
      'hidden articles/directions stay inaccessible and private scopes may reuse names',
      async () => {
        const hiddenDirection = ok(
          await catalog('directions', {
            legalEntityId: sharedCompany.id,
            name: 'Закрытое направление',
            responsibilityScopeIds: [sharedScope.responsibilityScopeId],
          }),
        );
        const hidden = ok(
          await article({
            legalEntityId: sharedCompany.id,
            name: 'Только другая компания',
            responsibilityScopeIds: [sharedScope.responsibilityScopeId],
            directionIds: [hiddenDirection.id],
          }),
        );
        ok(await post(invoice({ articleId: hidden.id }), manager), 404);
        ok(
          await article({ ...hidden, name: 'Не разрешено менять' }, manager),
          404,
        );
        ok(
          await article({
            name: 'Плохая связь',
            directionIds: [hiddenDirection.id],
            responsibilityScopeIds: [ids.scope],
          }),
          404,
        );
        const privateOriginal = ok(
          await article(
            { name: hidden.name, responsibilityScopeIds: [ids.scope] },
            manager,
          ),
        );
        assert.notEqual(privateOriginal.id, hidden.id);
        assert.ok(
          !ok(await snapshot('', manager)).catalogs.articles.some(
            (row) => row.id === hidden.id,
          ),
        );
        const scopesBefore = hidden.responsibilityScopeIds;
        ok(
          await request(
            'PUT',
            `${base}/companies`,
            {
              name: 'Третья синтетическая компания',
              organizationKind: 'sole_proprietor',
              inn: '500100732259',
              version: 0,
              idempotencyKey: randomUUID(),
            },
            token,
          ),
        );
        const stored = (
          await db.query(
            'SELECT responsibility_scope_ids,version FROM finance_ledger_catalogs WHERE id=$1',
            [hidden.id],
          )
        ).rows[0];
        assert.deepEqual(stored.responsibility_scope_ids, scopesBefore);
        assert.equal(stored.version, hidden.version);
      },
    );
    await t.test(
      'archiving a direction preserves existing article lifecycle without permitting new archived references',
      async () => {
        let direction = ok(
          await catalog('directions', { name: 'Завершенное направление' }),
        );
        let value = ok(
          await article({
            name: 'Статья завершенного направления',
            directionIds: [direction.id],
          }),
        );
        direction = ok(
          await catalog('directions', { ...direction, archived: true }),
        );
        ok(
          await article({
            name: 'Новая недопустимая связь',
            directionIds: [direction.id],
          }),
          404,
        );
        value = ok(
          await article({
            ...value,
            description: 'Уточнение существующей статьи',
          }),
        );
        assert.deepEqual(value.directionIds, [direction.id]);
        value = ok(await article({ ...value, archived: true }));
        assert.equal(value.archived, true);
      },
    );
  },
);
