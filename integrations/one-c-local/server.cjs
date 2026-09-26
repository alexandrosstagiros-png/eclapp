'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { readSnapshot } = require('./adapter.cjs');
const { ensureSource } = require('./manage.cjs');
const { recoverSnapshot } = require('./recovery.cjs');
const ROOT = path.resolve(__dirname, '../..');
const DATA = path.join(ROOT, '.local/one-c-local');
const PORT = 18414;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let snapshot, pending;
const shutdown = new AbortController();

async function refresh() {
  if (!pending) pending = (async () => {
    const next = await recoverSnapshot({ ensureSource, readSnapshot: ({ signal }) => readSnapshot(fetch, { signal }), signal: shutdown.signal });
    await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(DATA, 'latest.json.tmp'), JSON.stringify(next, null, 2), { mode: 0o600 });
    await fs.rename(path.join(DATA, 'latest.json.tmp'), path.join(DATA, 'latest.json'));
    snapshot = next;
    return next;
  })().finally(() => { pending = null; });
  return pending;
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
  if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) return json(res, 403, { error: 'Доступ только с этого Mac.' });
  if (req.headers.origin && ![ORIGIN, `http://localhost:${PORT}`].includes(req.headers.origin)) return json(res, 403, { error: 'Запрос с другого сайта запрещён.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Запрос с другого сайта запрещён.' });
  const url = new URL(req.url, ORIGIN);
  try {
    if (req.method === 'GET' && url.pathname === '/api/one-c/snapshot') return json(res, 200, await refresh());
    if (req.method === 'POST' && url.pathname === '/api/one-c/refresh') {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Требуется JSON.' });
      let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1024) return json(res, 413, { error: 'Слишком большой запрос.' }); }
      return json(res, 200, await refresh());
    }
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', source: 'local1c', fetchedAt: snapshot?.fetchedAt ?? null });
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, type] = files[url.pathname];
      const bytes = await fs.readFile(path.join(__dirname, 'public', file));
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(bytes);
    }
    return json(res, 404, { error: 'Не найдено.' });
  } catch (error) { return json(res, 503, { error: error.message, fetchedAt: snapshot?.fetchedAt ?? null }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Локальный тест 1С: ${ORIGIN}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { shutdown.abort(); server.close(); server.closeAllConnections(); });
