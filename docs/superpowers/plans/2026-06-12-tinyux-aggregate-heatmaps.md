# Tinyux Aggregate Heatmaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in aggregate click/tap heatmap capture without adding replay, screenshots, DOM capture, or a dashboard.

**Architecture:** Reuse the current `tinyux.js` event pipeline and `events` table. Heatmaps are disabled by default, emit only `heatmap_point` events when enabled, and store coarse page-relative percentages. Static pages and docs are updated to describe optional aggregate heatmaps rather than full platform heatmaps.

**Tech Stack:** Vanilla JavaScript, PHP/SQLite collector, static HTML/CSS docs, Node test harness.

---

### Task 1: Heatmap Tests

**Files:**
- Modify: `test/run-tests.mjs`

- [ ] Add a test that initializes tinyux without heatmaps, clicks the document body, flushes, and verifies no `heatmap_point` event is sent.
- [ ] Add a test that initializes tinyux with `{"heatmaps":{"enabled":true}}`, clicks a button with safe dataset metadata, flushes, and verifies a `heatmap_point` event with `x_pct`, `y_pct`, `viewport`, `path`, `input`, and sanitized element metadata.
- [ ] Run `npm test` and confirm the enabled heatmap test fails because production code does not emit `heatmap_point` yet.

### Task 2: Client Heatmap Capture

**Files:**
- Modify: `tinyux.js`

- [ ] Add `heatmaps: { enabled: false, clicks: true, taps: true }` to `defaultConfig()`.
- [ ] Add coordinate helpers that compute page-relative percentage coordinates using `pageX/pageY`, document dimensions, and clamping.
- [ ] Add `armHeatmaps()` that binds click and touchend listeners only when enabled.
- [ ] Emit `heatmap_point` events through `enqueueEvent()` with coarse coordinates and existing safe element metadata.
- [ ] Call `armHeatmaps()` from `init()`.
- [ ] Run `npm test` and confirm all tests pass.

### Task 3: Product Copy And Docs

**Files:**
- Modify: `README.md`
- Modify: `docs.html`
- Modify: `index.html`
- Modify: `compare.html`
- Modify: `llms.txt`
- Modify: `build-alt-pages.py`

- [ ] Update positioning copy from absolute "no heatmaps" to "optional aggregate click/tap heatmaps, no replay-style heatmaps."
- [ ] Document `heatmaps.enabled`, `heatmaps.clicks`, and `heatmaps.taps`.
- [ ] Add a heatmap event example and SQL query guidance.
- [ ] Regenerate competitor alternative pages with the updated heatmap rows.

### Task 4: Build Output And Verification

**Files:**
- Modify generated docs mirror under `docs/`
- Modify: `tinyux.min.js`

- [ ] Run `python build-alt-pages.py`.
- [ ] Run `npm run build:min`.
- [ ] Run `npm run sync:docs`.
- [ ] Run `npm test`.
- [ ] Start `npm run serve` and validate the landing/docs/demo pages in the in-app Browser.

