// Integration tests for collect.php: runs it under `php -S` and inspects the SQLite file.
// Requires PHP 8 with pdo_sqlite. Skips (exit 0) when PHP is not installed.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

if (spawnSync('php', ['-v']).status !== 0) {
  console.log('php not found: skipping collector tests')
  process.exit(0)
}

const { DatabaseSync } = await import('node:sqlite')
let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  console.log(`ok ${passed} - ${name}`)
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyux-collector-'))
  fs.copyFileSync(path.join(root, 'collect.php'), path.join(dir, 'collect.php'))
  return dir
}

async function serve(dir, env = {}) {
  const port = 18000 + Math.floor(Math.random() * 2000)
  const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', dir], { env: { ...process.env, ...env }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/collect.php`, { method: 'GET' })
      break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  return { url: `http://127.0.0.1:${port}/collect.php`, host: `127.0.0.1:${port}`, stop: () => proc.kill() }
}

function payload(overrides = {}) {
  return {
    app_id: 'acme-app',
    client_id: '0b0c3f2e-1111-4a8b-9c1d-000000000001',
    session_id: '0b0c3f2e-2222-4a8b-9c1d-000000000002',
    ts: 1781230000,
    meta: { url: 'https://app.example.com/pricing', v: '0.2.0' },
    events: [
      { id: '7d3f0e2a-0000-4000-8000-000000000001', type: 'page_view', ts: 1781230000, meta: { url: 'https://app.example.com/pricing' } },
      { id: '7d3f0e2a-0000-4000-8000-000000000002', type: 'heatmap_point', ts: 1781230001, meta: { x_pct: 52, y_pct: 34, path: '/pricing' } }
    ],
    surveys: [
      { id: '7d3f0e2a-0000-4000-8000-0000000000aa', survey_id: 'pricing-clarity', type: 'yesno', response: { value: true }, ts: 1781230002, context: {} }
    ],
    ...overrides
  }
}

function db(dir) {
  return new DatabaseSync(path.join(dir, 'tinyux-data', 'tinyux.db'))
}

await test('creates the database in a protected data folder and stores a batch', async () => {
  const dir = sandbox()
  const srv = await serve(dir)
  try {
    const res = await fetch(srv.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
    assert.equal(res.status, 204)
    assert.ok(fs.existsSync(path.join(dir, 'tinyux-data', '.htaccess')))
    const d = db(dir)
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM events').get().n, 2)
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM surveys').get().n, 1)
    assert.equal(d.prepare('PRAGMA user_version').get().user_version, 2)
    d.close()
  } finally {
    srv.stop()
  }
})

await test('retried payloads are deduplicated by event and survey id', async () => {
  const dir = sandbox()
  const srv = await serve(dir)
  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(srv.url, { method: 'POST', body: JSON.stringify(payload()) })
      assert.equal(res.status, 204)
    }
    const d = db(dir)
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM events').get().n, 2)
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM surveys').get().n, 1)
    d.close()
  } finally {
    srv.stop()
  }
})

await test('accepts sendBeacon-style text/plain bodies', async () => {
  const dir = sandbox()
  const srv = await serve(dir)
  try {
    const res = await fetch(srv.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload()) })
    assert.equal(res.status, 204)
  } finally {
    srv.stop()
  }
})

await test('rejects cross-origin posts unless the origin is allowlisted', async () => {
  const dir = sandbox()
  const srv = await serve(dir)
  try {
    const foreign = await fetch(srv.url, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: JSON.stringify(payload()) })
    assert.equal(foreign.status, 403)
    const same = await fetch(srv.url, { method: 'POST', headers: { Origin: `http://${srv.host}` }, body: JSON.stringify(payload()) })
    assert.equal(same.status, 204)
  } finally {
    srv.stop()
  }
})

await test('the request log never contains IP addresses', async () => {
  const dir = sandbox()
  const srv = await serve(dir)
  try {
    await fetch(srv.url, { method: 'POST', body: JSON.stringify(payload()) })
    const log = fs.readFileSync(path.join(dir, 'tinyux-data', 'tinyux.log'), 'utf8')
    assert.match(log, /ingest ok/)
    assert.doesNotMatch(log, /127\.0\.0\.1/)
    assert.doesNotMatch(log, /"ip"/)
  } finally {
    srv.stop()
  }
})

await test('upgrades a v0.1 database in place and keeps using it', async () => {
  const dir = sandbox()
  const legacy = new DatabaseSync(path.join(dir, 'tinyux.db'))
  legacy.exec(`
    CREATE TABLE ux_apps (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT NOT NULL UNIQUE, config TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE clients (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL UNIQUE, first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')), meta TEXT);
    CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, client_id INTEGER NOT NULL, started_at TEXT NOT NULL DEFAULT (datetime('now')), ended_at TEXT, meta TEXT, UNIQUE(session_id, client_id));
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT NOT NULL, client_id INTEGER NOT NULL, session_id INTEGER, event_type TEXT NOT NULL, event_ts INTEGER NOT NULL, event_meta TEXT, received_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE surveys (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT NOT NULL, client_id INTEGER NOT NULL, session_id INTEGER, survey_id TEXT NOT NULL, survey_type TEXT, response TEXT, context TEXT, submitted_at TEXT NOT NULL DEFAULT (datetime('now')), processed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE failed_payloads (id INTEGER PRIMARY KEY AUTOINCREMENT, raw_payload TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now')), retries INTEGER NOT NULL DEFAULT 0);
    INSERT INTO clients (client_id) VALUES ('old-client');
    INSERT INTO events (app_id, client_id, event_type, event_ts) VALUES ('acme-app', 1, 'page_view', 1700000000);
  `)
  legacy.close()
  const srv = await serve(dir)
  try {
    const res = await fetch(srv.url, { method: 'POST', body: JSON.stringify(payload()) })
    assert.equal(res.status, 204)
    assert.equal(fs.existsSync(path.join(dir, 'tinyux-data', 'tinyux.db')), false, 'keeps writing to the v0.1 file until it is moved')
    const d = new DatabaseSync(path.join(dir, 'tinyux.db'))
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM events').get().n, 3)
    assert.ok(d.prepare('PRAGMA table_info(events)').all().some((c) => c.name === 'event_uid'))
    d.close()
  } finally {
    srv.stop()
  }
  const check = spawnSync('php', [path.join(dir, 'collect.php'), '--check'], { encoding: 'utf8' })
  assert.equal(check.status, 1)
  assert.match(check.stdout, /sits next to collect\.php/)
})

await test('--prune deletes rows older than the retention window', async () => {
  const dir = sandbox()
  const srv = await serve(dir)
  try {
    await fetch(srv.url, { method: 'POST', body: JSON.stringify(payload()) })
  } finally {
    srv.stop()
  }
  const d = db(dir)
  d.exec(`UPDATE events SET received_at = datetime('now', '-500 days') WHERE event_type = 'page_view'`)
  d.close()
  const out = spawnSync('php', [path.join(dir, 'collect.php'), '--prune', '--days=395'], { encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  const d2 = db(dir)
  assert.deepEqual(d2.prepare('SELECT event_type FROM events').all().map((r) => r.event_type), ['heatmap_point'])
  d2.close()
})

await test('schema.sql matches the schema embedded in collect.php', async () => {
  const php = fs.readFileSync(path.join(root, 'collect.php'), 'utf8')
  const sql = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8')
  const block = (name) => php.match(new RegExp(`${name} = <<<'SQL'\\n([\\s\\S]*?)\\nSQL;`))[1].trim()
  assert.ok(sql.includes(block('TINYUX_SCHEMA_TABLES')))
  assert.ok(sql.includes(block('TINYUX_SCHEMA_INDEXES')))
})

console.log(`\n${passed} collector tests passed`)
