'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { articleInput } = require('../recovered/apps/api/src/modules/team/team-input');
const { knowledgeArticleKey } = require('../recovered/apps/api/src/modules/team/team-knowledge-deduplication');
const input = () => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), version: 0, title: 'Тема', body: 'Текст',
  reason: 'Причина', purpose: 'Задача', result: 'Результат', audiencePositionIds: [randomUUID()] });

test('structured article metadata is bounded and complete and cannot supply author/editor/date/version state', () => {
  const base = input();
  assert.equal(articleInput({ ...base, reason: ' Причина\nсоздания ' }).reason, 'Причина\nсоздания');
  assert.equal(articleInput(base).structured, true);
  for (const field of ['reason', 'purpose', 'result']) for (const value of [undefined, null, '', ' ', 'x'.repeat(4001), 'bad\u0000'])
    assert.throws(() => articleInput({ ...base, [field]: value }), error => error.getStatus?.() === 400);
  for (const audiencePositionIds of [undefined, null, [], ['invalid'], [base.audiencePositionIds[0], base.audiencePositionIds[0]], Array.from({ length: 101 }, randomUUID)])
    assert.throws(() => articleInput({ ...base, audiencePositionIds }), error => error.getStatus?.() === 400);
  for (const field of ['authorId', 'authorName', 'updatedById', 'updatedByName', 'createdAt', 'updatedAt', 'structured', 'audiencePositions'])
    assert.throws(() => articleInput({ ...base, [field]: field }), error => error.getStatus?.() === 400);
  const legacy = { id: base.id, responsibilityScopeId: base.responsibilityScopeId, version: 1, title: base.title, body: base.body };
  assert.equal(articleInput(legacy).structured, false, 'existing legacy edits can omit the new metadata');
  assert.throws(() => articleInput({ ...legacy, reason: 'Partial conversion' }), error => error.getStatus?.() === 400);
});

test('exact imported-copy matching includes every structured section and the audience snapshot', () => {
  const base = { ...input(), structured: true, folderPath: 'Папка', visibility: 'staff', sourceFile: { sha256: 'a'.repeat(64), filename: 'file.txt', mimeType: 'text/plain' },
    audiencePositions: [{ id: randomUUID(), title: 'Менеджер' }] };
  const key = knowledgeArticleKey(base);
  for (const patch of [{ structured: false }, { reason: 'Другая причина' }, { purpose: 'Другая задача' }, { result: 'Другой результат' },
    { audiencePositions: [{ id: randomUUID(), title: 'Менеджер' }] }, { audiencePositions: [{ ...base.audiencePositions[0], title: 'Диспетчер' }] }])
    assert.notEqual(knowledgeArticleKey({ ...base, ...patch }), key);
  assert.equal(knowledgeArticleKey({ ...base, version: 9, authorId: randomUUID(), createdAt: new Date().toISOString() }), key);
});
