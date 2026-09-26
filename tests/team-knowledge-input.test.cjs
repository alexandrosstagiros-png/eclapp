'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { articleImportInput, articleImportId } = require('../recovered/apps/api/src/modules/team/team-knowledge-input');
const request = (patch = {}) => ({ responsibilityScopeIds: [randomUUID()], visibility: 'scope', sourcePath: 'Документы/Правила.docx', folderPath: 'Документы',
  title: 'Правила', body: 'Текст документа', sourceArchive: 'documents.zip', file: { filename: 'Правила.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contentBase64: 'ZmlsZQ==' }, ...patch });
const invalid = body => assert.throws(() => articleImportInput(body), error => error.getStatus?.() === 400 && error.getResponse?.().code === 'TEAM_VALIDATION');

test('knowledge import normalizes paths and source names and computes immutable source hashes', () => {
  const body = request();
  body.sourcePath = 'Документы/  cafe\u0301.docx';
  body.file.filename = '  café.docx';
  const parsed = articleImportInput(body);
  assert.equal(parsed.sourcePath, 'Документы/café.docx');
  assert.equal(parsed.file.filename, 'café.docx');
  assert.equal(parsed.file.content.toString(), 'file');
  assert.equal(parsed.file.byteSize, 4);
  assert.equal(parsed.bodySha256, createHash('sha256').update(body.body).digest('hex'));
  assert.equal(parsed.file.sha256, createHash('sha256').update('file').digest('hex'));
  const root = request({ folderPath: '', sourcePath: 'Правила.docx' });
  assert.equal(articleImportInput(root).folderPath, '');
});

test('knowledge import IDs remain stable for a scope and path while separating destinations and files', () => {
  const scope = randomUUID();
  const id = articleImportId(scope, 'Документы/Правила.docx');
  assert.equal(id, articleImportId(scope, 'Документы/Правила.docx'));
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.notEqual(id, articleImportId(randomUUID(), 'Документы/Правила.docx'));
  assert.notEqual(id, articleImportId(scope, 'Другие/Правила.docx'));
});

test('knowledge import rejects traversal, mismatched metadata, duplicate scopes and unknown fields', () => {
  for (const patch of [{ responsibilityScopeIds: [] }, { responsibilityScopeIds: ['bad'] }, { responsibilityScopeIds: Array.from({ length: 101 }, () => randomUUID()) },
    { visibility: 'public' }, { visibility: undefined }, { folderPath: 'Другая папка' }, { sourcePath: '/Документы/Правила.docx' },
    { sourcePath: '../Правила.docx', folderPath: '..' }, { sourcePath: 'Документы//Правила.docx' }, { sourcePath: 'Документы\\Правила.docx' },
    { sourcePath: 'Документы/Другой.docx' }, { sourceArchive: '../archive.zip' }, { sourceArchive: 'bad\nname.zip' },
    { title: '' }, { body: '' }, { title: 'a'.repeat(201) }, { body: 'a'.repeat(60001) }, { filename: 'forged.docx' }]) invalid(request(patch));
  const duplicate = randomUUID();
  invalid(request({ responsibilityScopeIds: [duplicate, duplicate] }));
  for (const patch of [{ contentBase64: 'Zh==' }, { filename: '../secret' }, { mimeType: 'text/html; charset=utf-8' }, { sha256: 'forged' }, { id: randomUUID() }]) {
    const body = request();
    Object.assign(body.file, patch);
    invalid(body);
  }
});
