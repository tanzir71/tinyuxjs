# tinyux sibling product design

## Goal

Make tinyux feel like a brother/sister of the reference tinyproctor.js project, but for self-hosted UX telemetry and contextual micro-surveys.

## Scope

Build the focused static product surface:

- Landing page, docs, comparison matrix, four competitor alternative pages, demo page, README, llms.txt, sitemap, robots.txt.
- Keep the implementation static and dependency-light.
- Keep root files as source of truth and mirror publishable output into `docs/`.
- Add a tiny test/minify toolchain only where it improves confidence.

## Positioning

tinyux is not a session replay suite, heatmap tool, full product analytics warehouse, or SaaS dashboard. It is a small MIT-licensed script plus collector for teams that want to know what happened around key UI moments and ask contextual questions without sending data to a vendor cloud.

Competitor set:

- Hotjar / Contentsquare: heatmaps, replays, surveys, feedback, funnels.
- FullStory: digital experience analytics and high-fidelity session replay.
- LogRocket: replay, product analytics, console/network/error context.
- PostHog: product analytics, replay, feature flags, experiments, surveys, warehouse/CDP features.

## Pages

- `index.html`: Volt-style landing page with hero snippet, diagram, setup paths, signals, why tinyux, comparisons, honest limits, support footer.
- `docs.html`: quick start, declarative triggers, JS API, config table, payload schema, collector docs, CORS, privacy, FAQ.
- `compare.html`: conservative matrix versus Hotjar, FullStory, LogRocket, PostHog.
- `hotjar-alternative.html`, `fullstory-alternative.html`, `logrocket-alternative.html`, `posthog-alternative.html`: generated alternative pages.
- `demo/product.html`: live local demo with event log and micro-survey triggers.
- `llms.txt`: agent-readable implementation contract.
- `README.md`: concise project overview and usage.

## Visual System

Use the reference Volt language:

- Warm paper `#f4f3ee`, black ink, electric blue `#2540ff`.
- Square corners, hairline borders, dark code panels, mono uppercase metadata.
- Compact sticky header with `TU` mark.
- Gridded cells rather than glossy SaaS cards.
- Honest copy, no overblown analytics claims.

## Functional Refinements

- Add/verify a public `tinyux.destroy()` lifecycle method.
- Align default survey UI with the Volt style.
- Keep privacy defaults explicit: no text capture, no keystroke contents, dataset denylist, optional input metadata only.
- Add tests for lifecycle, survey styling, declarative triggers, payload shape, and retry behavior.
- Generate `tinyux.min.js` when tooling is available.

## Non-Goals

- No admin console in this pass.
- No auth, accounts, heatmaps, replay player, dashboards, hosted analytics, or vendor-cloud behavior.
