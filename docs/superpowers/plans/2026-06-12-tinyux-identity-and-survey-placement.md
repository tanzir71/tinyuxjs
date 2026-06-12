# Tinyux Identity And Survey Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit integrator-provided identity association and configurable survey placement while preserving tinyux's self-hosted, simple architecture.

**Architecture:** Extend the existing client config, payload builder, and survey renderer. Identity remains explicit and payload-based; the collector stores identity in existing client/session metadata. Corner surveys reuse the same DOM builder with mode/position classes and no overlay.

**Tech Stack:** Vanilla JavaScript client, PHP/SQLite collector, static HTML docs, Node test harness.

---

### Task 1: Identity And Survey UI Tests

**Files:**
- Modify: `test/run-tests.mjs`

- [ ] Add an identity test that initializes tinyux with config `user`, tracks an event, flushes, and verifies `payload.user` and `payload.meta.user`.
- [ ] Add an identity test that calls `ux.identify('user_123', { account_id: 'acct_456', plan: 'team' })`, tracks an event, flushes, and verifies the updated user payload.
- [ ] Add a default modal test assertion that surveys render an overlay and `aria-modal="true"`.
- [ ] Add a corner survey test that registers `ui: { mode: 'corner', position: 'bottom-left' }`, shows the survey, and verifies no overlay, `aria-modal="false"`, and position classes.
- [ ] Run `npm test` and confirm the new tests fail for missing `identify()` and corner UI behavior.

### Task 2: Client Identity Implementation

**Files:**
- Modify: `tinyux.js`

- [ ] Add user identity state initialized from `cfg.user`.
- [ ] Add `normalizeUser()` to accept `id`, `account_id`, and arbitrary explicit traits.
- [ ] Add top-level `user` to payloads when identity exists.
- [ ] Add `user` to `buildMetaSnapshot()` when identity exists.
- [ ] Add public methods `identify(idOrUser, traits)`, `clearIdentity()`, and `getIdentity()`.
- [ ] Run `npm test` and confirm identity tests pass.

### Task 3: Corner Survey Implementation

**Files:**
- Modify: `tinyux.js`

- [ ] Add survey `ui` parsing in `buildSurveyModel()`.
- [ ] Add CSS for `.tinyux-root-corner`, `.tinyux-pos-bottom-right`, `.tinyux-pos-bottom-left`, `.tinyux-pos-top-right`, and `.tinyux-pos-top-left`.
- [ ] In `showSurvey()`, set root classes and `aria-modal` based on `survey.ui.mode`.
- [ ] Do not append the overlay for corner surveys.
- [ ] Run `npm test` and confirm modal and corner tests pass.

### Task 4: Collector Request Metadata

**Files:**
- Modify: `collect.php`

- [ ] Add collector config flags for request metadata.
- [ ] Add helper that returns hashed IP and optional user agent when enabled.
- [ ] Merge top-level `user` and optional `request` metadata into the stored `$meta` object in both web ingestion and CLI retry paths.
- [ ] Keep request metadata disabled by default.

### Task 5: Docs, Demo, And Build Output

**Files:**
- Modify: `README.md`
- Modify: `docs.html`
- Modify: `llms.txt`
- Modify: `demo/product.html`
- Modify generated docs mirror under `docs/`
- Modify: `tinyux.min.js`

- [ ] Document `identify()`, `clearIdentity()`, `getIdentity()`, config `user`, and survey `ui.mode` / `ui.position`.
- [ ] Update the demo with one corner survey example.
- [ ] Run `npm run build:min`.
- [ ] Run `npm run sync:docs`.
- [ ] Run `npm test`.

