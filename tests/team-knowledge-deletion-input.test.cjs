'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { articleDeletionInput } = require('../recovered/apps/api/src/modules/team/team-knowledge-input');

const request = (patch = {}) => ({
  responsibilityScopeId: 'a1234567-89ab-4cde-8fab-123456789abc',
  operationId: 'b1234567-89ab-4cde-8fab-123456789abc',
  version: 1,
  ...patch,
});
const invalid = body => assert.throws(
  () => articleDeletionInput(body),
  error => error.getStatus?.() === 400,
);

test('article deletion normalizes UUIDs and accepts the bounded positive version range', () => {
  const body = request();
  assert.deepEqual(articleDeletionInput(body), body);
  assert.deepEqual(articleDeletionInput({
    ...body,
    responsibilityScopeId: body.responsibilityScopeId.toUpperCase(),
    operationId: body.operationId.toUpperCase(),
  }), body);
  const maximum = request({ version: 2147483645 });
  assert.deepEqual(articleDeletionInput(maximum), maximum);
});

test('article deletion rejects missing or malformed scope, operation and version', () => {
  for (const key of ['responsibilityScopeId', 'operationId', 'version']) {
    const body = request();
    delete body[key];
    invalid(body);
  }
  for (const key of ['responsibilityScopeId', 'operationId']) {
    for (const value of [undefined, null, '', 'bad', 1, {}, [], ' a1234567-89ab-4cde-8fab-123456789abc']) {
      invalid(request({ [key]: value }));
    }
  }
  for (const version of [undefined, null, 0, -1, 1.5, '1', true, false, NaN, Infinity, -Infinity, 2147483646, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    invalid(request({ version }));
  }
  for (const body of [undefined, null, [], '', 1, true]) invalid(body);
});

test('article deletion rejects client-supplied identity, deletion metadata and unknown fields', () => {
  for (const patch of [
    { id: request().operationId },
    { articleId: request().operationId },
    { userId: request().operationId },
    { authorId: request().operationId },
    { deletedBy: request().operationId },
    { deletedAt: '2026-09-25T10:00:00Z' },
    { title: 'Подмена названия' },
    { body: 'Подмена текста' },
    { visibility: 'admin' },
    { force: true },
    { unexpected: undefined },
  ]) invalid(request(patch));
});
