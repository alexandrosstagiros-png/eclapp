'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { channelManagementInput } = require('../recovered/apps/api/src/modules/team/team-input');

test('channel management requires an explicit versioned operation and rejects injected state', () => {
  const base = { responsibilityScopeId: randomUUID(), operationId: randomUUID(), version: 1 };
  const invalid = fn => assert.throws(fn, error => error.getStatus?.() === 400);
  for (const action of ['archive', 'restore', 'delete']) assert.equal(channelManagementInput({ ...base, action }, 'lifecycle').action, action);
  for (const direction of ['up', 'down']) assert.equal(channelManagementInput({ ...base, direction }, 'order').direction, direction);
  for (const [type, field] of [['lifecycle', { action: 'archive' }], ['order', { direction: 'up' }]]) {
    for (const patch of [{ version: 0 }, { version: -1 }, { version: '1' }, { version: 1.5 }, { version: 2147483646 }, { version: undefined }, { operationId: 'invalid' }, { operationId: undefined }, { responsibilityScopeId: 'invalid' }, { sortOrder: 1 }, { memberIds: [] }, { archivedAt: new Date().toISOString() }, { deletedAt: null }, { userId: randomUUID() }]) {
      invalid(() => channelManagementInput({ ...base, ...field, ...patch }, type));
    }
  }
  for (const action of [undefined, null, 'remove', '', 1]) invalid(() => channelManagementInput({ ...base, action }, 'lifecycle'));
  for (const direction of [undefined, null, 'first', '', 1]) invalid(() => channelManagementInput({ ...base, direction }, 'order'));
  invalid(() => channelManagementInput({ ...base, action: 'delete', direction: 'up' }, 'lifecycle'));
  invalid(() => channelManagementInput({ ...base, action: 'delete', direction: 'up' }, 'order'));
});

test('drag reordering requires a versioned target and rejects mixed movement instructions', () => {
  const base = { responsibilityScopeId: randomUUID(), operationId: randomUUID(), version: 2, targetId: randomUUID(), targetVersion: 3, placement: 'before' };
  const invalid = body => assert.throws(() => channelManagementInput(body, 'order'), error => error.getStatus?.() === 400);
  for (const placement of ['before', 'after']) assert.deepEqual(channelManagementInput({ ...base, placement }, 'order'), { ...base, placement });
  assert.equal(channelManagementInput({ ...base, targetId: base.targetId.toUpperCase() }, 'order').targetId, base.targetId);
  for (const patch of [{ targetVersion: 0 }, { targetVersion: -1 }, { targetVersion: '3' }, { targetVersion: 1.5 }, { targetVersion: 2147483646 }, { targetVersion: undefined },
    { targetId: undefined }, { targetId: 'invalid' }, { placement: undefined }, { placement: 'up' }, { placement: null }, { direction: 'up' }, { direction: undefined },
    { sortOrder: 1 }, { targetResponsibilityScopeId: randomUUID() }]) invalid({ ...base, ...patch });
  const directional = { responsibilityScopeId: base.responsibilityScopeId, operationId: base.operationId, version: 2, direction: 'down' };
  for (const field of ['targetId', 'targetVersion', 'placement']) invalid({ ...directional, [field]: base[field] });
  assert.throws(() => channelManagementInput({ ...base, action: 'archive' }, 'lifecycle'), error => error.getStatus?.() === 400);
});
