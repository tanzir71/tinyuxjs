# tinyux

Self-hosted UX telemetry, contextual micro-surveys, and optional aggregate click heatmaps in one script tag.

tinyux records useful product interaction signals - page views, clicks, section views, focus/blur, exit intent, heartbeats, optional aggregate heatmap points, optional rage and dead clicks, and survey lifecycle events - then sends JSON batches to **your** collector endpoint. No session replay. No screenshots. No vendor cloud.

One dependency-free file: `tinyux.min.js` is about 13.6 KB gzipped with every option included.

- Website: https://tanzir71.github.io/tinyuxjs/
- Demo: https://tanzir71.github.io/tinyuxjs/demo/product.html
- Docs: https://tanzir71.github.io/tinyuxjs/docs.html
- Compare: https://tanzir71.github.io/tinyuxjs/compare.html
- Changelog: [CHANGELOG.md](./CHANGELOG.md)

## What's new in v0.2

Same script tag, API, and payload contract. Highlights:

- **Sturdier delivery:** flushes drain the whole buffer, every event and survey answer has an id the collector deduplicates, no `unload` handlers (pages stay bfcache-eligible), and `destroy()` removes every listener.
- **More private collector:** data lives in a protected `tinyux-data/` folder, logs never contain IP addresses, same-origin by default, in-place upgrades from v0.1, and `--prune` / `--check` CLI commands.
- **Better surveys:** `nps` type, conditional `followUp` questions, native `<dialog>` modals with proper focus handling, light/dark/auto themes, `--tinyux-*` CSS variables, translatable labels, and a CSP nonce.
- **Opt-in signals and controls:** `spa`, `frustration` (rage and dead clicks), `consent: 'pending'`, `respectGPC`, `storage: 'session' | 'none'`, `clientIdTtlDays`, and `sampleRate`.

Upgrading: replace `tinyux.js` and `collect.php`. Don't re-run `schema.sql` on an existing database; the collector upgrades it on the first request. Remove `mouseSampling` from your config if you set it.

## Quick start

Ask your coding agent:

> Add tinyux UX telemetry to my project: fetch https://tanzir71.github.io/tinyuxjs/tinyux.js into my static assets, add its script tag with `data-app-id` and `data-api-url`, implement the collector from https://tanzir71.github.io/tinyuxjs/llms.txt, then add one click survey and one section-scroll survey.

Manual script tag:

```html
<script src="/js/tinyux.js"
  data-app-id="acme-app"
  data-api-url="/collect.php"
  data-config='{"surveys":{"maxPerSession":2}}'></script>
```

Deploy `collect.php` next to `tinyux.js`. On the first request it creates its SQLite database in `tinyux-data/` (protected by a deny-all `.htaccess`). Check where data will live and get warnings about risky settings with:

```bash
php collect.php --check
```

On nginx, block `tinyux-data/` or set `TINYUX_DB_PATH` to a path outside the web root. `schema.sql` is still available if you prefer to create the database yourself.

## Declarative triggers

```html
<button
  data-plan="team"
  data-tinyux-trigger="click"
  data-tinyux-survey-id="upgrade-clarity">
  Upgrade
</button>

<section
  id="pricing"
  data-tinyux-trigger="section-scroll"
  data-tinyux-threshold="0.5"
  data-tinyux-once="session"
  data-tinyux-survey-id="pricing-clarity">
</section>
```

## JavaScript API

```js
const ux = window.tinyux.getInstance()

ux.registerSurvey({
  id: 'pricing-clarity',
  type: 'yesno',
  title: 'Pricing clarity',
  question: 'Did this section answer your question?',
  ui: { mode: 'corner', position: 'bottom-right' }
})

ux.identify('user_123', {
  account_id: 'acct_456',
  plan: 'team'
})

ux.registerSurvey({
  id: 'nps',
  type: 'nps',
  question: 'How likely are you to recommend us to a colleague?',
  followUp: { when: '<=6', question: 'What should we fix first?' }
})

ux.track('custom_event', { source: 'checkout' })
ux.bind('.cta', 'click', { survey_id: 'pricing-clarity' })
ux.showSurvey('pricing-clarity')
ux.flush()
window.tinyux.destroy()
```

## User association

tinyux stays anonymous by default with `client_id` and `session_id`. If your app already knows the user or account, attach that identity explicitly:

```js
const ux = window.tinyux.getInstance()
ux.identify('user_123', {
  account_id: 'acct_456',
  plan: 'team',
  role: 'admin'
})
```

Payloads include top-level `user` and `meta.user`. The PHP collector stores that data in the existing client/session metadata. It does not fingerprint browsers or devices to infer identity.

## Survey placement

Surveys are blocking center modals by default. Use corner mode for a subtle non-blocking prompt:

```js
ux.registerSurvey({
  id: 'pricing-clarity',
  type: 'yesno',
  title: 'Pricing clarity',
  question: 'Did this section answer your question?',
  ui: { mode: 'corner', position: 'bottom-right' }
})
```

Positions: `bottom-right`, `bottom-left`, `top-right`, `top-left`.

Modals use the native `<dialog>` element where available. Theme prompts with `ui.theme` (`light`, `dark`, `auto`), override `--tinyux-*` CSS variables on `.tinyux-root`, rename buttons with `ui.labels`, and pass `ui.nonce` for strict Content Security Policies.

## Consent, storage, and sampling

```html
<script src="/js/tinyux.js"
  data-app-id="acme-app"
  data-api-url="/collect.php"
  data-config='{"consent":"pending","respectGPC":true,"storage":"session","sampleRate":0.5}'></script>
<script>
  acceptButton.onclick = () => tinyux.consent(true)
  rejectButton.onclick = () => tinyux.consent(false)
</script>
```

- `consent: 'pending'` keeps events in memory, writes nothing to storage, and shows no surveys until `tinyux.consent(true)`. `consent(false)` discards buffered data and clears tinyux keys.
- `storage: 'none'` is cookieless (in-memory only); `'session'` lasts for the tab session.
- `clientIdTtlDays` (default 395) rotates the anonymous id after about 13 months.
- `respectGPC: true` drops identity for Global Privacy Control visitors; `'all'` disables tinyux for them.
- `sampleRate` tracks a share of sessions.

## Opt-in signals

```html
<script src="/js/tinyux.js"
  data-app-id="acme-app"
  data-api-url="/collect.php"
  data-config='{"spa":true,"frustration":true}'></script>
```

- `spa: true` records `page_view` events (with `path` and `from`) on client-side route changes, using the Navigation API with a history fallback.
- `frustration: true` records `rage_click` (3+ clicks within ~700 ms and 24 px) and `dead_click` (a click on a button or link followed by no DOM change, navigation, or page hide within 1 s).

## Collector

The included `collect.php` accepts JSON batches, stores clients/sessions/events/surveys in SQLite, ignores duplicate event and survey ids, and records failed payloads for retry. It accepts same-origin requests only unless you list origins in `$ALLOWED_ORIGINS`, and its log records app ids and counts, never IP addresses.

```bash
php collect.php --check              # paths and warnings
php collect.php --retry              # replay failed payloads
php collect.php --prune --days=395   # delete rows older than the retention window
```

Example cron:

```cron
*/5 * * * * /usr/bin/php /path/to/collect.php --retry
17 3 * * *  /usr/bin/php /path/to/collect.php --prune --days=395
```

## Optional aggregate heatmaps

Heatmaps are disabled by default. Enable aggregate click/tap density without screenshots, DOM snapshots, or replay:

```html
<script src="/js/tinyux.js"
  data-app-id="acme-app"
  data-api-url="/collect.php"
  data-config='{"heatmaps":{"enabled":true}}'></script>
```

Heatmap points are stored as normal `heatmap_point` events with coarse `x_pct` / `y_pct` coordinates, viewport bucket, path, input type, and sanitized element metadata.

```sql
SELECT event_meta, COUNT(*) AS points
FROM events
WHERE app_id = 'acme-app' AND event_type = 'heatmap_point'
GROUP BY event_meta
ORDER BY points DESC;
```

## Development

```bash
npm install          # esbuild, for the minified build
npm test             # client tests (fake DOM)
npm run test:php     # collector tests (needs php with pdo_sqlite)
npm run build:min    # tinyux.min.js, fails if over the gzip budget
npm run sync:docs    # mirror the site into docs/ for GitHub Pages
npm run serve
```

Local site: http://localhost:8787/

## Privacy defaults

tinyux does not capture screen contents, screenshots, DOM snapshots, keystroke contents, clipboard contents, camera, microphone, console logs, network logs, or form values by default. Optional input telemetry records metadata only: input tag/type and length. Optional heatmaps record aggregate coordinates only. tinyux records no mouse trails, and the collector never writes IP addresses to its log.

## License

MIT.
