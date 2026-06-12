# tinyux

Self-hosted UX telemetry, contextual micro-surveys, and optional aggregate click heatmaps in one script tag.

tinyux records useful product interaction signals - page views, clicks, section views, focus/blur, exit intent, heartbeats, optional aggregate heatmap points, and survey lifecycle events - then sends JSON batches to **your** collector endpoint. No session replay. No screenshots. No vendor cloud.

- Website: https://tanzir71.github.io/tinyuxjs/
- Demo: https://tanzir71.github.io/tinyuxjs/demo/product.html
- Docs: https://tanzir71.github.io/tinyuxjs/docs.html
- Compare: https://tanzir71.github.io/tinyuxjs/compare.html

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

Initialize SQLite:

```bash
sqlite3 tinyux.db < schema.sql
```

Deploy `collect.php`, `tinyux.js`, and `tinyux.db` together. The database file must be writable by PHP.

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

## Collector

The included `collect.php` accepts JSON batches, stores clients/sessions/events/surveys in SQLite, and records failed payloads for retry.

Optional retry cron:

```cron
*/5 * * * * /usr/bin/php /path/to/collect.php --retry >> /path/to/tinyux.log 2>&1
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
npm test
npm run build:min
npm run serve
```

Local site: http://localhost:8787/

## Privacy defaults

tinyux does not capture screen contents, screenshots, DOM snapshots, keystroke contents, clipboard contents, camera, microphone, console logs, network logs, or form values by default. Optional input telemetry records metadata only: input tag/type and length. Optional heatmaps record aggregate coordinates only.

## License

MIT.
