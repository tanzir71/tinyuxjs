<?php
declare(strict_types=1);

/*
  tinyux collect.php — single-file ingestion endpoint (PHP + SQLite)

  Configuration (edit these):
  - $DB_PATH: SQLite DB location
  - $ALLOWED_ORIGINS: CORS allowlist
  - $API_KEY_ALLOWLIST: optional X-API-KEY allowlist (note: sendBeacon cannot set custom headers)
  - $RATE_LIMIT_PER_MINUTE: soft per-IP limit

  Payload mapping notes (client → DB):
  Expected payload shape (example):
    {
      "app_id":"myApp",
      "client_id":"c-uuid",
      "session_id":"s-uuid",
      "ts":1680000000,
      "meta": {"url":"https://app.example.com/page","viewport":{"w":1366,"h":768},"scroll_pct":45},
      "events":[{"id":"e1","type":"interaction","ts":1680000001,"meta":{"selector":".cta","dataset":{"product":"premium"},"rect":{"top":100,"left":10,"width":200,"height":40},"intersection":0.8}}],
      "surveys":[{"survey_id":"post-cta","type":"rating","response":{"value":5},"ts":1680000010,"context":{}}
      ]
    }

  - Clients are upserted by clients.client_id (uuid string)
  - Sessions are upserted by (session_id, client_id)
  - events.event_meta stores the event meta object as JSON TEXT
  - surveys.response/context store the survey response/context objects as JSON TEXT
*/

// --- Config ---
$DB_PATH = __DIR__ . DIRECTORY_SEPARATOR . 'tinyux.db';
$LOG_PATH = __DIR__ . DIRECTORY_SEPARATOR . 'tinyux.log';

$ALLOWED_ORIGINS = [
  // 'https://app.example.com',
  // 'http://localhost:5173',
  '*',
];

$API_KEY_ALLOWLIST = [
  // 'replace-with-a-long-random-key',
];

$REQUIRE_API_KEY = false;

$MAX_BODY_BYTES = 256 * 1024; // 256KB
$RATE_LIMIT_PER_MINUTE = 120; // soft, per IP

// --- Helpers ---
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

function tinyux_cors(array $allowedOrigins): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  $allowAny = in_array('*', $allowedOrigins, true);
  if ($allowAny) {
    header('Access-Control-Allow-Origin: *');
  } elseif ($origin && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
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

function tinyux_rate_limit_ok(string $ip, int $limitPerMinute): bool {
  if ($limitPerMinute <= 0) return true;
  $bucket = (int)floor(time() / 60);
  $key = 'tinyux_rl_' . $ip . '_' . $bucket;

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
  $pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  $pdo->exec("PRAGMA journal_mode=WAL;");
  $pdo->exec("PRAGMA synchronous=NORMAL;");
  $pdo->exec("PRAGMA foreign_keys=ON;");
  return $pdo;
}

function tinyux_store_failed(PDO $pdo, string $rawPayload, string $logPath, string $why): void {
  try {
    $st = $pdo->prepare('INSERT INTO failed_payloads (raw_payload, received_at, retries) VALUES (:raw, datetime(\'now\'), 0)');
    $st->execute([':raw' => $rawPayload]);
  } catch (Throwable $e) {
    tinyux_log($logPath, 'ERROR', 'failed_payloads insert failed', ['why' => $why, 'err' => $e->getMessage()]);
  }
}

// --- CLI retry worker (optional) ---
// Usage: php collect.php --retry
if (PHP_SAPI === 'cli' && isset($argv[1]) && $argv[1] === '--retry') {
  $pdo = tinyux_pdo($DB_PATH);
  $limit = 200;
  $maxRetries = 8;
  $rows = $pdo->query('SELECT id, raw_payload, retries FROM failed_payloads ORDER BY id ASC LIMIT ' . (int)$limit)->fetchAll();
  $ok = 0;
  $fail = 0;

  foreach ($rows as $r) {
    $id = (int)$r['id'];
    $raw = (string)$r['raw_payload'];
    $retries = (int)$r['retries'];
    if ($retries >= $maxRetries) continue;
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
      $pdo->prepare('UPDATE failed_payloads SET retries = retries + 1 WHERE id = ?')->execute([$id]);
      $fail++;
      continue;
    }

    try {
      $pdo->beginTransaction();

      $appId = (string)($payload['app_id'] ?? '');
      $clientUid = (string)($payload['client_id'] ?? '');
      $sessionUid = (string)($payload['session_id'] ?? '');
      $meta = $payload['meta'] ?? null;

      if (!tinyux_is_valid_id($appId, 120) || !tinyux_is_valid_id($clientUid, 120) || ($sessionUid !== '' && !tinyux_is_valid_id($sessionUid, 120))) {
        throw new RuntimeException('invalid ids');
      }

      $pdo->prepare('INSERT OR IGNORE INTO ux_apps (app_id, config, created_at) VALUES (?, NULL, datetime(\'now\'))')->execute([$appId]);

      $stSelClient = $pdo->prepare('SELECT id FROM clients WHERE client_id = ?');
      $stSelClient->execute([$clientUid]);
      $clientRow = $stSelClient->fetch();
      if ($clientRow) {
        $clientId = (int)$clientRow['id'];
        $pdo->prepare('UPDATE clients SET last_seen = datetime(\'now\'), meta = COALESCE(?, meta) WHERE id = ?')
          ->execute([tinyux_json_text($meta), $clientId]);
      } else {
        $pdo->prepare('INSERT INTO clients (client_id, first_seen, last_seen, meta) VALUES (?, datetime(\'now\'), datetime(\'now\'), ?)')
          ->execute([$clientUid, tinyux_json_text($meta)]);
        $clientId = (int)$pdo->lastInsertId();
      }

      $sessionId = null;
      if ($sessionUid !== '') {
        $stSelSess = $pdo->prepare('SELECT id FROM sessions WHERE session_id = ? AND client_id = ?');
        $stSelSess->execute([$sessionUid, $clientId]);
        $sessRow = $stSelSess->fetch();
        if ($sessRow) {
          $sessionId = (int)$sessRow['id'];
          $pdo->prepare('UPDATE sessions SET meta = COALESCE(?, meta) WHERE id = ?')->execute([tinyux_json_text($meta), $sessionId]);
        } else {
          $pdo->prepare('INSERT INTO sessions (session_id, client_id, started_at, ended_at, meta) VALUES (?, ?, datetime(\'now\'), NULL, ?)')
            ->execute([$sessionUid, $clientId, tinyux_json_text($meta)]);
          $sessionId = (int)$pdo->lastInsertId();
        }
      }

      $events = $payload['events'] ?? [];
      $surveys = $payload['surveys'] ?? [];
      if (!is_array($events)) $events = [];
      if (!is_array($surveys)) $surveys = [];

      $stEv = $pdo->prepare('INSERT INTO events (app_id, client_id, session_id, event_type, event_ts, event_meta, received_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))');
      foreach ($events as $ev) {
        if (!is_array($ev)) continue;
        $type = (string)($ev['type'] ?? 'event');
        $ts = (int)($ev['ts'] ?? ($payload['ts'] ?? time()));
        $metaEv = $ev['meta'] ?? null;
        $stEv->execute([$appId, $clientId, $sessionId, $type, $ts, tinyux_json_text($metaEv)]);
      }

      $stSv = $pdo->prepare('INSERT INTO surveys (app_id, client_id, session_id, survey_id, survey_type, response, context, submitted_at, processed) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), 0)');
      foreach ($surveys as $sv) {
        if (!is_array($sv)) continue;
        $sid = (string)($sv['survey_id'] ?? '');
        if ($sid === '') continue;
        $stype = (string)($sv['type'] ?? '');
        $resp = $sv['response'] ?? null;
        $ctx = $sv['context'] ?? null;
        $stSv->execute([$appId, $clientId, $sessionId, $sid, $stype, tinyux_json_text($resp), tinyux_json_text($ctx)]);
      }

      $pdo->commit();
      $pdo->prepare('DELETE FROM failed_payloads WHERE id = ?')->execute([$id]);
      $ok++;
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      $pdo->prepare('UPDATE failed_payloads SET retries = retries + 1 WHERE id = ?')->execute([$id]);
      $fail++;
    }
  }

  echo "retry done ok=$ok fail=$fail\n";
  exit(0);
}

// --- Web endpoint ---
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
if (!tinyux_rate_limit_ok($ip, $RATE_LIMIT_PER_MINUTE)) {
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
if ($raw === false || $raw === '') {
  http_response_code(400);
  exit;
}

// sendBeacon may deliver text/plain; accept and parse JSON anyway.
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

$events = $payload['events'] ?? [];
$surveys = $payload['surveys'] ?? [];
$meta = $payload['meta'] ?? null;

if (!is_array($events)) $events = [];
if (!is_array($surveys)) $surveys = [];

$evCount = 0;
$svCount = 0;

try {
  $pdo = tinyux_pdo($DB_PATH);

  $pdo->beginTransaction();

  $pdo->prepare('INSERT OR IGNORE INTO ux_apps (app_id, config, created_at) VALUES (?, NULL, datetime(\'now\'))')
    ->execute([$appId]);

  $stSelClient = $pdo->prepare('SELECT id FROM clients WHERE client_id = ?');
  $stSelClient->execute([$clientUid]);
  $clientRow = $stSelClient->fetch();
  if ($clientRow) {
    $clientId = (int)$clientRow['id'];
    $pdo->prepare('UPDATE clients SET last_seen = datetime(\'now\'), meta = COALESCE(?, meta) WHERE id = ?')
      ->execute([tinyux_json_text($meta), $clientId]);
  } else {
    $pdo->prepare('INSERT INTO clients (client_id, first_seen, last_seen, meta) VALUES (?, datetime(\'now\'), datetime(\'now\'), ?)')
      ->execute([$clientUid, tinyux_json_text($meta)]);
    $clientId = (int)$pdo->lastInsertId();
  }

  $sessionId = null;
  if ($sessionUid !== '') {
    $stSelSess = $pdo->prepare('SELECT id FROM sessions WHERE session_id = ? AND client_id = ?');
    $stSelSess->execute([$sessionUid, $clientId]);
    $sessRow = $stSelSess->fetch();
    if ($sessRow) {
      $sessionId = (int)$sessRow['id'];
      $pdo->prepare('UPDATE sessions SET meta = COALESCE(?, meta) WHERE id = ?')
        ->execute([tinyux_json_text($meta), $sessionId]);
    } else {
      $pdo->prepare('INSERT INTO sessions (session_id, client_id, started_at, ended_at, meta) VALUES (?, ?, datetime(\'now\'), NULL, ?)')
        ->execute([$sessionUid, $clientId, tinyux_json_text($meta)]);
      $sessionId = (int)$pdo->lastInsertId();
    }
  }

  $stEv = $pdo->prepare('INSERT INTO events (app_id, client_id, session_id, event_type, event_ts, event_meta, received_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))');
  foreach ($events as $ev) {
    if (!is_array($ev)) continue;
    $type = (string)($ev['type'] ?? 'event');
    if ($type === '') $type = 'event';
    if (strlen($type) > 80) $type = substr($type, 0, 80);
    $ts = (int)($ev['ts'] ?? ($payload['ts'] ?? time()));
    $metaEv = $ev['meta'] ?? null;
    $stEv->execute([$appId, $clientId, $sessionId, $type, $ts, tinyux_json_text($metaEv)]);
    $evCount++;
  }

  $stSv = $pdo->prepare('INSERT INTO surveys (app_id, client_id, session_id, survey_id, survey_type, response, context, submitted_at, processed) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), 0)');
  foreach ($surveys as $sv) {
    if (!is_array($sv)) continue;
    $sid = (string)($sv['survey_id'] ?? '');
    if ($sid === '' || !tinyux_is_valid_id($sid, 160)) continue;
    $stype = (string)($sv['type'] ?? '');
    if (strlen($stype) > 80) $stype = substr($stype, 0, 80);
    $resp = $sv['response'] ?? null;
    $ctx = $sv['context'] ?? null;
    $stSv->execute([$appId, $clientId, $sessionId, $sid, $stype, tinyux_json_text($resp), tinyux_json_text($ctx)]);
    $svCount++;
  }

  $pdo->commit();

  tinyux_log($LOG_PATH, 'INFO', 'ingest ok', [
    'ip' => $ip,
    'app_id' => $appId,
    'events' => $evCount,
    'surveys' => $svCount,
  ]);

  http_response_code(204);
  exit;
} catch (Throwable $e) {
  try {
    if (isset($pdo) && $pdo instanceof PDO) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      tinyux_store_failed($pdo, $raw, $LOG_PATH, 'db_error');
    }
  } catch (Throwable $e2) {}

  tinyux_log($LOG_PATH, 'ERROR', 'ingest failed', [
    'ip' => $ip,
    'app_id' => $appId,
    'err' => $e->getMessage(),
  ]);

  http_response_code(202);
  exit;
}

