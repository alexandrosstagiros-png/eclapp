// Present one workspace while keeping every request inside its original access scope.
const unique = (rows, key = "id") => [...new Map(rows.map(row => [row[key], row])).values()];
const lists = {
  "/team/tasks": "tasks", "/team/organization": "people", "/team/outcomes": "reports",
  "/team/summaries": "summaries", "/team/schedules": "schedules",
  "/communications/driver-requests": "items", "/fleet-operations": "records",
  "/development": "tickets",
};

// All workspace instances share a paced queue. Concurrency alone still sends a
// burst when requests finish quickly; nginx limits requests per second as well.
export function createCompanyReadScheduler({ intervalMs = 300, maxConcurrent = 3, maxRetries = 3, retryDelayMs = 1000 } = {}) {
  const queue = [], flights = new WeakMap();
  let active = 0, nextStart = 0, blockedUntil = 0, timer;
  const aborted = () => new DOMException("The operation was aborted", "AbortError");
  function forget(job) { if (job.cache.get(job.key) === job) job.cache.delete(job.key); }
  function finish(job, error, result) {
    forget(job);
    for (const subscriber of job.subscribers) {
      subscriber.cleanup();
      error ? subscriber.reject(error) : subscriber.resolve(result);
    }
    job.subscribers.clear();
  }
  function pump() {
    clearTimeout(timer);
    while (queue.length && !queue[0].subscribers.size) queue.shift();
    if (!queue.length || active >= maxConcurrent) return;
    const delay = Math.max(nextStart, blockedUntil) - Date.now();
    if (delay > 0) { timer = setTimeout(pump, delay); return; }
    const job = queue.shift();
    active++;
    nextStart = Date.now() + intervalMs;
    Promise.resolve().then(() => job.request(job.path, { ...job.options, signal: job.controller.signal }, job.token)).then(
      result => finish(job, null, result),
      error => {
        if (error?.status === 429 && job.subscribers.size && job.retries < maxRetries) {
          const retryAfter = Number(error.retryAfterMs);
          const delay = Math.max(retryDelayMs * 2 ** job.retries++, Number.isFinite(retryAfter) ? Math.min(60000, Math.max(0, retryAfter)) : 0);
          blockedUntil = Math.max(blockedUntil, Date.now() + delay);
          queue.push(job);
        } else finish(job, error);
      },
    ).finally(() => { active--; pump(); });
    pump();
  }
  return function schedule(request, path, options = {}, token) {
    const { signal, ...requestOptions } = options;
    if (signal?.aborted) return Promise.reject(aborted());
    let cache = flights.get(request);
    if (!cache) flights.set(request, cache = new Map());
    // Credentials and options are part of the key; responses never cross accounts.
    const key = JSON.stringify([token, path, requestOptions]);
    let job = cache.get(key), fresh = false;
    if (!job) {
      fresh = true;
      job = { request, path, options: requestOptions, token, key, cache, controller: new AbortController(), subscribers: new Set(), retries: 0 };
      cache.set(key, job);
    }
    const result = new Promise((resolve, reject) => {
      const cancel = () => {
        subscriber.cleanup(); job.subscribers.delete(subscriber); reject(aborted());
        if (!job.subscribers.size) { forget(job); job.controller.abort(); pump(); }
      };
      const subscriber = { resolve, reject, cleanup: () => signal?.removeEventListener("abort", cancel) };
      job.subscribers.add(subscriber);
      signal?.addEventListener("abort", cancel, { once: true });
    });
    if (fresh) { queue.push(job); pump(); }
    return result;
  };
}
export const scheduleCompanyRead = createCompanyReadScheduler();

export function createCompanyWorkRequest(request, getScopes) {
  const recordScopes = new Map(), organizations = new Map(), reportPeople = new Map();
  const scopedPath = (path, scopeId) => {
    const url = new URL(path, "http://workspace.local");
    url.searchParams.set("responsibilityScopeId", scopeId);
    return url.pathname + url.search;
  };
  const remember = (row, scopeId) => {
    if (!row || typeof row !== "object") return row;
    if (row.id) recordScopes.set(row.id, scopeId);
    return { ...row, responsibilityScopeId: scopeId };
  };
  return async function companyRequest(path, options = {}, token) {
    const url = new URL(path, "http://workspace.local"), method = options.method || "GET";
    const scopes = [...new Set(getScopes().map(scope => typeof scope === "string" ? scope : scope.responsibilityScopeId).filter(Boolean))];
    const read = (nextPath, nextOptions = options) => scheduleCompanyRead(request, nextPath, nextOptions, token);
    if (!scopes.length) return method === "GET" ? read(path) : request(path, options, token);
    const property = lists[url.pathname];
    if (method === "GET" && property) {
      const results = await Promise.all(scopes.map(async scopeId => {
        let nextPath = scopedPath(path, scopeId), result, rows = [], seen = new Set();
        do {
          result = await read(nextPath);
          if (Array.isArray(result[property])) rows.push(...result[property].map(row => remember(row, scopeId)));
          const cursor = result.nextBefore || result.nextCursor;
          if (!cursor || seen.has(cursor)) break;
          seen.add(cursor);
          const next = new URL(scopedPath(path, scopeId), "http://workspace.local");
          next.searchParams.set(result.nextCursor ? "cursor" : "before", cursor);
          nextPath = next.pathname + next.search;
        } while (true);
        if (url.pathname === "/team/organization") organizations.set(scopeId, result);
        if (property === "reports") rows = rows.map(row => {
          reportPeople.set(row.id, result.people || []);
          return { ...row, eligiblePeople: result.people || [] };
        });
        return { ...result, ...(Array.isArray(result[property]) ? { [property]: rows } : {}), responsibilityScopeId: scopeId };
      }));
      const merged = { ...results[0], hasMore: false, nextBefore: null, nextCursor: null };
      if (property === "records") {
        merged.records = Object.fromEntries(Object.keys(results[0].records).map(kind => [kind,
          unique(results.flatMap(result => (result.records[kind] || []).map(row => remember(row, result.responsibilityScopeId))))]));
        for (const key of ["stock", "maintenance", "events", "drivers"])
          merged[key] = results.flatMap(result => (result[key] || []).map(row => remember(row, result.responsibilityScopeId)));
        const drivers = merged.drivers;
        merged.drivers = unique(drivers).map(row => ({ ...row, responsibilityScopeIds: drivers.filter(person => person.id === row.id).map(person => person.responsibilityScopeId) }));
      } else merged[property] = unique(results.flatMap(result => result[property] || []));
      if (property === "people") {
        // Prefer the employee's existing organization assignment to an empty membership.
        merged.people = unique(results.flatMap(result => result.people || []).sort((a, b) =>
          Number(Boolean(a.managerId || a.positionId || a.version)) - Number(Boolean(b.managerId || b.positionId || b.version))));
        for (const person of merged.people) recordScopes.set(person.id, person.responsibilityScopeId);
        merged.positions = unique(results.flatMap(result => (result.positions || []).map(row => remember(row, result.responsibilityScopeId))));
        merged.assignableIds = [...new Set(results.flatMap(result => result.assignableIds || []))];
        merged.byScope = Object.fromEntries(results.map(result => [result.responsibilityScopeId, result]));
      }
      if (property === "reports") {
        merged.people = unique(results.flatMap(result => result.people || []));
        merged.periods = unique(results.flatMap(result => result.periods || []), "start").sort((a, b) => b.start.localeCompare(a.start));
        merged.ownReportId = results.find(result => result.ownReportId)?.ownReportId || null;
      }
      if (results.some(result => result.canManage)) merged.canManage = true;
      if (["tasks", "items", "summaries", "tickets"].includes(property)) merged[property].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
      return merged;
    }
    const body = options.body ? JSON.parse(options.body) : null;
    const id = /^\/team\/(?:tasks|outcomes|summaries|schedules)\/([^/]+)/.exec(url.pathname)?.[1]
      || /^\/team\/organization\/(?:employees|positions)\/([^/]+)/.exec(url.pathname)?.[1]
      || /^\/fleet-operations\/[^/]+\/([^/]+)\/(?:action|[^/]+)$/.exec(url.pathname)?.[1]
      || body?.id;
    let scopeId = recordScopes.get(id);
    if (!scopeId && body?.assigneeId) scopeId = scopes.find(value => organizations.get(value)?.assignableIds?.includes(body.assigneeId));
    if (!scopeId && body) scopeId = [body.vehicleId, body.contractorId, body.partId, body.warehouseId].map(value => recordScopes.get(value)).find(Boolean);
    scopeId ||= body?.responsibilityScopeId || url.searchParams.get("responsibilityScopeId") || scopes[0];
    if (!scopes.includes(scopeId)) throw Object.assign(new Error("Рабочие данные больше недоступны. Обновите страницу."), { status: 403 });
    if (url.searchParams.has("responsibilityScopeId")) url.searchParams.set("responsibilityScopeId", scopeId);
    const nextOptions = body ? { ...options, body: JSON.stringify({ ...body, responsibilityScopeId: scopeId }) } : options;
    let result;
    if (method === "GET" && id && !recordScopes.has(id)) {
      // A task opened from a notification may not have appeared in a list yet.
      const candidates = [scopeId, ...scopes.filter(value => value !== scopeId)];
      for (const [index, candidate] of candidates.entries()) {
        try { result = await read(scopedPath(path, candidate)); scopeId = candidate; break; }
        catch (error) { if (![403, 404].includes(error.status) || index === candidates.length - 1) throw error; }
      }
    } else result = method === "GET" ? await read(url.pathname + url.search, nextOptions) : await request(url.pathname + url.search, nextOptions, token);
    return result?.id ? { ...remember(result, scopeId), ...(reportPeople.has(result.id) ? { eligiblePeople: reportPeople.get(result.id) } : {}) } : result;
  };
}
