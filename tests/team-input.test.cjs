'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const input = require('../recovered/apps/api/src/modules/team/team-input');
const { canManage } = require('../recovered/apps/api/src/modules/team/team.service');
const { articleStructure } = require('./team-article-fixtures.cjs');
const conversation = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), kind: 'channel', title: 'Команда', memberIds: [], ...patch });
const message = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), conversationId: randomUUID(), text: 'Текст', ...patch });
const article = (patch = {}) => ({ id: randomUUID(), responsibilityScopeId: randomUUID(), title: 'Инструкция', body: 'Порядок действий', version: 0,
  ...articleStructure('a1234567-89ab-4cde-8fab-123456789abc'), ...patch });
const invalid = operation => assert.throws(operation, error => error.getStatus?.() === 400 && error.getResponse?.().code === 'TEAM_VALIDATION');
test('corporate writes reject forged identity, invalid UUIDs and control characters', () => {
  for (const [parser, factory] of [[input.conversationInput, conversation], [input.messageInput, message], [input.articleInput, article]]) {
    for (const body of [null, [], 'bad', new Date(), Object.create({}), factory({ authorId: randomUUID() }), factory({ responsibilityScopeId: 'bad' }), factory({ id: 'bad' })]) invalid(() => parser(body));
  }
  for (const text of ['', '  ', '\u0000', '\u007f', 'x'.repeat(12001), 42]) invalid(() => input.messageInput(message({ text })));
  const id = randomUUID();
  invalid(() => input.messageInput(message({ id, parentId: id })));
  invalid(() => input.messageInput(message({ parentId: 'bad' })));
  assert.equal(input.messageInput(message({ text: '  Строка 1\nСтрока 2  ' })).text, 'Строка 1\nСтрока 2');
  assert.equal(input.messageInput(message()).parentId, null);
});
test('channels are scope-wide and direct chats require exactly two different members', () => {
  const members = [randomUUID(), randomUUID()];
  assert.deepEqual(input.conversationInput(conversation({ kind: 'direct', title: '', memberIds: members })).memberIds, members.slice().sort());
  for (const memberIds of [undefined, null, [], [members[0]], [...members, randomUUID()], [members[0], members[0]], [members[0], 'bad']]) {
    invalid(() => input.conversationInput(conversation({ kind: 'direct', memberIds })));
  }
  invalid(() => input.conversationInput(conversation({ memberIds: members })));
  invalid(() => input.conversationInput(conversation({ kind: 'private' })));
  invalid(() => input.conversationInput(conversation({ kind: 'direct', title: 0, memberIds: members })));
  invalid(() => input.conversationInput(conversation({ kind: 'direct', title: null, memberIds: members })));
  invalid(() => input.conversationInput(conversation({ title: 'x'.repeat(161) })));
});
test('articles require a valid version, nonblank bounded text and preserve multiline content', () => {
  for (const version of [undefined, null, -1, 1.5, '1', 2147483646, NaN]) invalid(() => input.articleInput(article({ version })));
  for (const patch of [{ body: '' }, { title: '' }, { body: 'x'.repeat(60001) }, { title: 'x'.repeat(201) }, { body: 'bad\u0000' }]) invalid(() => input.articleInput(article(patch)));
  assert.equal(input.articleInput(article({ body: '  A\nB  ', version: 2 })).body, 'A\nB');
});
test('administrator monitoring privileges never survive impersonation', () => {
  assert.equal(canManage({ role: 'access_admin' }), true);
  assert.equal(canManage({ role: 'access_admin', impersonation: { administratorId: randomUUID() } }), false);
  assert.equal(canManage({ role: 'manager' }), false);
});
