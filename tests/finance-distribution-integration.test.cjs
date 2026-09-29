'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test(
  'row distribution preserves bank facts and atomically rebuilds bounded settlement links',
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
    const save = (kind, body) =>
      request(
        'PUT',
        `${base}/catalogs/${kind}`,
        {
          legalEntityId: ids.legal,
          version: 0,
          idempotencyKey: randomUUID(),
          ...body,
        },
        token,
      );
    const post = (body) =>
      request(
        'POST',
        `${base}/operations`,
        {
          legalEntityId: ids.legal,
          responsibilityScopeId: ids.scope,
          date: '2026-09-15',
          idempotencyKey: randomUUID(),
          ...body,
        },
        token,
      );
    const patch = (op, body, auth = token) =>
      request(
        'PATCH',
        `${base}/operations/${op.id}`,
        { version: 1, idempotencyKey: randomUUID(), ...body },
        auth,
      );
    const detail = async (id) =>
      ok(await request('GET', `${base}/operations/${id}`, undefined, token));
    const snapshot = async (query = '') =>
      ok(
        await request(
          'GET',
          `${base}?from=2026-09-01&to=2026-09-30&calendarFrom=2026-09-30&calendarTo=2026-10-20${query}`,
          undefined,
          token,
        ),
      );
    const count = async () =>
      Number(
        (await db.query('SELECT count(*) AS n FROM finance_ledger_operations'))
          .rows[0].n,
      );
    let delivery = ok(await save('directions', { name: 'Доставка' }));
    let fuel = ok(await save('directions', { name: 'Топливо' }));
    let party = ok(
      await save('parties', {
        name: 'Синтетический партнер',
        roles: ['supplier', 'customer'],
      }),
    );
    const bank = ok(
      await save('accounts', { name: 'Тестовый счет', type: 'bank' }),
    );
    const article = ok(
      await save('articles', { name: 'Общие расходы', category: 'expense' }),
    );
    const narrowArticle = ok(
      await save('articles', {
        name: 'Пока общие',
        category: 'expense',
        directionIds: ['__common__'],
      }),
    );
    const shares = (a = '60', b = '40') => [
      { directionId: delivery.id, percent: a },
      { directionId: fuel.id, percent: b },
    ];
    const invoice = (extra = {}) =>
      post({
        kind: 'expense',
        amountKopecks: 10000,
        counterpartyId: party.id,
        directionId: '__common__',
        articleId: article.id,
        ...extra,
      });
    const payment = (extra = {}) =>
      post({
        kind: 'payment_out',
        amountKopecks: 4000,
        counterpartyId: party.id,
        cashAccountId: bank.id,
        directionId: '__common__',
        ...extra,
      });
    const cash = (op) =>
      op.postings
        .filter((row) => row.account === 'cash')
        .reduce((total, row) => total + row.amountKopecks, 0);
    const cf = (op, id) =>
      op.cashFlows
        .filter((row) => row.directionId === id)
        .reduce((total, row) => total + row.amountKopecks, 0);
    ok(
      await post({
        kind: 'opening',
        date: '2026-08-31',
        postings: [
          { account: 'cash', cashAccountId: bank.id, amountKopecks: 100000 },
          { account: 'equity', amountKopecks: -100000 },
        ],
      }),
      201,
    );
    let imported, correctedPaid, originalPaidPayment;

    await t.test(
      'bank import can be split from the row with exact pennies and no fictitious profit',
      async () => {
        const file =
          'date;income;expense;description;source_id\n2026-09-10;;100.01;Общий расход;distribution-bank\n';
        const preview = ok(
          await request(
            'POST',
            `${base}/imports/preview`,
            {
              legalEntityId: ids.legal,
              sourceType: 'bank',
              fileName: 'distribution.csv',
              contentBase64: Buffer.from(file).toString('base64'),
            },
            token,
          ),
          201,
        );
        const committed = ok(
          await request(
            'POST',
            `${base}/imports/${preview.id}/commit`,
            {
              selectedRows: [1],
              overrides: {
                1: {
                  cashAccountId: bank.id,
                  directionId: '__common__',
                  reviewed: true,
                },
              },
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          201,
        );
        imported = await detail(committed.items[0].id);
        const requestBody = {
          allocationWeights: shares(),
          allocationRuleId: null,
          idempotencyKey: randomUUID(),
        };
        const changed = ok(await patch(imported, requestBody));
        assert.deepEqual(ok(await patch(imported, requestBody)), changed);
        const result = changed.items[0];
        assert.equal(result.allocationMethod, 'manual');
        assert.deepEqual(result.allocationWeights, [
          { directionId: delivery.id, basisPoints: 6000 },
          { directionId: fuel.id, basisPoints: 4000 },
        ]);
        assert.equal(cash(result), cash(imported));
        assert.equal(result.date, imported.date);
        assert.equal(cf(result, delivery.id), -6001);
        assert.equal(cf(result, fuel.id), -4000);
        assert.equal((await snapshot()).reports.pnl.profitKopecks, 0);
        assert.equal((await snapshot()).reports.cf.outflowKopecks, 10001);
        imported = result;
      },
    );

    await t.test(
      'manual and named choices replace each other, clear explicitly, and reject invalid weights atomically',
      async () => {
        const rule = ok(
          await save('allocationRules', {
            name: 'Правило 70/30',
            effectiveFrom: '2026-09-01',
            weights: shares('70', '30'),
          }),
        );
        const named = ok(
          await patch(imported, {
            allocationRuleId: rule.id,
            allocationWeights: null,
          }),
        ).items[0];
        assert.equal(named.allocationMethod, 'rule');
        assert.equal(named.allocationWeights, undefined);
        const manual = ok(
          await patch(named, {
            allocationRuleId: null,
            allocationWeights: shares(),
          }),
        ).items[0];
        assert.equal(manual.allocationMethod, 'manual');
        assert.equal(manual.allocationRuleId, undefined);
        assert.equal(cf(manual, delivery.id), -6001);
        const cleared = ok(await patch(manual, { allocationWeights: null }))
          .items[0];
        assert.equal(cleared.allocationMethod, undefined);
        assert.equal(cf(cleared, '__common__'), -10001);
        const before = await count();
        ok(
          await patch(cleared, { allocationWeights: shares('50', '40') }),
          400,
        );
        ok(
          await patch(cleared, {
            allocationWeights: shares(),
            allocationRuleId: rule.id,
          }),
          400,
        );
        ok(
          await patch(cleared, {
            allocationWeights: [{ directionId: randomUUID(), percent: '100' }],
          }),
          404,
        );
        assert.equal(await count(), before);
        imported = cleared;
      },
    );

    await t.test(
      'direct expense allocation separates net expense, input VAT and payable amounts',
      async () => {
        const source = ok(await invoice({ vatKopecks: 2000 }), 201);
        const result = ok(await patch(source, { allocationWeights: shares() }))
          .items[0];
        const rows = (account, directionId) =>
          result.postings
            .filter(
              (p) => p.account === account && p.directionId === directionId,
            )
            .reduce((n, p) => n + p.amountKopecks, 0);
        assert.equal(rows('expense', delivery.id), 4800);
        assert.equal(rows('expense', fuel.id), 3200);
        assert.equal(rows('input_vat', delivery.id), 1200);
        assert.equal(rows('ap', delivery.id), -6000);
        assert.equal(cash(result), 0);
        for (const directionId of [delivery.id, fuel.id, '__common__'])
          assert.equal(
            (await snapshot(`&directionId=${directionId}`)).reports.balance
              .differenceKopecks,
            0,
          );
      },
    );

    await t.test(
      'paid expense rebuilds direct multi-document payment, later settlement and linked plan atomically',
      async () => {
        const expense = ok(await invoice({ articleId: narrowArticle.id }), 201);
        const other = ok(
          await invoice({ amountKopecks: 2000, directionId: fuel.id }),
          201,
        );
        const later = ok(
          await invoice({ amountKopecks: 3000, directionId: fuel.id }),
          201,
        );
        const paid = ok(
          await payment({
            amountKopecks: 8000,
            date: '2026-09-16',
            allocations: [
              { documentId: expense.id, amountKopecks: 4000 },
              { documentId: other.id, amountKopecks: 2000 },
            ],
            source: { system: 'bank', id: 'paid-distribution', version: '1' },
          }),
          201,
        );
        const settlement = ok(
          await post({
            kind: 'settlement',
            date: '2026-09-17',
            paymentId: paid.id,
            allocations: [{ documentId: later.id, amountKopecks: 1500 }],
          }),
          201,
        );
        const plan = ok(
          await save('plans', {
            name: 'Остаток счета',
            amountKopecks: 6000,
            flow: 'out',
            documentId: expense.id,
            expectedDate: '2026-10-10',
            directionId: '__common__',
            status: 'approved',
          }),
        );
        const docs = (await detail(paid.id)).distributionDocuments.map(
          (row) => row.id,
        );
        assert.deepEqual(
          new Set(docs),
          new Set([expense.id, other.id, later.id]),
        );
        const before = await snapshot();
        const changed = ok(
          await patch(expense, {
            allocationWeights: shares(),
            articleId: article.id,
          }),
        );
        assert.equal(changed.distributionEffects.replayedOperations, 2);
        assert.equal(changed.distributionEffects.updatedPlans, 1);
        correctedPaid = changed.items[0];
        originalPaidPayment = paid;
        const replayed = await Promise.all(
          changed.distributionEffects.operationIds.map(detail),
        );
        const newPayment = replayed.find((row) => row.kind === 'payment_out');
        const newSettlement = replayed.find((row) => row.kind === 'settlement');
        assert.equal(cash(newPayment), cash(paid));
        assert.equal(newPayment.date, paid.date);
        assert.equal(newSettlement.paymentId, newPayment.id);
        assert.equal(newSettlement.allocations[0].documentId, later.id);
        assert.equal(newSettlement.amountKopecks, settlement.amountKopecks);
        assert.deepEqual(
          newPayment.allocations
            .find((row) => row.documentId === correctedPaid.id)
            .portions.map((row) => row.amountKopecks)
            .sort((a, b) => a - b),
          [1600, 2400],
        );
        const after = await snapshot();
        assert.equal(
          after.reports.cf.outflowKopecks,
          before.reports.cf.outflowKopecks,
        );
        assert.equal(
          after.reports.pnl.expenseKopecks,
          before.reports.pnl.expenseKopecks,
        );
        assert.equal(
          after.reports.payables.find((row) => row.id === correctedPaid.id)
            .remainingKopecks,
          6000,
        );
        const correctedPlan = after.catalogs.plans.find(
          (row) => row.id === plan.id,
        );
        assert.equal(correctedPlan.documentId, correctedPaid.id);
        assert.equal(correctedPlan.version, plan.version + 1);
        assert.equal(
          correctedPlan.settledBaselineKopecks,
          plan.settledBaselineKopecks,
        );
        assert.equal(
          after.calendar.rows.find((row) => row.id === plan.id).amountKopecks,
          6000,
        );
        const amountBefore = await count();
        ok(
          await patch(correctedPaid, {
            allocationWeights: shares(),
            amountKopecks: 11000,
          }),
          409,
        );
        assert.equal(await count(), amountBefore);
      },
    );

    await t.test(
      'advance CF distribution is independent from expense recognition, both retain later settlement',
      async () => {
        const expense = ok(await invoice({ amountKopecks: 6000 }), 201);
        const advance = ok(
          await post({
            kind: 'supplier_advance',
            amountKopecks: 10000,
            counterpartyId: party.id,
            cashAccountId: bank.id,
            directionId: '__common__',
            source: {
              system: 'bank',
              id: 'advance-distribution',
              version: '1',
            },
          }),
          201,
        );
        ok(
          await post({
            kind: 'settlement',
            date: '2026-09-18',
            paymentId: advance.id,
            allocations: [{ documentId: expense.id, amountKopecks: 3000 }],
          }),
          201,
        );
        const expenseChange = ok(
          await patch(expense, { allocationWeights: shares('70', '30') }),
        );
        assert.equal(expenseChange.distributionEffects.replayedOperations, 1);
        assert.equal(cf(await detail(advance.id), '__common__'), -10000);
        assert.equal(
          (await detail(advance.id)).distributionDocuments[0].id,
          expenseChange.items[0].id,
        );
        const advanceChange = ok(
          await patch(advance, { allocationWeights: shares('20', '80') }),
        );
        assert.equal(advanceChange.distributionEffects.replayedOperations, 1);
        assert.equal(cf(advanceChange.items[0], delivery.id), -2000);
        assert.equal(cf(advanceChange.items[0], fuel.id), -8000);
        assert.equal(cash(advanceChange.items[0]), -10000);
        assert.equal(
          (await snapshot()).reports.payables.find(
            (row) => row.id === expenseChange.items[0].id,
          ).remainingKopecks,
          3000,
        );
        for (const directionId of [delivery.id, fuel.id, '__common__'])
          assert.equal(
            (await snapshot(`&directionId=${directionId}`)).reports.balance
              .differenceKopecks,
            0,
          );
      },
    );

    await t.test(
      'directly linked bank row routes to its expense and complex setoff remains a clear conflict',
      async () => {
        const before = await count();
        const currentPayment = (
          await detail(originalPaidPayment.id)
        ).related.find((row) => row.correctionOfId === originalPaidPayment.id);
        ok(await patch(currentPayment, { allocationWeights: shares() }), 400);
        assert.equal(await count(), before);
        const expense = ok(await invoice({ amountKopecks: 1000 }), 201);
        const sale = ok(
          await post({
            kind: 'sale',
            amountKopecks: 1000,
            counterpartyId: party.id,
            directionId: delivery.id,
          }),
          201,
        );
        ok(
          await post({
            kind: 'setoff',
            amountKopecks: 1000,
            receivableId: sale.id,
            payableId: expense.id,
            reason: 'Синтетический взаимозачет',
          }),
          201,
        );
        const guarded = await count();
        const rejected = ok(
          await patch(expense, { allocationWeights: shares() }),
          409,
        );
        assert.equal(rejected.code, 'FINANCE_DISTRIBUTION_COMPLEX');
        assert.equal(await count(), guarded);
        assert.ok(guarded > before);
      },
    );

    await t.test(
      'hidden and projected graph dependencies block the whole correction before writes',
      async () => {
        const scope2 = randomUUID();
        await db.query(
          'INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',
          [scope2, ids.project, 'Закрытый финансовый проект'],
        );
        await db.query(
          'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)',
          [ids.admin, ids.legal, ids.region, ids.project, scope2],
        );
        for (const pair of [
          ['directions', delivery],
          ['directions', fuel],
          ['parties', party],
        ]) {
          const saved = ok(
            await save(pair[0], {
              ...pair[1],
              responsibilityScopeIds: [ids.scope, scope2],
            }),
          );
          if (saved.id === delivery.id) delivery = saved;
          else if (saved.id === fuel.id) fuel = saved;
          else party = saved;
        }
        const hiddenBank = ok(
          await save('accounts', {
            name: 'Закрытый счет',
            type: 'bank',
            responsibilityScopeIds: [scope2],
          }),
        );
        const managerId = randomUUID();
        await db.query(
          'INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',
          [managerId, 'Synthetic limited finance', 'manager'],
        );
        await db.query(
          'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)',
          [managerId, ids.legal, ids.region, ids.project, ids.scope],
        );
        const manager = (await devLogin(managerId)).accessToken;
        const expense = ok(await invoice({ amountKopecks: 1000 }), 201);
        ok(
          await payment({
            amountKopecks: 500,
            cashAccountId: hiddenBank.id,
            responsibilityScopeId: scope2,
            allocations: [{ documentId: expense.id, amountKopecks: 500 }],
          }),
          201,
        );
        const before = await count();
        ok(await patch(expense, { allocationWeights: shares() }, manager), 403);
        assert.equal(await count(), before);
        const invisibleExpense = ok(
          await invoice({ amountKopecks: 1000 }),
          201,
        );
        const hiddenId = randomUUID();
        const hidden = {
          id: hiddenId,
          legalEntityId: ids.legal,
          regionId: ids.region,
          projectId: ids.project,
          responsibilityScopeId: scope2,
          relatedScopeIds: [scope2],
          kind: 'adjustment',
          date: '2026-09-15',
          amountKopecks: 0,
          status: 'confirmed',
          postings: [
            {
              account: 'ap',
              amountKopecks: 100,
              documentId: invisibleExpense.id,
              directionId: '__common__',
              responsibilityScopeId: scope2,
            },
            {
              account: 'equity',
              amountKopecks: -100,
              directionId: '__common__',
              responsibilityScopeId: scope2,
            },
          ],
          allocations: [],
          cashFlows: [],
        };
        await db.query(
          `INSERT INTO finance_ledger_operations(id,legal_entity_id,region_id,project_id,responsibility_scope_id,related_scope_ids,operation_date,kind,data,idempotency_key,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
          [
            hiddenId,
            ids.legal,
            ids.region,
            ids.project,
            scope2,
            [scope2],
            hidden.date,
            hidden.kind,
            JSON.stringify(hidden),
            randomUUID(),
            '0'.repeat(64),
            ids.admin,
          ],
        );
        const beforeInvisible = await count();
        ok(
          await patch(
            invisibleExpense,
            { allocationWeights: shares() },
            manager,
          ),
          403,
        );
        assert.equal(await count(), beforeInvisible);
        const otherCompany = ok(
          await request(
            'PUT',
            `${base}/companies`,
            {
              name: 'Синтетическая организация группы',
              organizationKind: 'legal_entity',
              inn: '7707083893',
              version: 0,
              idempotencyKey: randomUUID(),
            },
            token,
          ),
        );
        const ownScope = (await snapshot()).context.scopes.find(
          (row) => row.legalEntityId === otherCompany.id,
        );
        const groupExpense = ok(await invoice({ amountKopecks: 1000 }), 201);
        ok(
          await post({
            kind: 'consolidation_adjustment',
            legalEntityId: otherCompany.id,
            responsibilityScopeId: ownScope.responsibilityScopeId,
            consolidationEntityIds: [ids.legal, otherCompany.id],
            reason: 'Проверка скрытой групповой корректировки',
            postings: [
              {
                account: 'ap',
                amountKopecks: 100,
                documentId: groupExpense.id,
                counterpartyId: party.id,
                legalEntityId: ids.legal,
                responsibilityScopeId: ids.scope,
                directionId: '__common__',
              },
              {
                account: 'equity',
                amountKopecks: -100,
                legalEntityId: otherCompany.id,
                responsibilityScopeId: ownScope.responsibilityScopeId,
                directionId: '__common__',
              },
            ],
          }),
          201,
        );
        const beforeGroup = await count();
        ok(
          await patch(groupExpense, { allocationWeights: shares() }, manager),
          403,
        );
        ok(await patch(groupExpense, { allocationWeights: shares() }), 409);
        assert.equal(await count(), beforeGroup);
      },
    );

    await t.test(
      'closed periods reject cascades without partial reversals',
      async () => {
        await db.query(
          `INSERT INTO finance_ledger_closures(id,legal_entity_id,region_id,project_id,responsibility_scope_id,date_from,date_to,closed_by) VALUES($1,$2,$3,$4,$5,'2026-09-01','2026-09-30',$6)`,
          [
            randomUUID(),
            ids.legal,
            ids.region,
            ids.project,
            ids.scope,
            ids.admin,
          ],
        );
        const before = await count();
        const rejected = ok(
          await patch(correctedPaid, { allocationWeights: shares('50', '50') }),
          409,
        );
        assert.equal(rejected.code, 'FINANCE_PERIOD_CLOSED');
        assert.equal(await count(), before);
      },
    );
  },
);
