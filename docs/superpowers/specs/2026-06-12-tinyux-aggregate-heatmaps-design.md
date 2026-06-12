# tinyux aggregate heatmaps design

## Goal

Add optional aggregate click/tap heatmaps while preserving tinyux as a self-hosted, simple telemetry script plus collector.

## Scope

Heatmaps are disabled by default and enabled with `heatmaps.enabled: true`. The first version captures click and touch density only. Each heatmap point is stored as a normal event named `heatmap_point`, using coarse page-relative percentages and viewport buckets. There is no DOM snapshot, screenshot, continuous mouse trail, replay, or per-user heatmap viewer.

## Architecture

The client listens for `click` and `touchend` only when heatmaps are enabled. It computes:

- `x_pct` and `y_pct`: page-relative coordinates from 0 to 100.
- `viewport`: rounded viewport bucket, such as `1280x720`.
- `path`: the current URL path without query string unless `includeQueryString` is already enabled.
- `input`: `click` or `touch`.
- `selector`: safe element identity metadata from the existing `elementMeta` helper.

The event travels through the existing batching, retry, collector, and SQLite storage path. The schema does not need a new table for the first pass.

## Reporting

Docs describe how to query heatmap points from `events` where `event_type = 'heatmap_point'`. A future report layer may aggregate these rows into CSV, JSON, or an HTML overlay, but the first pass only captures the aggregate data needed for those outputs.

## Privacy

Heatmaps remain opt-in. They do not collect screen contents, DOM contents, keystrokes, form values, clipboard data, console logs, network logs, or screenshots. Coordinates are coarse percentages, not exact raw pixels. Dataset filtering continues to use the existing allowlist/denylist rules.

## Page Updates

Marketing and comparison pages should stop saying "No heatmaps" as an absolute. They should say tinyux has optional aggregate click/tap heatmaps, not replay-style visual behavior suites.

## Tests

Add automated tests proving:

- Heatmap events are not emitted by default.
- Enabling `heatmaps.enabled` records a `heatmap_point` event after a click.
- The emitted event contains coarse percentage coordinates and avoids text/form value capture.

