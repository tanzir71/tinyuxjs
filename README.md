# tinyux

1) Create the SQLite DB: `sqlite3 tinyux.db < schema.sql`
2) Deploy `collect.php`, `tinyux.js`, and `tinyux.db` in the same directory (DB must be writable).
3) Point the client to `data-api-url="/collect.php"` (or full URL) and set `data-app-id`.
4) (Optional) Set `$ALLOWED_ORIGINS`, `$API_KEY_ALLOWLIST`, and `$REQUIRE_API_KEY` in `collect.php`.
5) Ensure PHP has `pdo_sqlite` enabled; SQLite WAL works best on local disks.
6) Cron retry worker: `*/5 * * * * /usr/bin/php /path/to/collect.php --retry >> /path/to/tinyux.log 2>&1`
7) Inspect ingestion logs in `tinyux.log` and failures in `failed_payloads`.

