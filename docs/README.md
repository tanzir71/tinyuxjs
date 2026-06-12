# tinyux

Self-hosted UX telemetry and contextual micro-surveys in one script tag.

tinyux records useful product interaction signals - page views, clicks, section views, focus/blur, exit intent, heartbeats, and survey lifecycle events - then sends JSON batches to **your** collector endpoint. No heatmaps. No session replay. No vendor cloud.

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
  question: 'Did this section answer your question?'
})

ux.track('custom_event', { source: 'checkout' })
ux.bind('.cta', 'click', { survey_id: 'pricing-clarity' })
ux.showSurvey('pricing-clarity')
ux.flush()
window.tinyux.destroy()
```

## Collector

The included `collect.php` accepts JSON batches, stores clients/sessions/events/surveys in SQLite, and records failed payloads for retry.

Optional retry cron:

```cron
*/5 * * * * /usr/bin/php /path/to/collect.php --retry >> /path/to/tinyux.log 2>&1
```

## Development

```bash
npm test
npm run build:min
npm run serve
```

Local site: http://localhost:8787/

## Privacy defaults

tinyux does not capture screen contents, DOM snapshots, keystroke contents, clipboard contents, camera, microphone, console logs, network logs, or form values by default. Optional input telemetry records metadata only: input tag/type and length.

## License

MIT.
