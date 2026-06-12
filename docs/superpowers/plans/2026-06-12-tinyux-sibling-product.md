# Tinyux Sibling Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tinyux static sibling product surface and polish the library enough for the docs/demo story to be true.

**Architecture:** Keep the project static and root-file-first. Add small Node scripts for tests, minification, and local demo serving. Generate competitor pages from data, then mirror publishable files into `docs/`.

**Tech Stack:** HTML/CSS/vanilla JS, PHP/SQLite collector, Node demo server, jsdom tests, terser minification.

---

### Task 1: Test Harness And Red Tests

**Files:**
- Create: `package.json`
- Create: `test/run-tests.mjs`

- [ ] Add scripts for `npm test`, `npm run build:min`, and `npm run serve`.
- [ ] Add tests for `tinyux.destroy()`, Volt survey styles, click-triggered surveys, payload shape, and retry queue behavior.
- [ ] Run `npm test` and confirm failures for missing `tinyux.destroy()` and current non-Volt survey radius/accent.

### Task 2: Library Refinement

**Files:**
- Modify: `tinyux.js`

- [ ] Change default accent to `#2540ff`.
- [ ] Restyle injected survey UI to square Volt styling.
- [ ] Track bound element handlers so `stop()` removes declarative bindings too.
- [ ] Add `tinyux.destroy()` to stop and clear the singleton.
- [ ] Run `npm test` until all tests pass.

### Task 3: Static Site Pages

**Files:**
- Create/modify: `index.html`, `docs.html`, `compare.html`, `llms.txt`, `robots.txt`, `sitemap.xml`, `README.md`

- [ ] Implement the landing page in the reference Volt design language.
- [ ] Implement documentation around the actual API and collector.
- [ ] Implement conservative competitor comparison copy.
- [ ] Update README and agent-readable contract.

### Task 4: Generated Alternative Pages

**Files:**
- Create: `build-alt-pages.py`
- Create generated pages for Hotjar, FullStory, LogRocket, PostHog.

- [ ] Encode competitor data in the generator.
- [ ] Generate four alternative pages with shared header/footer and Volt styling.

### Task 5: Demo And Local Server

**Files:**
- Create: `demo/product.html`
- Create: `demo/server.mjs`

- [ ] Build an interactive product-page demo with click, section-scroll, exit-intent/manual, and survey examples.
- [ ] Add a local server that serves the site, accepts `/collect` POSTs, and exposes `/events`.

### Task 6: Build Output

**Files:**
- Create/modify: `docs/`
- Create: `tinyux.min.js`
- Create/modify: `.gitignore`

- [ ] Run minification.
- [ ] Mirror publishable files into `docs/`.
- [ ] Ignore local scratch/runtime artifacts.

### Task 7: Verification And Launch

**Files:** all touched files.

- [ ] Run `npm test`.
- [ ] Run `npm run build:min`.
- [ ] Start `npm run serve` and verify the local URL responds.
- [ ] Leave the server running and report the URL.
