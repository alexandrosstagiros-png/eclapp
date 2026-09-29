'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestServer } = require('./local-test-server.cjs');

test(
  'own companies reuse application identities with atomic creation and current administrator rights',
  { timeout: 180000 },
  async (t) => {
    const fixture = await createTestServer();
    t.after(() => fixture.close());
    const { request, devLogin, adminPool: db, ids } = fixture;
    await db.query(
      'UPDATE access_grants SET finance_visible=true WHERE user_id=$1',
      [ids.admin],
    );
    const admin = await devLogin(ids.admin);
    function ok(result, status = 200) {
      assert.equal(result.status, status, JSON.stringify(result.body));
      return result.body;
    }
    const snapshot = (token = admin.accessToken) =>
      request(
        'GET',
        '/finance/ledger?from=2026-09-01&to=2026-09-30',
        undefined,
        token,
      );
    const save = (body, token = admin.accessToken) =>
      request('PUT', '/finance/ledger/companies', body, token);
    const input = (extra = {}) => ({
      name: 'Синтетическое ООО',
      organizationKind: 'legal_entity',
      inn: '7707083893',
      kpp: '770701001',
      fullName: 'Синтетическое общество для тестирования',
      version: 0,
      idempotencyKey: randomUUID(),
      ...extra,
    });
    async function actor(role, finance = true) {
      const id = randomUUID();
      await db.query(
        'INSERT INTO users(id,display_name,role,active,approved) VALUES($1,$2,$3,true,true)',
        [id, 'Synthetic own-company actor', role],
      );
      await db.query(
        'INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,finance_visible) VALUES($1,$2,$3,$4,$5,$6)',
        [id, ids.legal, ids.region, ids.project, ids.scope, finance],
      );
      return { id, ...(await devLogin(id)) };
    }
    const manager = await actor('manager'),
      auditor = await actor('auditor'),
      otherAdmin = await actor('access_admin'),
      noFinance = await actor('access_admin', false);
    let company, originalInput, ownScope;
    const originalCompanies = (
      await db.query('SELECT id,name FROM legal_entities ORDER BY id')
    ).rows;
    await t.test(
      'non-administrators cannot create companies or grant themselves access',
      async () => {
        assert.equal(
          ok(await snapshot()).context.permissions.canManageCompanies,
          true,
        );
        assert.equal(
          ok(await snapshot(manager.accessToken)).context.permissions
            .canManageCompanies,
          false,
        );
        for (const token of [
          manager.accessToken,
          auditor.accessToken,
          noFinance.accessToken,
        ])
          ok(await save(input(), token), 403);
        const impersonated = ok(
          await request(
            'POST',
            '/auth/impersonate',
            { userId: otherAdmin.id },
            admin.accessToken,
          ),
        );
        assert.equal(
          ok(await snapshot(impersonated.accessToken)).context.permissions
            .canManageCompanies,
          false,
        );
        ok(await save(input(), impersonated.accessToken), 403);
        ok(
          await request(
            'POST',
            '/auth/impersonate/stop',
            {},
            impersonated.accessToken,
          ),
        );
        for (const patch of [
          { inn: 'bad' },
          { inn: '0000000000' },
          { name: ' ' },
          { organizationKind: 'invented' },
          {
            organizationKind: 'sole_proprietor',
            inn: '500100732259',
            kpp: '770701001',
          },
        ])
          ok(await save(input(patch)), 400);
        assert.deepEqual(
          (await db.query('SELECT id,name FROM legal_entities ORDER BY id'))
            .rows,
          originalCompanies,
        );
      },
    );
    await t.test(
      'create yields a usable company without manual region/project choices and retries cannot duplicate it',
      async () => {
        originalInput = input({ name: '  Синтетическое ООО  ' });
        company = ok(await save(originalInput));
        assert.equal(company.name, 'Синтетическое ООО');
        assert.equal(company.inn, originalInput.inn);
        assert.equal(company.version, 1);
        const retried = ok(await save(originalInput));
        assert.equal(retried.id, company.id);
        const view = ok(await snapshot());
        const saved = view.context.legalEntities.find(
          (row) => row.id === company.id,
        );
        assert.equal(saved.fullName, originalInput.fullName);
        assert.equal(saved.complete, true);
        assert.equal(saved.canEdit, true);
        const scopes = view.context.scopes.filter(
          (row) => row.legalEntityId === company.id,
        );
        assert.equal(scopes.length, 1);
        ownScope = scopes[0];
        assert.equal(ownScope.regionId, ids.region);
        const grants = (
          await db.query(
            'SELECT user_id,finance_visible FROM access_grants WHERE legal_entity_id=$1',
            [company.id],
          )
        ).rows;
        assert.deepEqual(grants, [
          { user_id: ids.admin, finance_visible: true },
        ]);
        assert.ok(
          !ok(
            await snapshot(otherAdmin.accessToken),
          ).context.legalEntities.some((row) => row.id === company.id),
        );
        const old = (
          await db.query(
            'SELECT id,name FROM legal_entities WHERE id=ANY($1::uuid[]) ORDER BY id',
            [originalCompanies.map((row) => row.id)],
          )
        ).rows;
        assert.deepEqual(old, originalCompanies);
        ok(await save({ ...originalInput, name: 'Changed retry' }), 409);
        ok(await save(input()), 409);
      },
    );
    await t.test(
      'existing finance account and operations use the created company immediately',
      async () => {
        const account = ok(
          await request(
            'PUT',
            '/finance/ledger/catalogs/accounts',
            {
              name: 'Синтетическая касса',
              type: 'cash',
              legalEntityId: company.id,
              version: 0,
              idempotencyKey: randomUUID(),
            },
            admin.accessToken,
          ),
        );
        const operation = ok(
          await request(
            'POST',
            '/finance/ledger/operations',
            {
              kind: 'capital_in',
              date: '2026-09-29',
              legalEntityId: company.id,
              cashAccountId: account.id,
              amountKopecks: 10000,
              idempotencyKey: randomUUID(),
            },
            admin.accessToken,
          ),
          201,
        );
        assert.equal(operation.legalEntityId, company.id);
        assert.equal(
          operation.responsibilityScopeId,
          ownScope.responsibilityScopeId,
        );
        const view = ok(
          await request(
            'GET',
            `/finance/ledger?from=2026-09-01&to=2026-09-30&legalEntityId=${company.id}`,
            undefined,
            admin.accessToken,
          ),
        );
        assert.equal(view.reports.cf.closingKopecks, 10000);
        assert.equal(view.reports.balance.differenceKopecks, 0);
      },
    );
    await t.test(
      'edits preserve identity, require full current rights and record audit with optimistic conflict detection',
      async () => {
        const patch = input({
          id: company.id,
          version: company.version,
          name: 'Синтетическая компания — обновлена',
          address: 'Тестовый адрес',
        });
        ok(await save(patch, otherAdmin.accessToken), 404);
        const partialScope = randomUUID();
        await db.query(
          'INSERT INTO responsibility_scopes(id,project_id,name) VALUES($1,$2,$3)',
          [partialScope, ownScope.projectId, 'Synthetic other scope'],
        );
        assert.equal(
          ok(await snapshot()).context.legalEntities.find(
            (row) => row.id === company.id,
          ).canEdit,
          false,
        );
        const partial = await save(patch);
        assert.ok(
          [403, 404].includes(partial.status),
          JSON.stringify(partial.body),
        );
        await db.query('DELETE FROM responsibility_scopes WHERE id=$1', [
          partialScope,
        ]);
        const updated = ok(await save(patch));
        assert.equal(updated.id, company.id);
        assert.equal(updated.version, 2);
        assert.equal(updated.address, 'Тестовый адрес');
        assert.equal(ok(await save(patch)).id, company.id);
        ok(await save({ ...patch, idempotencyKey: randomUUID() }), 409);
        assert.equal(
          (
            await db.query(
              'SELECT legal_entity_id FROM finance_ledger_operations WHERE legal_entity_id=$1',
              [company.id],
            )
          ).rowCount,
          1,
        );
        const events = (
          await db.query(
            "SELECT payload FROM audit_events WHERE payload->>'entityId'=$1 AND payload->>'action' LIKE '%company.%' ORDER BY sequence",
            [company.id],
          )
        ).rows;
        assert.equal(events.length, 2);
        company = updated;
      },
    );
    await t.test(
      'individual entrepreneurs have no KPP and simultaneous duplicate INNs create only one company',
      async () => {
        const body = input({
          organizationKind: 'sole_proprietor',
          name: 'Синтетический ИП',
          inn: '500100732259',
          kpp: null,
          ogrn: '304500116000157',
        });
        const responses = await Promise.all([
          save(body),
          save({ ...body, idempotencyKey: randomUUID() }),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const created = responses.find((r) => r.status === 200).body;
        assert.equal(created.organizationKind, 'sole_proprietor');
        assert.equal(created.kpp, null);
        const otherDuplicate = ok(
          await save(
            { ...body, idempotencyKey: randomUUID() },
            otherAdmin.accessToken,
          ),
          409,
        );
        assert.ok(!JSON.stringify(otherDuplicate).includes(created.id));
      },
    );
    await t.test(
      'failure after company insert rolls back its identity, scope and grant; revoked rights also revoke retry access',
      async () => {
        const before = (
          await db.query(
            'SELECT (SELECT count(*) FROM legal_entities)::int companies,(SELECT count(*) FROM projects)::int projects,(SELECT count(*) FROM responsibility_scopes)::int scopes,(SELECT count(*) FROM access_grants)::int grants',
          )
        ).rows[0];
        await db.query(
          "CREATE FUNCTION finance_company_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic company grant failure'; END; $$; CREATE TRIGGER finance_company_test_fail BEFORE INSERT ON access_grants FOR EACH ROW EXECUTE FUNCTION finance_company_test_fail()",
        );
        try {
          ok(
            await save(
              input({ inn: '7702070139', name: 'Synthetic rollback' }),
            ),
            500,
          );
        } finally {
          await db.query(
            'DROP TRIGGER finance_company_test_fail ON access_grants; DROP FUNCTION finance_company_test_fail()',
          );
        }
        const after = (
          await db.query(
            'SELECT (SELECT count(*) FROM legal_entities)::int companies,(SELECT count(*) FROM projects)::int projects,(SELECT count(*) FROM responsibility_scopes)::int scopes,(SELECT count(*) FROM access_grants)::int grants',
          )
        ).rows[0];
        assert.deepEqual(after, before);
        await db.query(
          'DELETE FROM access_grants WHERE user_id=$1 AND legal_entity_id=$2',
          [ids.admin, company.id],
        );
        ok(await save(originalInput), 404);
        ok(
          await save(input({ id: company.id, version: company.version })),
          404,
        );
        await db.query(
          'UPDATE access_grants SET finance_visible=false WHERE user_id=$1',
          [ids.admin],
        );
        ok(await save(input({ inn: '7702070139' })), 403);
      },
    );
  },
);
