# Changelog

## 0.2.0

Same script tag, public API, and payload contract as 0.1. Every new option is off by default.

### Client (`tinyux.js`)

Fixed
- `flush()` drains the whole buffer instead of sending one batch and stopping. Unsent payloads stay queued with backoff.
- `bind()` cooldowns apply per element, not per selector.
- `destroy()` and `stop()` remove every listener, observer, and timer tinyux added.
- Section-scroll triggers fire for the section that became visible (0.1 always fired the first one).
- No `unload`/`beforeunload` handlers, so pages stay eligible for the back/forward cache. Buffered events are sent with `sendBeacon` on `pagehide`; a restored page records `page_view` with `restored: true`.
- Heartbeats pause while the tab is hidden.

New
- Event and survey answer `id`s are UUIDs, so collectors can ignore duplicates.
- `survey_closed` events when a survey is dismissed without an answer.
- `nps` survey type and conditional `followUp` questions (`{ value, comment }` responses).
- Native `<dialog>` modals with focus return; corner prompts never take focus.
- `ui.theme` (`light`, `dark`, `auto`), `--tinyux-*` CSS variables, `ui.labels`, and `ui.nonce` for strict CSP.
- `spa: true`: `page_view` on client-side route changes (Navigation API, history fallback).
- `frustration: true`: `rage_click` and `dead_click` events.
- `consent: 'pending'` with `tinyux.consent(true | false)`, `hasConsent()`, `isActive()`.
- `storage: 'session' | 'none'`, `clientIdTtlDays` (395), `respectGPC`, `sampleRate`.
- `heatmaps: true`, `frustration: true`, `exitIntent: true` shorthands.
- `tinyux.version`.

Changed
- Unload beacons are sent as `text/plain` (CORS-safelisted, no preflight).
- `tinyux.init()` stops any previous instance first.
- `tinyux.min.js` is built with esbuild and checked against a 14 KB gzip budget.

Removed
- `mouseSampling`. tinyux records no pointer trails.

### Collector (`collect.php`)

- Data lives in `tinyux-data/` with a deny-all `.htaccess`, or wherever `TINYUX_DB_PATH` / `TINYUX_LOG_PATH` point. An existing `tinyux.db` next to `collect.php` keeps working.
- Creates its schema on the first request and upgrades 0.1 databases in place (`PRAGMA user_version = 2`).
- Ignores duplicate events and survey answers by id.
- Same-origin by default; cross-origin apps go in `$ALLOWED_ORIGINS`.
- Logs record app id and counts only, never IP addresses. The rate limiter keys on a salted hash. The optional IP hash is only stored once `TINYUX_IP_SALT` is set.
- New CLI commands: `--check` and `--prune [--days=N]`, next to `--retry`.

### Project

- Collector tests run the real PHP endpoint (`npm run test:php`).
- GitHub Actions runs the build, both test suites, and checks the `docs/` mirror is in sync.
- New logo mark.

### Upgrading from 0.1

1. Replace `tinyux.js` (or `tinyux.min.js`) and `collect.php`.
2. Don't re-run `schema.sql` on an existing database; the collector upgrades it.
3. If pages and collector are on different origins, list the page origins in `$ALLOWED_ORIGINS`.
4. Remove `mouseSampling` from your config if you set it.

## 0.1.0

First release.
