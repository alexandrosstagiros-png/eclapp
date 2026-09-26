'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Complete public API input for a new manual article. Imports and legacy edits
// deliberately keep their own payloads so their compatibility stays covered.
function articleStructure(positionId) {
  return {
    reason: 'Повторяющиеся вопросы о порядке работы.',
    purpose: 'Объяснить сотрудникам последовательность действий.',
    result: 'Сотрудник выполняет работу по согласованной инструкции.',
    audiencePositionIds: [positionId],
  };
}

async function createArticlePosition(fixture, administrator, scopeId = fixture.ids.scope) {
  const id = randomUUID();
  const response = await fixture.request('PUT', `/team/organization/positions/${id}`, {
    responsibilityScopeId: scopeId,
    operationId: randomUUID(),
    version: 0,
    title: `Сотрудник по инструкциям ${id.slice(0, 8)}`,
  }, administrator.accessToken);
  assert.ok([200, 201].includes(response.status), `Article audience fixture: HTTP ${response.status} ${JSON.stringify(response.body)}`);
  assert.equal(response.body.id, id);
  return id;
}

module.exports = { articleStructure, createArticlePosition };
