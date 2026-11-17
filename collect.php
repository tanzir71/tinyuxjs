<?php
declare(strict_types=1);

/*
  tinyux collect.php v0.2.0 — single-file ingestion endpoint (PHP + SQLite)

  Deploy this file next to tinyux.js. On the first request it creates (or migrates)
  the SQLite database in ./tinyux-data/ and drops a deny-all .htaccess there.
  On nginx, block that folder yourself, or point TINYUX_DB_PATH outside the web root.

  Configuration (edit below or use environment variables):
  - TINYUX_DB_PATH / TINYUX_LOG_PATH / TINYUX_DATA_DIR: where data lives
  - $ALLOWED_ORIGINS: empty = same-origin only; add origins (or '*') for cross-origin apps
  - $API_KEY_ALLOWLIST: optional X-API-KEY allowlist (sendBeacon cannot set custom headers)
  - $RATE_LIMIT_PER_MINUTE: soft per-IP limit (IPs are hashed in the limiter, never stored)
  - $CAPTURE_REQUEST_META: optional hashed-IP / user-agent capture, off by default
  - TINYUX_IP_SALT: required before hashed IPs are captured

  CLI:
    php collect.php --check            print configuration warnings
    php collect.php --retry            re-ingest stored failed payloads
    php collect.php --prune [--days=N] delete rows older than N days (default 395)

  Payload contract: https://tanzir71.github.io/tinyuxjs/llms.txt
  - Events and survey answers carry ids; duplicates (retries) are ignored.
*/

// --- Config ---
$DATA_DIR = getenv('TINYUX_DATA_DIR') ?: (__DIR__ . DIRECTORY_SEPARATOR . 'tinyux-data');
$DB_PATH = getenv('TINYUX_DB_PATH') ?: '';
$LOG_PATH = getenv('TINYUX_LOG_PATH') ?: '';

$ALLOWED_ORIGINS = [
  // 'https://app.example.com',
  // 'http://localhost:5173',
  // '*',
];

$API_KEY_ALLOWLIST = [
  // 'replace-with-a-long-random-key',
];

$REQUIRE_API_KEY = false;

$MAX_BODY_BYTES = 256 * 1024; // 256KB
$RATE_LIMIT_PER_MINUTE = 120; // soft, per IP
$CAPTURE_REQUEST_META = false;
$HASH_IP_WITH_SALT = true;
$IP_HASH_SALT = getenv('TINYUX_IP_SALT') ?: 'change-me';
$CAPTURE_USER_AGENT = false;
$LOG_REQUESTS = true; // logs app id and counts only, never IP addresses
$RETENTION_DAYS = 395; // ~13 months, used by --prune

// --- Schema (kept identical to schema.sql) ---
const TINYUX_SCHEMA_VERSION = 2;

const TINYUX_SCHEMA_TABLES = <<<'SQL'
CREATE TABLE IF NOT EXISTS ux_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL UNIQUE,
  config TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL UNIQUE,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  meta TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  client_id INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  meta TEXT,
  UNIQUE(session_id, client_id),
  FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  client_id INTEGER NOT NULL,
  session_id INTEGER,
  event_uid TEXT,
  event_type TEXT NOT NULL,
  event_ts INTEGER NOT NULL,
  event_meta TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  client_id INTEGER NOT NULL,
  session_id INTEGER,
  survey_uid TEXT,
  survey_id TEXT NOT NULL,
  survey_type TEXT,
  response TEXT,
  context TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS failed_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  retries INTEGER NOT NULL DEFAULT 0
);
SQL;

const TINYUX_SCHEMA_INDEXES = <<<'SQL'
CREATE INDEX IF NOT EXISTS idx_events_app_ts ON events(app_id, event_ts);
CREATE INDEX IF NOT EXISTS idx_events_app_client_type ON events(app_id, client_id, event_type);
CREATE INDEX IF NOT EXISTS idx_surveys_app_survey_ts ON surveys(app_id, survey_id, submitted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_uid ON events(app_id, event_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_uid ON surveys(app_id, survey_uid);
SQL;

// --- Helpers ---
function tinyux_resolve_paths(string $dataDir, string $db, string $log): array {
  if ($db === '') {
    $legacy = __DIR__ . DIRECTORY_SEPARATOR . 'tinyux.db';
    $fresh = rtrim($dataDir, '/\\') . DIRECTORY_SEPARATOR . 'tinyux.db';
    // v0.1 kept tinyux.db next to collect.php: keep using it until it is moved.
    $db = (is_file($legacy) && !is_file($fresh)) ? $legacy : $fresh;
  }
  if ($log === '') $log = dirname($db) . DIRECTORY_SEPARATOR . 'tinyux.log';
  return [$db, $log];
}

function tinyux_prepare_dir(string $dbPath): void {
  $dir = dirname($dbPath);
  if (!is_dir($dir)) @mkdir($dir, 0750, true);
  if (!is_dir($dir) || realpath($dir) === realpath(__DIR__)) return;
  $ht = $dir . DIRECTORY_SEPARATOR . '.htaccess';
  if (!is_file($ht)) {
    @file_put_contents($ht, "# tinyux data: never serve these files\nRequire all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
  }
  $index = $dir . DIRECTORY_SEPARATOR . 'index.html';
  if (!is_file($index)) @file_put_contents($index, '');
}

function tinyux_log(string $path, string $level, string $msg, array $ctx = []): void {
  $line = date('c') . " [$level] " . $msg;
  if ($ctx) {
    $json = json_encode($ctx, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json !== false) $line .= ' ' . $json;
  }
  $line .= "\n";
  @file_put_contents($path, $line, FILE_APPEND);
}

function tinyux_header(string $name): string {
  $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
  if (isset($_SERVER[$key])) return (string)$_SERVER[$key];
  if (function_exists('getallheaders')) {
    $h = getallheaders();
    foreach ($h as $k => $v) {
      if (strcasecmp((string)$k, $name) === 0) return (string)$v;
    }
  }
  return '';
}

/* Empty allowlist = same-origin only. Requests without an Origin header are allowed. */
function tinyux_origin_allowed(array $allowedOrigins): bool {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin === '') return true;
  if (in_array('*', $allowedOrigins, true) || in_array($origin, $allowedOrigins, true)) return true;
  if ($origin === 'null') return false;
  $host = (string)parse_url($origin, PHP_URL_HOST);
  $port = parse_url($origin, PHP_URL_PORT);
  $originHost = $host . ($port ? ':' . $port : '');
  return $originHost !== '' && strcasecmp($originHost, (string)($_SERVER['HTTP_HOST'] ?? '')) === 0;
}

function tinyux_cors(array $allowedOrigins): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin === '') return;
  if (in_array('*', $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: *');
  } elseif (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
  } else {
    return;
  }
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, X-API-KEY');
  header('Access-Control-Max-Age: 600');
}

function tinyux_json_text($v): ?string {
  if ($v === null) return null;
  $json = json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  if ($json === false) return null;
  return $json;
}

function tinyux_is_valid_id(string $s, int $maxLen = 80): bool {
  if ($s === '' || strlen($s) > $maxLen) return false;
  return (bool)preg_match('/^[a-zA-Z0-9._:-]+$/', $s);
}

function tinyux_uid($v): ?string {
  if (!is_string($v)) return null;
  return tinyux_is_valid_id($v, 120) ? $v : null;
}

function tinyux_rate_limit_ok(string $ip, int $limitPerMinute, string $salt): bool {
  if ($limitPerMinute <= 0) return true;
  $bucket = (int)floor(time() / 60);
  // The limiter key is a hash: raw IPs never touch the disk.
  $key = 'tinyux_rl_' . substr(hash('sha256', $salt . '|' . $ip), 0, 24) . '_' . $bucket;

  if (function_exists('apcu_fetch') && ini_get('apc.enabled')) {
    $val = apcu_fetch($key);
    if ($val === false) {
      apcu_add($key, 1, 65);
      return true;
    }
    $next = apcu_inc($key, 1);
    return $next <= $limitPerMinute;
  }

  $path = sys_get_temp_dir() . DIRECTORY_SEPARATOR . $key;
  $fp = @fopen($path, 'c+');
  if (!$fp) return true;
  try {
    @flock($fp, LOCK_EX);
    $data = stream_get_contents($fp);
    $n = 0;
    if ($data !== false && $data !== '') $n = (int)trim($data);
    $n++;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string)$n);
    fflush($fp);
    @flock($fp, LOCK_UN);
    fclose($fp);
    return $n <= $limitPerMinute;
  } catch (Throwable $e) {
    @flock($fp, LOCK_UN);
    @fclose($fp);
    return true;
  }
}

function tinyux_pdo(string $dbPath): PDO {
  tinyux_prepare_dir($dbPath);
  $pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  $pdo->exec('PRAGMA busy_timeout=3000;');
  $pdo->exec('PRAGMA journal_mode=WAL;');
  $pdo->exec('PRAGMA synchronous=NORMAL;');
  $pdo->exec('PRAGMA foreign_keys=ON;');
  tinyux_migrate($pdo);
  return $pdo;
}

/* Creates the schema on first use and upgrades v0.1 databases in place. */
function tinyux_migrate(PDO $pdo): void {
  $version = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
  if ($version >= TINYUX_SCHEMA_VERSION) return;
  $pdo->exec(TINYUX_SCHEMA_TABLES);
  $columns = function (string $table) use ($pdo): array {
    return array_map(function ($r) { return $r['name']; }, $pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll());
  };
  if (!in_array('event_uid', $columns('events'), true)) $pdo->exec('ALTER TABLE events ADD COLUMN event_uid TEXT');
  if (!in_array('survey_uid', $columns('surveys'), true)) $pdo->exec('ALTER TABLE surveys ADD COLUMN survey_uid TEXT');
  $pdo->exec(TINYUX_SCHEMA_INDEXES);
  $pdo->exec('PRAGMA user_version = ' . TINYUX_SCHEMA_VERSION);
}

function tinyux_store_failed(PDO $pdo, string $rawPayload, string $logPath, string $why): void {
  try {
    $st = $pdo->prepare('INSERT INTO failed_payloads (raw_payload, received_at, retries) VALUES (:raw, datetime(\'now\'), 0)');
    $st->execute([':raw' => $rawPayload]);
  } catch (Throwable $e) {
    tinyux_log($logPath, 'ERROR', 'failed_payloads insert failed', ['why' => $why, 'err' => $e->getMessage()]);
  }
}

function tinyux_payload_meta(array $payload): ?array {
  $meta = $payload['meta'] ?? null;
  $out = is_array($meta) ? $meta : [];
  $user = $payload['user'] ?? null;
  if (is_array($user)) {
    $out['user'] = $user;
  }
  return empty($out) ? null : $out;
}

function tinyux_request_meta(bool $capture, bool $hashIp, string $salt, bool $captureUserAgent): array {
  if (!$capture) return [];
  $out = [];
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  if ($ip !== '') {
    if ($hashIp) {
      // Refuse to hash with the placeholder salt: those hashes are trivially reversible.
      if ($salt !== '' && $salt !== 'change-me') $out['ip_hash'] = hash_hmac('sha256', $ip, $salt);
    } else {
      $out['ip'] = $ip;
    }
  }
  if ($captureUserAgent) {
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if ($ua !== '') $out['user_agent'] = substr((string)$ua, 0, 500);
  }
  return $out;
}

function tinyux_merge_request_meta(?array $meta, array $requestMeta): ?array {
  if (empty($requestMeta)) return $meta;
  $out = is_array($meta) ? $meta : [];
  $out['request'] = $requestMeta;
  return $out;
}

/* Writes one payload in one transaction. Returns [events inserted, surveys inserted, duplicates skipped]. */
function tinyux_ingest(PDO $pdo, array $payload, ?array $meta): array {
  $appId = (string)($payload['app_id'] ?? '');
  $clientUid = (string)($payload['client_id'] ?? '');
  $sessionUid = (string)($payload['session_id'] ?? '');
  if (!tinyux_is_valid_id($appId, 120) || !tinyux_is_valid_id($clientUid, 120) || ($sessionUid !== '' && !tinyux_is_valid_id($sessionUid, 120))) {
    throw new InvalidArgumentException('invalid ids');
  }
  $events = $payload['events'] ?? [];
  $surveys = $payload['surveys'] ?? [];
  if (!is_array($events)) $events = [];
  if (!is_array($surveys)) $surveys = [];

  $evCount = 0;
  $svCount = 0;
  $dupes = 0;
  $metaJson = tinyux_json_text($meta);

  $pdo->beginTransaction();
  try {
    $pdo->prepare('INSERT OR IGNORE INTO ux_apps (app_id, config, created_at) VALUES (?, NULL, datetime(\'now\'))')->execute([$appId]);

    $stSelClient = $pdo->prepare('SELECT id FROM clients WHERE client_id = ?');
    $stSelClient->execute([$clientUid]);
    $clientRow = $stSelClient->fetch();
    if ($clientRow) {
      $clientId = (int)$clientRow['id'];
      $pdo->prepare('UPDATE clients SET last_seen = datetime(\'now\'), meta = COALESCE(?, meta) WHERE id = ?')->execute([$metaJson, $clientId]);
    } else {
      $pdo->prepare('INSERT INTO clients (client_id, first_seen, last_seen, meta) VALUES (?, datetime(\'now\'), datetime(\'now\'), ?)')->execute([$clientUid, $metaJson]);
      $clientId = (int)$pdo->lastInsertId();
    }

    $sessionId = null;
    if ($sessionUid !== '') {
      $stSelSess = $pdo->prepare('SELECT id FROM sessions WHERE session_id = ? AND client_id = ?');
      $stSelSess->execute([$sessionUid, $clientId]);
      $sessRow = $stSelSess->fetch();
      if ($sessRow) {
        $sessionId = (int)$sessRow['id'];
        $pdo->prepare('UPDATE sessions SET meta = COALESCE(?, meta) WHERE id = ?')->execute([$metaJson, $sessionId]);
      } else {
        $pdo->prepare('INSERT INTO sessions (session_id, client_id, started_at, ended_at, meta) VALUES (?, ?, datetime(\'now\'), NULL, ?)')->execute([$sessionUid, $clientId, $metaJson]);
        $sessionId = (int)$pdo->lastInsertId();
      }
    }

    $stEv = $pdo->prepare('INSERT OR IGNORE INTO events (app_id, client_id, session_id, event_uid, event_type, event_ts, event_meta, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))');
    foreach ($events as $ev) {
      if (!is_array($ev)) continue;
      $type = (string)($ev['type'] ?? 'event');
      if ($type === '') $type = 'event';
      if (strlen($type) > 80) $type = substr($type, 0, 80);
      $ts = (int)($ev['ts'] ?? ($payload['ts'] ?? time()));
      $stEv->execute([$appId, $clientId, $sessionId, tinyux_uid($ev['id'] ?? null), $type, $ts, tinyux_json_text($ev['meta'] ?? null)]);
      if ($stEv->rowCount() > 0) $evCount++;
      else $dupes++;
    }

    $stSv = $pdo->prepare('INSERT OR IGNORE INTO surveys (app_id, client_id, session_id, survey_uid, survey_id, survey_type, response, context, submitted_at, processed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), 0)');
    foreach ($surveys as $sv) {
      if (!is_array($sv)) continue;
      $sid = (string)($sv['survey_id'] ?? '');
      if ($sid === '' || !tinyux_is_valid_id($sid, 160)) continue;
      $stype = (string)($sv['type'] ?? '');
      if (strlen($stype) > 80) $stype = substr($stype, 0, 80);
      $stSv->execute([$appId, $clientId, $sessionId, tinyux_uid($sv['id'] ?? null), $sid, $stype, tinyux_json_text($sv['response'] ?? null), tinyux_json_text($sv['context'] ?? null)]);
      if ($stSv->rowCount() > 0) $svCount++;
      else $dupes++;
    }

    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  return [$evCount, $svCount, $dupes];
}

[$DB_PATH, $LOG_PATH] = tinyux_resolve_paths($DATA_DIR, $DB_PATH, $LOG_PATH);

// --- CLI ---
if (PHP_SAPI === 'cli') {
  $args = array_slice($argv ?? [], 1);
  $cmd = $args[0] ?? '';

  if ($cmd === '--check') {
    $warnings = [];
    $dbDir = realpath(dirname($DB_PATH)) ?: dirname($DB_PATH);
    if ($dbDir === realpath(__DIR__)) $warnings[] = 'The database sits next to collect.php. Move it to ' . $DATA_DIR . ' or set TINYUX_DB_PATH outside the web root.';
    if ($CAPTURE_REQUEST_META && $HASH_IP_WITH_SALT && ($IP_HASH_SALT === '' || $IP_HASH_SALT === 'change-me')) $warnings[] = 'Request metadata capture is on but TINYUX_IP_SALT is not set: IP hashes are skipped.';
    if (in_array('*', $ALLOWED_ORIGINS, true)) $warnings[] = '$ALLOWED_ORIGINS contains "*": any site can post to this collector.';
    echo "tinyux collector v0.2.0\n";
    echo "database: $DB_PATH\nlog: $LOG_PATH\n";
    echo "origins: " . (empty($ALLOWED_ORIGINS) ? 'same-origin only' : implode(', ', $ALLOWED_ORIGINS)) . "\n";
    echo $warnings ? ("warnings:\n- " . implode("\n- ", $warnings) . "\n") : "no warnings\n";
    exit($warnings ? 1 : 0);
  }

  if ($cmd === '--retry') {
    $pdo = tinyux_pdo($DB_PATH);
    $rows = $pdo->query('SELECT id, raw_payload, retries FROM failed_payloads ORDER BY id ASC LIMIT 200')->fetchAll();
    $ok = 0;
    $fail = 0;
    foreach ($rows as $r) {
      $id = (int)$r['id'];
      if ((int)$r['retries'] >= 8) continue;
      $payload = json_decode((string)$r['raw_payload'], true);
      try {
        if (!is_array($payload)) throw new InvalidArgumentException('invalid json');
        tinyux_ingest($pdo, $payload, tinyux_payload_meta($payload));
        $pdo->prepare('DELETE FROM failed_payloads WHERE id = ?')->execute([$id]);
        $ok++;
      } catch (Throwable $e) {
        $pdo->prepare('UPDATE failed_payloads SET retries = retries + 1 WHERE id = ?')->execute([$id]);
        $fail++;
      }
    }
    echo "retry done ok=$ok fail=$fail\n";
    exit(0);
  }

  if ($cmd === '--prune') {
    $days = $RETENTION_DAYS;
    foreach ($args as $a) {
      if (preg_match('/^--days=(\d+)$/', $a, $m)) $days = (int)$m[1];
    }
    $pdo = tinyux_pdo($DB_PATH);
    $cut = '-' . $days . ' days';
    $counts = [];
    $pdo->beginTransaction();
    foreach ([
      'events' => 'DELETE FROM events WHERE received_at < datetime(\'now\', ?)',
      'surveys' => 'DELETE FROM surveys WHERE submitted_at < datetime(\'now\', ?)',
      'failed_payloads' => 'DELETE FROM failed_payloads WHERE received_at < datetime(\'now\', ?)',
      'sessions' => 'DELETE FROM sessions WHERE started_at < datetime(\'now\', ?) AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL UNION SELECT session_id FROM surveys WHERE session_id IS NOT NULL)',
      'clients' => 'DELETE FROM clients WHERE last_seen < datetime(\'now\', ?)',
    ] as $table => $sql) {
      $st = $pdo->prepare($sql);
      $st->execute([$cut]);
      $counts[$table] = $st->rowCount();
    }
    $pdo->commit();
    echo 'pruned rows older than ' . $days . ' days: ' . json_encode($counts) . "\n";
    exit(0);
  }

  fwrite(STDERR, "usage: php collect.php --check | --retry | --prune [--days=N]\n");
  exit(2);
}

// --- Web endpoint ---
if (!tinyux_origin_allowed($ALLOWED_ORIGINS)) {
  http_response_code(403);
  exit;
}
tinyux_cors($ALLOWED_ORIGINS);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  header('Allow: POST, OPTIONS');
  exit;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!tinyux_rate_limit_ok($ip, $RATE_LIMIT_PER_MINUTE, $IP_HASH_SALT)) {
  http_response_code(429);
  exit;
}

$apiKey = trim(tinyux_header('X-API-KEY'));
if (!empty($API_KEY_ALLOWLIST) || $REQUIRE_API_KEY) {
  if ($apiKey === '' || !in_array($apiKey, $API_KEY_ALLOWLIST, true)) {
    http_response_code(401);
    exit;
  }
}

$contentLen = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLen > $MAX_BODY_BYTES) {
  http_response_code(413);
  exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '' || strlen($raw) > $MAX_BODY_BYTES) {
  http_response_code($raw !== false && strlen($raw) > $MAX_BODY_BYTES ? 413 : 400);
  exit;
}

// sendBeacon delivers text/plain; parse JSON regardless of the content type.
$payload = json_decode($raw, true);
if (!is_array($payload)) {
  http_response_code(400);
  exit;
}

$appId = (string)($payload['app_id'] ?? '');
$clientUid = (string)($payload['client_id'] ?? '');
$sessionUid = (string)($payload['session_id'] ?? '');
if (!tinyux_is_valid_id($appId, 120) || !tinyux_is_valid_id($clientUid, 120) || ($sessionUid !== '' && !tinyux_is_valid_id($sessionUid, 120))) {
  http_response_code(400);
  exit;
}

$meta = tinyux_merge_request_meta(
  tinyux_payload_meta($payload),
  tinyux_request_meta($CAPTURE_REQUEST_META, $HASH_IP_WITH_SALT, $IP_HASH_SALT, $CAPTURE_USER_AGENT)
);

try {
  $pdo = tinyux_pdo($DB_PATH);
  [$evCount, $svCount, $dupes] = tinyux_ingest($pdo, $payload, $meta);
  if ($LOG_REQUESTS) {
    tinyux_log($LOG_PATH, 'INFO', 'ingest ok', ['app_id' => $appId, 'events' => $evCount, 'surveys' => $svCount, 'duplicates' => $dupes]);
  }
  http_response_code(204);
  exit;
} catch (Throwable $e) {
  try {
    if (isset($pdo) && $pdo instanceof PDO) tinyux_store_failed($pdo, $raw, $LOG_PATH, 'db_error');
  } catch (Throwable $e2) {}
  tinyux_log($LOG_PATH, 'ERROR', 'ingest failed', ['app_id' => $appId, 'err' => $e->getMessage()]);
  // 202: stored for `php collect.php --retry`, so the client should not resend.
  http_response_code(202);
  exit;
}
