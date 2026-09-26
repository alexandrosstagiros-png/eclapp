const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = '../recovered/apps/office-web/src/company-work-request.js';

test('development loads every ticket page across scopes in newest-first order', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const calls = [];
  const request = createCompanyWorkRequest(async path => {
    const url = new URL(path, 'http://test');
    const scope = url.searchParams.get('responsibilityScopeId');
    calls.push([scope, url.searchParams.get('before')]);
    if (scope === 'second') return { tickets: [{ id: 'second-ticket', updatedAt: '2026-09-25' }], hasMore: false, nextBefore: null };
    if (!url.searchParams.has('before')) return { tickets: [{ id: 'first-ticket', updatedAt: '2026-09-26' }], hasMore: true, nextBefore: 'first-ticket' };
    return { tickets: [{ id: 'older-ticket', updatedAt: '2026-09-24' }], hasMore: false, nextBefore: null };
  }, () => ['first', 'second']);
  const result = await request('/development');
  assert.deepEqual(result.tickets.map(row => [row.id, row.responsibilityScopeId]), [
    ['first-ticket', 'first'], ['second-ticket', 'second'], ['older-ticket', 'first'],
  ]);
  assert.ok(calls.some(([scope, cursor]) => scope === 'first' && cursor === 'first-ticket'));
  assert.equal(calls.length, 3);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextBefore, null);
});

test('notification detail tries all authorized scopes when the initial scope is last', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const calls = [];
  const request = createCompanyWorkRequest(async path => {
    const scope = new URL(path, 'http://test').searchParams.get('responsibilityScopeId'); calls.push(scope);
    if (scope === 'second') throw Object.assign(new Error('Not found'), { status: 404 });
    return { id: 'notification-task' };
  }, () => ['first', 'second']);
  const result = await request('/team/tasks/notification-task?responsibilityScopeId=second');
  assert.deepEqual(calls, ['second', 'first']);
  assert.equal(result.responsibilityScopeId, 'first');
});

test('company lists include later scopes and pages; mutations retain the source scope', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const calls = [];
  const request = createCompanyWorkRequest(async (path, options) => {
    const url = new URL(path, 'http://test');
    const scope = url.searchParams.get('responsibilityScopeId');
    if (options.method) { calls.push(JSON.parse(options.body)); return { id: 'task-b', version: 2 }; }
    if (scope === 'first') return { tasks: [], hasMore: false };
    if (!url.searchParams.has('before')) return { tasks: [{ id: 'task-b' }], hasMore: true, nextBefore: 'task-b' };
    return { tasks: [{ id: 'task-c' }], hasMore: false };
  }, () => ['first', 'second']);
  const result = await request('/team/tasks?responsibilityScopeId=first');
  assert.deepEqual(result.tasks.map(row => [row.id, row.responsibilityScopeId]), [['task-b', 'second'], ['task-c', 'second']]);
  assert.equal(result.hasMore, false);
  const updated = await request('/team/tasks/task-b/status', { method: 'PUT', body: JSON.stringify({ responsibilityScopeId: 'first', status: 'done' }) });
  assert.equal(calls[0].responsibilityScopeId, 'second');
  assert.equal(updated.responsibilityScopeId, 'second');
});

test('new tasks route through the assignee organization and revoked scopes remain inaccessible', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  let scopes = ['first', 'second'];
  let saved;
  const request = createCompanyWorkRequest(async (path, options) => {
    if (options.method) { saved = JSON.parse(options.body); return { id: 'new-task' }; }
    const scope = new URL(path, 'http://test').searchParams.get('responsibilityScopeId');
    return { people: scope === 'second' ? [{ id: 'person' }] : [], positions: [], assignableIds: scope === 'second' ? ['person'] : [], canManage: true };
  }, () => scopes);
  await request('/team/organization?responsibilityScopeId=first');
  await request('/team/tasks', { method: 'POST', body: JSON.stringify({ id: 'new-task', assigneeId: 'person', responsibilityScopeId: 'first' }) });
  assert.equal(saved.responsibilityScopeId, 'second');
  scopes = ['first'];
  await assert.rejects(request('/team/tasks/new-task/status', { method: 'PUT', body: JSON.stringify({ responsibilityScopeId: 'first' }) }), error => error.status === 403);
});

test('fleet cards and actions preserve the original scope and route new orders from their vehicle', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const saved = [];
  const request = createCompanyWorkRequest(async (path, options) => {
    if (options.method) { saved.push(JSON.parse(options.body)); return { id: 'order-b' }; }
    const scope = new URL(path, 'http://test').searchParams.get('responsibilityScopeId');
    return { records: { vehicles: scope === 'second' ? [{ id: 'vehicle-b' }] : [], orders: scope === 'second' ? [{ id: 'order-b' }] : [] }, stock: [], maintenance: [], events: [], drivers: [] };
  }, () => ['first', 'second']);
  await request('/fleet-operations?responsibilityScopeId=first');
  await request('/fleet-operations/orders/order-b/action', { method: 'POST', body: JSON.stringify({ responsibilityScopeId: 'first' }) });
  await request('/fleet-operations/orders', { method: 'PUT', body: JSON.stringify({ id: 'new-order', vehicleId: 'vehicle-b', responsibilityScopeId: 'first' }) });
  assert.deepEqual(saved.map(value => value.responsibilityScopeId), ['second', 'second']);
});

test('a new fleet catalog entry retains the scope selected through its service vehicle', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const calls = [];
  const request = createCompanyWorkRequest(async (path, options) => {
    calls.push(JSON.parse(options.body));
    return { id: calls.at(-1).id, version: 1 };
  }, () => ['first', 'second']);
  for (const kind of ['contractors', 'parts', 'warehouses']) {
    await request(`/fleet-operations/${kind}`, { method: 'PUT', body: JSON.stringify({ id: kind, responsibilityScopeId: 'second', name: kind }) });
  }
  assert.deepEqual(calls.map(value => value.responsibilityScopeId), ['second', 'second', 'second']);
  await assert.rejects(request('/fleet-operations/parts', { method: 'PUT', body: JSON.stringify({ id: 'forbidden', responsibilityScopeId: 'revoked' }) }), error => error.status === 403);
});

test('separate workspace instances share pacing and duplicate in-flight reads', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const starts = [];
  const raw = async path => {
    starts.push({ path, time: Date.now() });
    await new Promise(resolve => setTimeout(resolve, 30));
    const scope = new URL(path, 'http://test').searchParams.get('responsibilityScopeId');
    return { tasks: [{ id: scope }] };
  };
  const first = createCompanyWorkRequest(raw, () => ['a', 'b']);
  const second = createCompanyWorkRequest(raw, () => ['b', 'c']);
  const results = await Promise.all([first('/team/tasks', {}, 'same-account'), second('/team/tasks', {}, 'same-account')]);
  assert.deepEqual(results.map(result => result.tasks.map(row => row.id)), [['a', 'b'], ['b', 'c']]);
  assert.equal(starts.length, 3, 'shared scope b is read only once');
  for (let index = 1; index < starts.length; index++) assert.ok(starts[index].time - starts[index - 1].time >= 280, 'requests are paced across both instances');
});

test('a forty-scope workspace stays within a proxy request budget', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const arrivals = [];
  const request = createCompanyWorkRequest(async path => {
    const now = Date.now();
    arrivals.push(now);
    // A strict rolling-window proxy is more restrictive than the deployed
    // 5 r/s + burst=30 nginx bucket; this used to reject the initial fan-out.
    if (arrivals.filter(time => now - time < 1000).length > 5) throw Object.assign(new Error('proxy rate limit'), { status: 429 });
    const scope = new URL(path, 'http://test').searchParams.get('responsibilityScopeId');
    return { tasks: [{ id: scope }] };
  }, () => Array.from({ length: 40 }, (_, index) => `scope-${index}`));
  const result = await request('/team/tasks');
  assert.equal(result.tasks.length, 40);
  assert.equal(arrivals.length, 40, 'the normal multi-scope load needs no rate-limit retries');
});

test('rate limits back off the shared queue and stop retrying after a bounded number of attempts', async () => {
  const { createCompanyReadScheduler } = await import(modulePath);
  const schedule = createCompanyReadScheduler({ intervalMs: 5, maxConcurrent: 1, maxRetries: 2, retryDelayMs: 25 });
  const starts = [], attempts = new Map();
  const raw = async path => {
    starts.push({ path, time: Date.now() });
    const count = (attempts.get(path) || 0) + 1; attempts.set(path, count);
    if (path === '/retry' && count === 1 || path === '/always-limited') throw Object.assign(new Error('limited'), { status: 429 });
    return { path };
  };
  const values = await Promise.all([schedule(raw, '/retry'), schedule(raw, '/other')]);
  assert.deepEqual(values, [{ path: '/retry' }, { path: '/other' }]);
  assert.ok(starts[1].time - starts[0].time >= 20, 'a 429 delays other queued reads too');
  await assert.rejects(schedule(raw, '/always-limited'), error => error.status === 429);
  assert.equal(attempts.get('/always-limited'), 3);
});

test('cancelling one deduplicated reader preserves the other and credentials never share a flight', async () => {
  const { createCompanyReadScheduler } = await import(modulePath);
  const schedule = createCompanyReadScheduler({ intervalMs: 5, maxConcurrent: 2 });
  const calls = [];
  const raw = async (path, options, token) => {
    calls.push({ token, signal: options.signal });
    await new Promise(resolve => setTimeout(resolve, 25));
    return token;
  };
  const cancelled = new AbortController();
  const first = schedule(raw, '/private', { signal: cancelled.signal }, 'one');
  const second = schedule(raw, '/private', {}, 'one');
  const anotherAccount = schedule(raw, '/private', {}, 'two');
  const rejected = assert.rejects(first, error => error.name === 'AbortError');
  cancelled.abort();
  await rejected;
  assert.deepEqual(await Promise.all([second, anotherAccount]), ['one', 'two']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal.aborted, false);
});

test('aborted queued reads never reach the network and concurrency stays bounded', async () => {
  const { createCompanyReadScheduler } = await import(modulePath);
  const schedule = createCompanyReadScheduler({ intervalMs: 5, maxConcurrent: 1 });
  const calls = []; let release;
  const raw = path => { calls.push(path); return new Promise(resolve => { release = resolve; }); };
  const first = schedule(raw, '/active');
  await Promise.resolve();
  const controller = new AbortController();
  const second = schedule(raw, '/cancelled', { signal: controller.signal });
  const rejected = assert.rejects(second, error => error.name === 'AbortError');
  controller.abort(); await rejected;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(calls, ['/active']);
  release('done'); assert.equal(await first, 'done');
  assert.deepEqual(calls, ['/active']);
});

test('development workspaces include every page in every scope', async () => {
  const { createCompanyWorkRequest } = await import(modulePath);
  const request = createCompanyWorkRequest(async path => {
    const url = new URL(path, 'http://test'), scope = url.searchParams.get('responsibilityScopeId');
    if (url.searchParams.has('before')) return { tickets: [{ id: `${scope}-old`, updatedAt: '2026-01-01' }] };
    return { tickets: [{ id: `${scope}-new`, updatedAt: '2026-02-01' }], nextBefore: `${scope}-new`, hasMore: true };
  }, () => ['a', 'b']);
  const result = await request('/development');
  assert.equal(result.tickets.length, 4);
  assert.deepEqual(result.tickets.map(row => row.id), ['a-new', 'b-new', 'a-old', 'b-old']);
  assert.equal(result.hasMore, false);
});
