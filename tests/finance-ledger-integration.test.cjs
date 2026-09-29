'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test(
  'management finance persists balanced reports, source identity, settlements and current financial grants',
  { timeout: 180000 },
  async (t) => {
    const fixture = await createTestServer();
    t.after(() => fixture.close());
    const { request, devLogin, adminPool: db, ids } = fixture;
    await db.query(
      'UPDATE access_grants SET finance_visible=true WHERE user_id=$1',
      [ids.admin],
    );
    const admin = await devLogin(ids.admin),
      token = admin.accessToken;
    const base = '/finance/ledger';
    function ok(result, status = 200) {
      assert.equal(result.status, status, JSON.stringify(result.body));
      return result.body;
    }
    const catalog = (kind, body, auth = token) =>
      request(
        'PUT',
        `${base}/catalogs/${kind}`,
        {
          legalEntityId: ids.legal,
          version: 0,
          idempotencyKey: randomUUID(),
          ...body,
        },
        auth,
      );
    const post = (body, auth = token) =>
      request(
        'POST',
        `${base}/operations`,
        {
          legalEntityId: ids.legal,
          idempotencyKey: randomUUID(),
          responsibilityScopeId: ids.scope,
          ...body,
        },
        auth,
      );
    const snapshot = (extra = '', auth = token) =>
      request(
        'GET',
        `${base}?from=2026-09-01&to=2026-09-30&calendarFrom=2026-09-30&calendarTo=2026-10-10${extra}`,
        undefined,
        auth,
      );
    async function employee(role, finance = true, scope = ids.scope) {
      const id = randomUUID();
      await db.query(
        'INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',
        [id, 'Synthetic finance reviewer', role],
      );
      await db.query(
        'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,$6)',
        [id, ids.legal, ids.region, ids.project, scope, finance],
      );
      return devLogin(id);
    }
    const auditor = await employee('auditor'),
      manager = await employee('manager'),
      forbiddenActor = await employee('driver', true),
      noFinance = await employee('document_specialist', false);
    let direction, account, client, carrier, sale, expense, payment, opening;
    await t.test(
      'roles and exact grants protect read and writes while auditor can inspect',
      async () => {
        ok(await snapshot());
        ok(await snapshot('', auditor.accessToken));
        ok(await snapshot('', forbiddenActor.accessToken), 403);
        ok(await snapshot('', noFinance.accessToken), 403);
        ok(
          await catalog(
            'directions',
            { name: 'Forbidden' },
            auditor.accessToken,
          ),
          403,
        );
        const initial = ok(await snapshot());
        const context = initial.context;
        assert.deepEqual(
          initial.catalogs.directions
            .filter((row) => row.system)
            .map((row) => row.id),
          ['__common__', '__unassigned__'],
        );
        assert.ok(initial.catalogs.directions.every((row) => !row.canEdit));
        assert.equal(context.permissions.canClose, true);
        assert.equal(context.scopes.length, 1);
      },
    );
    await t.test(
      'catalogs are versioned, unique, and a posted invoice differs from actual cash',
      async () => {
        direction = ok(await catalog('directions', { name: 'Доставка' }));
        account = ok(
          await catalog('accounts', {
            name: 'Расчетный счет',
            type: 'bank',
            number: '40702810000000000001',
          }),
        );
        client = ok(
          await catalog('counterparties', {
            name: 'Клиент',
            inn: '7701234567',
            roles: ['client'],
          }),
        );
        carrier = ok(
          await catalog('counterparties', {
            name: 'Перевозчик',
            inn: '7701234568',
            roles: ['carrier'],
          }),
        );
        ok(
          await catalog('counterparties', { name: 'Дубль', inn: '7701234567' }),
          409,
        );
        ok(
          await catalog('directions', {
            id: direction.id,
            version: 0,
            name: 'Conflict',
          }),
          409,
        );
        opening = ok(
          await post({
            kind: 'opening',
            date: '2026-08-31',
            postings: [
              {
                account: 'cash',
                amountKopecks: 100000,
                cashAccountId: account.id,
              },
              { account: 'equity', amountKopecks: -100000 },
            ],
          }),
          201,
        );
        sale = ok(
          await post({
            kind: 'sale',
            date: '2026-09-05',
            directionId: direction.id,
            counterpartyId: client.id,
            amountKopecks: 10000,
            description: 'Выполненная перевозка',
            dueDate: '2026-10-02',
            source: { system: 'one_c', id: 'sale-1', version: '1' },
          }),
          201,
        );
        expense = ok(
          await post({
            kind: 'expense',
            date: '2026-09-05',
            directionId: direction.id,
            counterpartyId: carrier.id,
            amountKopecks: 7000,
            dueDate: '2026-10-01',
          }),
          201,
        );
        payment = ok(
          await post({
            kind: 'payment_in',
            date: '2026-09-10',
            cashAccountId: account.id,
            counterpartyId: client.id,
            directionId: direction.id,
            amountKopecks: 4000,
            allocations: [{ documentId: sale.id, amountKopecks: 4000 }],
          }),
          201,
        );
        const state = ok(await snapshot('&limit=1'));
        assert.equal(state.operations.items.length, 1);
        assert.equal(state.operations.total, 3);
        assert.equal(state.reports.pnl.profitKopecks, 3000);
        assert.equal(state.reports.cf.openingKopecks, 100000);
        assert.equal(state.reports.cf.inflowKopecks, 4000);
        assert.equal(state.reports.cf.closingKopecks, 104000);
        assert.equal(state.reports.balance.assetsKopecks, 110000);
        assert.equal(state.reports.balance.liabilitiesKopecks, 7000);
        assert.equal(state.reports.balance.equityKopecks, 103000);
        assert.equal(state.reports.balance.differenceKopecks, 0);
        assert.equal(state.reports.receivables[0].remainingKopecks, 6000);
        assert.equal(state.reports.payables[0].remainingKopecks, 7000);
        assert.equal(
          state.calendar.rows.find((row) => row.documentId === sale.id)
            .amountKopecks,
          6000,
        );
        const remainingPlan = ok(
          await catalog('plans', {
            name: 'Согласованный остаток оплаты',
            flow: 'in',
            amountKopecks: 6000,
            documentId: sale.id,
            counterpartyId: client.id,
            directionId: direction.id,
            expectedDate: '2026-10-03',
            status: 'approved',
            settledBaselineKopecks: 999999,
          }),
        );
        assert.equal(remainingPlan.settledBaselineKopecks, 4000);
        assert.equal(
          ok(await snapshot()).calendar.rows.find(
            (row) => row.id === remainingPlan.id,
          ).amountKopecks,
          6000,
        );
        const perDirection = ok(await snapshot(`&directionId=${direction.id}`));
        assert.equal(perDirection.reports.balance.differenceKopecks, 0);
        const common = ok(await snapshot('&directionId=__common__'));
        assert.equal(common.reports.balance.differenceKopecks, 0);
        assert.equal(common.reports.pnl.profitKopecks, 0);
        const detail = ok(
          await request(
            'GET',
            `${base}/operations/${opening.id}`,
            undefined,
            token,
          ),
        );
        assert.equal(detail.kind, 'opening');
      },
    );
    await t.test(
      'retries and sources never create duplicate facts or silently accept changed source versions',
      async () => {
        const body = {
          kind: 'sale',
          date: '2026-09-11',
          counterpartyId: client.id,
          directionId: direction.id,
          amountKopecks: 1000,
          idempotencyKey: randomUUID(),
          source: { system: 'one_c', id: 'retry', version: '1' },
        };
        const first = ok(await post(body), 201),
          retry = ok(await post(body), 201);
        assert.deepEqual(first, retry);
        const sourceRetry = ok(
          await post({ ...body, idempotencyKey: randomUUID() }),
          201,
        );
        assert.equal(sourceRetry.id, first.id);
        ok(await post({ ...body, amountKopecks: 1200 }), 409);
        ok(
          await post({
            ...body,
            idempotencyKey: randomUUID(),
            source: { ...body.source, version: '2' },
          }),
          409,
        );
        ok(
          await post({
            ...body,
            idempotencyKey: randomUUID(),
            source: { system: 'demo_manual', id: 'bad', version: '1' },
          }),
          400,
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS count FROM finance_ledger_operations WHERE source_id='retry'",
            )
          ).rows[0].count,
          1,
        );
      },
    );
    await t.test(
      'settlement is separate from cash and cannot overpay or reverse a referenced invoice',
      async () => {
        const advanceInput = {
          kind: 'customer_advance',
          date: '2026-09-15',
          counterpartyId: client.id,
          cashAccountId: account.id,
          directionId: direction.id,
          amountKopecks: 6000,
          source: { system: 'bank', id: 'advance-retry', version: '1' },
        };
        const advance = ok(await post(advanceInput), 201);
        const body = {
          paymentId: advance.id,
          date: '2026-09-16',
          allocations: [{ documentId: sale.id, amountKopecks: 6000 }],
          idempotencyKey: randomUUID(),
        };
        ok(await request('POST', `${base}/settlements`, body, token), 201);
        assert.equal(ok(await post(advanceInput), 201).id, advance.id);
        ok(
          await request(
            'POST',
            `${base}/settlements`,
            { ...body, idempotencyKey: randomUUID() },
            token,
          ),
          400,
        );
        ok(
          await request(
            'POST',
            `${base}/operations/${sale.id}/reverse`,
            {
              date: '2026-09-20',
              reason: 'Проверка зависимости',
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          409,
        );
        const state = ok(await snapshot());
        assert.equal(
          state.reports.receivables.find((row) => row.id === sale.id)
            .remainingKopecks,
          0,
        );
        assert.equal(state.reports.cf.inflowKopecks, 10000);
      },
    );
    await t.test(
      'imports retain review evidence and commit only explicitly resolved rows',
      async () => {
        const file =
          'date;income;expense;description;source_id\n2026-09-22;100;;Входящий платеж;bank-1\n';
        const preview = ok(
          await request(
            'POST',
            `${base}/imports/preview`,
            {
              fileName: 'statement.csv',
              sourceType: 'bank',
              contentBase64: Buffer.from(file).toString('base64'),
            },
            token,
          ),
          201,
        );
        assert.equal(preview.totalRows, 1);
        assert.equal(preview.rows.length, 1);
        const commit = {
          selectedRows: [1],
          overrides: {
            1: {
              cashAccountId: account.id,
              directionId: direction.id,
              reviewed: true,
            },
          },
          idempotencyKey: randomUUID(),
        };
        const result = ok(
          await request(
            'POST',
            `${base}/imports/${preview.id}/commit`,
            commit,
            token,
          ),
          201,
        );
        assert.equal(result.committedCount, 1);
        assert.deepEqual(
          ok(
            await request(
              'POST',
              `${base}/imports/${preview.id}/commit`,
              commit,
              token,
            ),
            201,
          ),
          result,
        );
        assert.equal(
          ok(
            await request(
              'GET',
              `${base}/imports/${preview.id}?limit=1`,
              undefined,
              token,
            ),
          ).committedRows.length,
          1,
        );
        const suggestions = ok(
          await request(
            'POST',
            `${base}/suggestions`,
            { operationIds: [result.items[0].id] },
            token,
          ),
          201,
        );
        assert.equal(suggestions.applied, false);
        const replacement = ok(
          await request(
            'PATCH',
            `${base}/operations/${result.items[0].id}`,
            {
              version: 1,
              kind: 'payment_in',
              counterpartyId: client.id,
              amountKopecks: 10000,
              description: 'Разобранное поступление',
              idempotencyKey: randomUUID(),
            },
            token,
          ),
        );
        assert.equal(replacement.items[0].kind, 'payment_in');
        assert.equal(replacement.items[0].status, 'confirmed');
        assert.equal(
          ok(await snapshot('&limit=1')).settlements.payments.find(
            (row) => row.id === replacement.items[0].id,
          ).remainingKopecks,
          10000,
        );
        const wrongKind = ok(
          await request(
            'PATCH',
            `${base}/operations/${replacement.items[0].id}`,
            {
              version: 1,
              kind: 'expense',
              counterpartyId: carrier.id,
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          409,
        );
        assert.equal(wrongKind.code, 'FINANCE_CASH_FACT_IMMUTABLE');
        const wrongAccountFile =
          'date;income;own_account;description\n2026-09-23;100;40702810000000000002;Другой собственный счет\n';
        const badPreview = ok(
          await request(
            'POST',
            `${base}/imports/preview`,
            {
              fileName: 'wrong-account.csv',
              sourceType: 'bank',
              contentBase64: Buffer.from(wrongAccountFile).toString('base64'),
            },
            token,
          ),
          201,
        );
        assert.equal(
          ok(
            await request(
              'POST',
              `${base}/imports/${badPreview.id}/commit`,
              {
                selectedRows: [1],
                overrides: { 1: { cashAccountId: account.id, reviewed: true } },
                idempotencyKey: randomUUID(),
              },
              token,
            ),
            409,
          ).code,
          'FINANCE_IMPORT_ACCOUNT_MISMATCH',
        );
        const revisedDocument = {
          schemaVersion: 'finance.import.v1',
          sourceSystem: '1C',
          sourceBaseId: 'link-guard',
          operations: [
            {
              kind: 'sale',
              date: '2026-09-23',
              amountKopecks: 7000,
              counterpartyId: carrier.id,
              source: { id: 'same-amount-opposite-side' },
            },
          ],
        };
        const linkPreview = ok(
          await request(
            'POST',
            `${base}/imports/preview`,
            {
              sourceType: 'one_c',
              fileName: 'link-guard.json',
              contentBase64: Buffer.from(
                JSON.stringify(revisedDocument),
              ).toString('base64'),
            },
            token,
          ),
          201,
        );
        assert.equal(
          ok(
            await request(
              'POST',
              `${base}/imports/${linkPreview.id}/commit`,
              {
                selectedRows: [1],
                overrides: {
                  1: { existingOperationId: expense.id, reviewed: true },
                },
                idempotencyKey: randomUUID(),
              },
              token,
            ),
            409,
          ).code,
          'FINANCE_SOURCE_LINK_MISMATCH',
        );
      },
    );
    await t.test(
      'one bank payment settles another project while restricted readers get balanced private projections',
      async () => {
        const peerScope = randomUUID();
        await db.query(
          'INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',
          [peerScope, ids.project, 'Second accounting scope'],
        );
        await db.query(
          'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)',
          [ids.admin, ids.legal, ids.region, ids.project, peerScope],
        );
        const clientUpdated = ok(
          await catalog('counterparties', {
            id: client.id,
            version: client.version,
            name: client.name,
            inn: client.inn,
            responsibilityScopeIds: [ids.scope, peerScope],
          }),
        );
        client = clientUpdated;
        const peerDirection = ok(
          await catalog('directions', {
            name: 'Межгород',
            responsibilityScopeIds: [peerScope],
          }),
        );
        const invoice = ok(
          await post({
            kind: 'sale',
            date: '2026-09-20',
            responsibilityScopeId: peerScope,
            counterpartyId: client.id,
            directionId: peerDirection.id,
            amountKopecks: 5000,
            description: 'Чужой проект: коммерческая тайна',
          }),
          201,
        );
        const transfer = ok(
          await post({
            kind: 'payment_in',
            date: '2026-09-21',
            cashAccountId: account.id,
            counterpartyId: client.id,
            amountKopecks: 2000,
            description:
              'Полное банковское назначение нельзя раскрывать другому проекту',
            allocations: [{ documentId: invoice.id, amountKopecks: 2000 }],
          }),
          201,
        );
        assert.deepEqual(
          new Set(transfer.relatedScopeIds),
          new Set([ids.scope, peerScope]),
        );
        const restricted = await employee('manager', true, peerScope);
        const view = ok(await snapshot('', restricted.accessToken));
        assert.equal(
          view.reports.receivables.find((row) => row.id === invoice.id)
            .remainingKopecks,
          3000,
        );
        assert.equal(view.reports.balance.differenceKopecks, 0);
        assert.equal(view.context.coverageLabel, 'Доступная часть данных');
        const projected = view.operations.items.find(
          (row) => row.id === transfer.id,
        );
        assert.equal(projected.projected, true);
        assert.equal(projected.amountKopecks, null);
        assert.equal(projected.source, undefined);
        assert.ok(
          !JSON.stringify(view).includes('Полное банковское назначение'),
        );
        ok(
          await request(
            'POST',
            `${base}/operations/${transfer.id}/reverse`,
            {
              date: '2026-09-22',
              reason: 'Недостаточно прав на полную операцию',
              idempotencyKey: randomUUID(),
            },
            restricted.accessToken,
          ),
          403,
        );
        const detail = ok(
          await request(
            'GET',
            `${base}/operations/${transfer.id}`,
            undefined,
            restricted.accessToken,
          ),
        );
        assert.equal(detail.projected, true);
      },
    );
    await t.test(
      'shared directions, reviewed opening imports and reconciliation span own entities without duplicating masters',
      async () => {
        const legal2 = randomUUID(),
          project2 = randomUUID(),
          scope2 = randomUUID();
        await db.query('INSERT INTO legal_entities(id,name) VALUES($1,$2)', [
          legal2,
          'Вторая собственная организация',
        ]);
        await db.query(
          'INSERT INTO projects(id,name,legal_entity_id,region_id) VALUES($1,$2,$3,$4)',
          [project2, 'Доставка второй компании', legal2, ids.region],
        );
        await db.query(
          'INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',
          [scope2, project2, 'Доставка'],
        );
        await db.query(
          'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,true)',
          [ids.admin, legal2, ids.region, project2, scope2],
        );
        client = ok(
          await catalog('counterparties', {
            id: client.id,
            version: client.version,
            responsibilityScopeIds: [...client.responsibilityScopeIds, scope2],
          }),
        );
        direction = ok(
          await catalog('directions', {
            id: direction.id,
            version: direction.version,
            responsibilityScopeIds: [
              ...direction.responsibilityScopeIds,
              scope2,
            ],
          }),
        );
        assert.equal(
          ok(await snapshot(`&legalEntityId=${legal2}`)).catalogs.directions[0]
            .id,
          direction.id,
        );
        const payload = {
          schemaVersion: 'finance.import.v1',
          sourceSystem: '1С',
          sourceBaseId: 'synthetic-own2',
          operations: [
            {
              kind: 'opening',
              date: '2026-08-31',
              source: { id: 'opening' },
              postings: [
                {
                  account: 'fixed_asset',
                  amountKopecks: 5000,
                  directionId: direction.id,
                },
                { account: 'equity', amountKopecks: -5000 },
              ],
            },
          ],
        };
        const preview = ok(
          await request(
            'POST',
            `${base}/imports/preview`,
            {
              legalEntityId: legal2,
              sourceType: 'one_c',
              fileName: 'opening.json',
              contentBase64: Buffer.from(JSON.stringify(payload)).toString(
                'base64',
              ),
            },
            token,
          ),
          201,
        );
        ok(
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
        const invoice = ok(
          await post({
            legalEntityId: legal2,
            responsibilityScopeId: scope2,
            kind: 'sale',
            date: '2026-09-25',
            amountKopecks: 2500,
            directionId: direction.id,
            counterpartyId: client.id,
            status: 'provisional',
          }),
          201,
        );
        const group = ok(await snapshot(`&directionId=${direction.id}`));
        assert.equal(group.reports.pnl.revenueKopecks, 13500);
        assert.equal(group.reports.balance.differenceKopecks, 0);
        const paged = ok(
          await snapshot(
            `&directionId=${direction.id}&debtLimit=1&calendarLimit=1`,
          ),
        );
        assert.equal(paged.reports.receivables.length, 1);
        assert.equal(
          paged.reports.debtPagination.receivables.total,
          group.reports.receivables.length,
        );
        assert.equal(
          paged.reports.debtPagination.receivables.remainingKopecks,
          group.reports.receivables.reduce(
            (total, row) => total + row.remainingKopecks,
            0,
          ),
        );
        assert.equal(
          paged.reports.pnl.revenueKopecks,
          group.reports.pnl.revenueKopecks,
        );
        assert.ok(
          paged.calendar.rows.length <= 1 && paged.calendar.undated.length <= 1,
        );
        const reconciliation = {
          legalEntityId: legal2,
          side: 'receivable',
          from: '2026-09-01',
          to: '2026-09-30',
          counterpartyId: client.id,
          documentIds: [invoice.id],
          externalAmountKopecks: 2500,
          status: 'confirmed',
          sourceReference: 'Сверенный синтетический реестр №1',
          idempotencyKey: randomUUID(),
        };
        const registry = ok(
          await request(
            'POST',
            `${base}/reconciliations`,
            reconciliation,
            token,
          ),
          201,
        );
        assert.equal(registry.stale, false);
        assert.equal(registry.differenceKopecks, 0);
        const confirmed = ok(await snapshot(`&legalEntityId=${legal2}`));
        assert.equal(
          confirmed.reports.receivables.find((row) => row.id === invoice.id)
            .status,
          'confirmed',
        );
        assert.ok(
          !confirmed.controls.some(
            (row) => row.code === 'PROVISIONAL_ACCRUALS',
          ),
        );
        const adjustment = ok(
          await post({
            kind: 'consolidation_adjustment',
            date: '2026-09-26',
            consolidationEntityIds: [ids.legal, legal2],
            reason: 'Синтетическое исключение внутригрупповой прибыли',
            postings: [
              {
                account: 'revenue',
                amountKopecks: 500,
                responsibilityScopeId: ids.scope,
                directionId: direction.id,
              },
              {
                account: 'retained_earnings',
                amountKopecks: -500,
                responsibilityScopeId: scope2,
                directionId: direction.id,
              },
            ],
          }),
          201,
        );
        assert.equal(adjustment.consolidationOnly, true);
        assert.equal(
          ok(await snapshot(`&directionId=${direction.id}`)).reports.pnl
            .revenueKopecks,
          13000,
        );
        assert.equal(
          ok(await snapshot(`&legalEntityId=${legal2}`)).reports.pnl
            .revenueKopecks,
          2500,
        );
        assert.ok(
          !ok(await snapshot('', manager.accessToken)).operations.items.some(
            (row) => row.id === adjustment.id,
          ),
        );
        const native = ok(
          await request(
            'POST',
            `${base}/sources/preview`,
            { legalEntityId: ids.legal, from: '2026-09-01', to: '2026-09-30' },
            token,
          ),
          201,
        );
        assert.equal(native.sourceType, 'native');
        assert.equal(typeof native.totalRows, 'number');
        const fuel = ok(
          await post({
            legalEntityId: legal2,
            responsibilityScopeId: scope2,
            kind: 'fuel_sale',
            date: '2026-09-27',
            counterpartyId: client.id,
            supplierCounterpartyId: client.id,
            directionId: direction.id,
            amountKopecks: 1200,
            costKopecks: 1000,
            status: 'provisional',
          }),
          201,
        );
        ok(
          await request(
            'POST',
            `${base}/reconciliations`,
            {
              ...reconciliation,
              documentIds: [fuel.id],
              externalAmountKopecks: 1200,
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          201,
        );
        const closeFuel = {
          legalEntityId: legal2,
          from: '2026-09-01',
          to: '2026-09-30',
          openingBalancesVerified: true,
          sourcesReconciled: true,
          reason: 'Проверка обеих сторон топливной сделки',
          idempotencyKey: randomUUID(),
        };
        assert.equal(
          ok(
            await request('POST', `${base}/periods/close`, closeFuel, token),
            409,
          ).code,
          'FINANCE_CLOSE_BLOCKED',
        );
        ok(
          await request(
            'POST',
            `${base}/reconciliations`,
            {
              ...reconciliation,
              side: 'payable',
              documentIds: [`${fuel.id}:cost`],
              externalAmountKopecks: 1000,
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          201,
        );
        ok(
          await request('POST', `${base}/periods/close`, closeFuel, token),
          201,
        );
        const tomorrow = new Date(Date.now() + 86400000)
          .toISOString()
          .slice(0, 10);
        for (const plan of [
          {
            legalEntityId: ids.legal,
            responsibilityScopeId: ids.scope,
            flow: 'out',
            amountKopecks: 100000000,
          },
          {
            legalEntityId: legal2,
            responsibilityScopeId: scope2,
            flow: 'in',
            amountKopecks: 200000000,
          },
        ])
          ok(
            await catalog('plans', {
              ...plan,
              name: 'Прогноз отдельного плательщика',
              expectedDate: tomorrow,
              status: 'approved',
            }),
          );
        const calendar = ok(
          await request(
            'GET',
            `${base}?from=2026-09-01&to=2026-09-30&calendarTo=${tomorrow}`,
            undefined,
            token,
          ),
        ).calendar;
        assert.ok(calendar.closingKopecks > 0);
        const deficit = calendar.entityBalances.find(
          (row) => row.legalEntityId === ids.legal,
        );
        assert.ok(deficit.minimumKopecks < 0);
        assert.equal(deficit.firstDeficitDate, tomorrow);
      },
    );
    await t.test(
      'close/reopen, optimistic conflicts, and revoked grants protect immutable history',
      async () => {
        const close = {
          legalEntityId: ids.legal,
          from: '2026-09-01',
          to: '2026-09-30',
          openingBalancesVerified: true,
          sourcesReconciled: true,
          reason: 'Сверено с контрольными документами',
          idempotencyKey: randomUUID(),
        };
        ok(
          await request(
            'POST',
            `${base}/periods/close`,
            close,
            manager.accessToken,
          ),
          403,
        );
        ok(await request('POST', `${base}/periods/close`, close, token), 409);
        account = ok(
          await catalog('accounts', {
            id: account.id,
            version: account.version,
            name: account.name,
            type: 'bank',
            statementDate: '2026-09-30',
            statementBalanceKopecks: 122000,
          }),
        );
        assert.deepEqual(ok(await snapshot()).controls, []);
        const unassigned = ok(
          await post({
            kind: 'expense',
            date: '2026-09-25',
            counterpartyId: carrier.id,
            amountKopecks: 10,
          }),
          201,
        );
        assert.equal(unassigned.directionId, '__unassigned__');
        const unassignedView = ok(
          await snapshot('&directionId=__unassigned__'),
        );
        assert.equal(unassignedView.reports.pnl.profitKopecks, -10);
        assert.ok(
          unassignedView.controls.some(
            (row) => row.code === 'UNASSIGNED_DIRECTION',
          ),
        );
        const blocked = ok(
          await request('POST', `${base}/periods/close`, close, token),
          409,
        );
        assert.match(JSON.stringify(blocked), /направления/);
        ok(
          await request(
            'POST',
            `${base}/operations/${unassigned.id}/reverse`,
            {
              legalEntityId: ids.legal,
              reason: 'Отмена тестового расхода',
              date: '2026-09-25',
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          201,
        );
        assert.deepEqual(ok(await snapshot()).controls, []);
        const closed = ok(
          await request('POST', `${base}/periods/close`, close, token),
          201,
        );
        ok(
          await post({
            kind: 'expense',
            date: '2026-09-25',
            counterpartyId: carrier.id,
            amountKopecks: 10,
          }),
          409,
        );
        const closedPeriod = closed.items[0];
        ok(
          await request(
            'POST',
            `${base}/periods/reopen`,
            {
              id: closedPeriod.id,
              version: 1,
              reason: 'Исправление источника',
              idempotencyKey: randomUUID(),
            },
            token,
          ),
          201,
        );
        const before = ok(await snapshot());
        await fixture.restartApi();
        const after = ok(await snapshot());
        assert.deepEqual(after.reports, before.reports);
        const privileges = (
          await db.query(
            "SELECT has_table_privilege('transport_app','finance_ledger_operations','UPDATE,DELETE') AS operations,has_table_privilege('transport_app','finance_ledger_requests','UPDATE,DELETE') AS requests",
          )
        ).rows[0];
        assert.deepEqual(privileges, { operations: false, requests: false });
        await db.query(
          'UPDATE access_grants SET finance_visible=false WHERE user_id=$1',
          [ids.admin],
        );
        ok(await snapshot(), 403);
        ok(await request('POST', `${base}/periods/close`, close, token), 403);
      },
    );
  },
);
