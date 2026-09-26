'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { messageInput, mentionsInput, attachmentsInput, MAX_KNOWLEDGE_FILE_BYTES } = require('../recovered/apps/api/src/modules/team/team-input');
const { articleImportInput } = require('../recovered/apps/api/src/modules/team/team-knowledge-input');
const invalid = fn => assert.throws(fn, error => error.getStatus?.() === 400 && error.getResponse?.().code === 'TEAM_VALIDATION');

test('explicit mention IDs exactly match visible tokens, normalize ordering and preserve @all intent', () => {
  const [alice, bob] = [randomUUID(), randomUUID()];
  assert.deepEqual(mentionsInput(undefined, 'Привет!'), { userIds: [], all: false });
  assert.deepEqual(mentionsInput({ userIds: [bob, alice], all: true }, `@[Алиса](user:${alice}) @[Боб](user:${bob}) @all!`), { userIds: [alice, bob].sort(), all: true });
  assert.deepEqual(mentionsInput({ userIds: [alice], all: false }, `@[Алиса](user:${alice}) @[Алиса](user:${alice})`), { userIds: [alice], all: false });
  for (const [value, text] of [[{ userIds: [alice], all: false }, 'Без упоминания'], [{ userIds: [], all: false }, `@[Алиса](user:${alice})`],
    [{ userIds: [alice, alice], all: false }, `@[Алиса](user:${alice})`], [{ userIds: [], all: false }, '@all'], [{ userIds: [], all: true }, 'Без упоминания'],
    [null, 'Текст'], [{ userIds: ['bad'], all: false }, 'Текст'], [{ userIds: [], all: false, targets: [bob] }, 'Текст']]) invalid(() => mentionsInput(value, text));
  invalid(() => messageInput({ id: randomUUID(), responsibilityScopeId: randomUUID(), conversationId: randomUUID(), text: '', mentions: { userIds: [], all: true } }));
  invalid(() => mentionsInput({ userIds: [alice], all: false }, `@[ ](user:${alice})`));
});

test('knowledge originals retain their 8 MiB limit while chat uploads allow more', () => {
  const file = { filename: 'Original.bin', mimeType: 'application/octet-stream', contentBase64: Buffer.alloc(MAX_KNOWLEDGE_FILE_BYTES + 1).toString('base64') };
  assert.equal(attachmentsInput([{ ...file, id: randomUUID() }])[0].byteSize, MAX_KNOWLEDGE_FILE_BYTES + 1);
  invalid(() => articleImportInput({ responsibilityScopeIds: [randomUUID()], visibility: 'scope', sourcePath: file.filename, folderPath: '', sourceArchive: 'files.zip', title: 'Оригинал', body: 'Текст', file }));
});
