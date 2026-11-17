#!/usr/bin/env python3
"""Generate competitor alternative pages for tinyux."""

from html import escape
from pathlib import Path

BASE = "https://tanzir71.github.io/tinyuxjs"
ROOT = Path(__file__).resolve().parent
FAVICON = "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2032%2032%27%3E%3Ccircle%20cx%3D%2716%27%20cy%3D%2716%27%20r%3D%2715%27%20fill%3D%27%232540FF%27%20fill-opacity%3D%27.16%27%2F%3E%3Ccircle%20cx%3D%2716%27%20cy%3D%2716%27%20r%3D%2710.5%27%20fill%3D%27%232540FF%27%20fill-opacity%3D%27.36%27%2F%3E%3Ccircle%20cx%3D%2716%27%20cy%3D%2716%27%20r%3D%276.2%27%20fill%3D%27%232540FF%27%2F%3E%3C%2Fsvg%3E"

VENDORS = [
    {
        "slug": "hotjar-alternative",
        "name": "Hotjar",
        "blurb": "Managed heatmap/replay workflows versus self-hosted aggregate heatmap points and prompts.",
        "h1": "A tiny self-hosted Hotjar alternative for targeted feedback",
        "title": "Hotjar Alternative For Self-Hosted UX Feedback - tinyux",
        "desc": "tinyux is a small self-hosted alternative when you need targeted UX events, optional aggregate click heatmaps, and contextual surveys, not session replay.",
        "what": "Hotjar, now part of Contentsquare, is built around behavior analytics such as heatmaps, session replay, funnels, surveys, and feedback workflows. It is useful when teams want visual behavior analysis and a managed platform.",
        "differs": "tinyux does not do replay or screenshot-backed heatmap workflows. It records selected interaction signals, optional aggregate click/tap heatmap points, and micro-survey answers, then posts them to your own collector. The trade is simple: less product, less data surface, more ownership.",
        "choose_them": "you need heatmaps, replay, funnel views, feedback widgets, and a managed workspace for non-technical teammates.",
        "choose_us": "you only need to instrument important moments, collect aggregate click/tap density, ask contextual questions, and keep raw data on your server.",
        "rows": [
            ("Heatmaps", "Optional aggregate click/tap points", "Yes, managed visual heatmaps"),
            ("Session replay", "No", "Yes"),
            ("Surveys", "Rating, NPS, yes/no, choice, text", "Yes"),
            ("Data hosting", "Your endpoint and SQLite database", "Vendor platform"),
            ("Setup", "One script tag plus collector", "Vendor project and tracking script"),
            ("Best fit", "Small self-hosted feedback loops", "Visual behavior analytics and website optimization"),
        ],
    },
    {
        "slug": "fullstory-alternative",
        "name": "FullStory",
        "blurb": "Digital experience analytics versus tiny contextual telemetry.",
        "h1": "A minimal FullStory alternative when replay is too much",
        "title": "FullStory Alternative For Tiny UX Telemetry - tinyux",
        "desc": "tinyux is a self-hosted option for teams that need contextual UX events and surveys without adopting a full digital experience analytics platform.",
        "what": "FullStory is a digital experience analytics platform with session replay, behavioral search, journey analysis, and enterprise-oriented workflows for finding friction across products.",
        "differs": "tinyux is intentionally narrower. It does not reconstruct sessions or provide a search UI. It records the events you choose, optional aggregate heatmap points, and the answers users submit, then leaves analysis to your database or internal tools.",
        "choose_them": "you need high-fidelity session replay, deep behavioral analysis, team workflows, and managed analytics infrastructure.",
        "choose_us": "you want a readable script that captures just enough UX context for a small product or privacy-sensitive workflow.",
        "rows": [
            ("Digital experience suite", "No", "Yes"),
            ("Session replay", "No", "Yes"),
            ("Heatmaps", "Optional aggregate click/tap points", "Yes"),
            ("Behavior search", "Use your DB or build your own", "Built into platform"),
            ("Surveys", "Contextual in-page prompts", "Sentiment/feedback features depending on package"),
            ("Data hosting", "Your server", "Vendor platform"),
            ("Best fit", "Targeted self-hosted telemetry", "Deep experience analytics"),
        ],
    },
    {
        "slug": "logrocket-alternative",
        "name": "LogRocket",
        "blurb": "Developer replay and debug context versus small UX feedback loops.",
        "h1": "A tiny LogRocket alternative for feedback, not debugging replay",
        "title": "LogRocket Alternative For Self-Hosted UX Signals - tinyux",
        "desc": "tinyux captures lightweight interaction events and contextual surveys for your own backend. It is not a developer session replay or error-debugging platform.",
        "what": "LogRocket focuses on replaying user sessions with developer context such as console logs, network activity, JavaScript errors, performance data, and user/session metadata.",
        "differs": "tinyux skips the debugging recorder. It is useful when the question is not 'recreate the bug' but 'what did users click, where did they cluster, where did they hesitate, and what did they say at that moment?'",
        "choose_them": "you need replay, console/network context, error triage, and engineering workflows around user sessions.",
        "choose_us": "you want small event telemetry, aggregate heatmap points, and surveys without capturing debug streams or replayable sessions.",
        "rows": [
            ("Replay", "No", "Yes"),
            ("Console/network capture", "No", "Yes"),
            ("Error debugging", "No built-in platform", "Core use case"),
            ("Heatmaps", "Optional aggregate click/tap points", "Part of broader UX analytics, not the developer replay core"),
            ("Surveys", "Core use case", "Not the primary product shape"),
            ("Data hosting", "Your endpoint", "Vendor platform"),
            ("Best fit", "UX prompts and metadata", "Debugging user-impacting issues"),
        ],
    },
    {
        "slug": "posthog-alternative",
        "name": "PostHog",
        "blurb": "Product OS versus one script and your database.",
        "h1": "A tiny PostHog alternative when you do not need a product OS",
        "title": "PostHog Alternative For Small Self-Hosted UX Feedback - tinyux",
        "desc": "tinyux is for teams that need one script, one collector, and contextual feedback. PostHog is a much broader product engineering platform.",
        "what": "PostHog combines product analytics, web analytics, session replay, feature flags, experiments, surveys, data tools, and other product engineering workflows.",
        "differs": "tinyux is not trying to be a product operating system. It captures lightweight events, optional aggregate heatmap points, and survey answers, then stores them where you decide.",
        "choose_them": "you want product analytics, flags, experiments, replay, surveys, and warehouse-style tooling in one platform.",
        "choose_us": "you need a small self-hosted telemetry layer and would rather not define a full analytics taxonomy yet.",
        "rows": [
            ("Product analytics", "Only raw event storage", "Core use case"),
            ("Feature flags/experiments", "No", "Yes"),
            ("Session replay", "No", "Yes"),
            ("Heatmaps", "Optional aggregate click/tap points", "Available as part of a broader product suite"),
            ("Surveys", "Yes, simple prompts", "Yes, platform feature"),
            ("Data hosting", "Your server", "Cloud or self-hosted options"),
            ("Best fit", "Small self-hosted feedback layer", "Product engineering platform"),
        ],
    },
]


LOGO = (
    '<svg class="logo-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">'
    '<circle cx="16" cy="16" r="14.5" fill="#2540FF" fill-opacity=".13"/><circle cx="16" cy="16" r="10" fill="#2540FF" fill-opacity=".3"/>'
    '<circle cx="16" cy="16" r="5.6" fill="#2540FF"/></svg>'
)
GITHUB_ICON = (
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>'
)


def row_html(rows):
    return "\n".join(
        f'              <tr><th scope="row">{escape(dim)}</th><td class="col-us">{escape(us)}</td><td>{escape(them)}</td></tr>'
        for dim, us, them in rows
    )


def other_cards(v):
    cards = []
    for other in VENDORS:
        if other["slug"] == v["slug"]:
            continue
        cards.append(
            f'          <a href="./{other["slug"]}.html"><h3>vs {escape(other["name"])}</h3>'
            f'<p>{escape(other["blurb"])}</p><span>Read comparison</span></a>'
        )
    cards.append(
        '          <a href="./compare.html"><h3>All four at once</h3>'
        '<p>One matrix with tinyux, Hotjar, FullStory, LogRocket, and PostHog side by side.</p><span>Open the matrix</span></a>'
    )
    return "\n".join(cards)


def render(v):
    rows = row_html(v["rows"])
    name = escape(v["name"])
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(v["title"])}</title>
  <meta name="description" content="{escape(v["desc"])}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{BASE}/{v["slug"]}.html">
  <meta name="theme-color" content="#ffffff">
  <link rel="icon" type="image/svg+xml" href="{FAVICON}">
  <link rel="stylesheet" href="./site.css">
</head>
<body>
  <a href="#content" class="sr-only skip">Skip to content</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="./index.html" aria-label="tinyux home">{LOGO}tinyux</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" aria-label="Open navigation menu" data-menu-toggle><span></span><span></span><span></span></button>
      <nav id="primary-navigation" class="site-nav" aria-label="Primary">
        <a href="./index.html#whats-new">What's new</a>
        <a href="./index.html#features">Signals</a>
        <a href="./index.html#surveys">Surveys</a>
        <a href="./index.html#setup">Setup</a>
        <a href="./docs.html">Docs</a>
        <a href="./compare.html" aria-current="page">Compare</a>
        <a href="./demo/product.html">Demo</a>
        <a class="nav-gh" href="https://github.com/tanzir71/tinyuxjs" target="_blank" rel="noopener">
          {GITHUB_ICON}
          GitHub
        </a>
      </nav>
    </div>
  </header>

  <main id="content">
    <section class="page-hero">
      <div class="wrap">
        <ol class="crumbs" aria-label="Breadcrumb"><li><a href="./compare.html">Compare</a></li><li aria-current="page">tinyux vs {name}</li></ol>
        <h1>{escape(v["h1"])}</h1>
        <p class="lead">{escape(v["desc"])}</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="./demo/product.html">Try the demo</a>
          <a class="btn" href="./docs.html">Read the docs</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head"><h2>What {name} does</h2></div>
        <div class="pair">
          <div class="panel"><h3>{name}</h3><p>{escape(v["what"])}</p></div>
          <div class="panel pick"><h3>tinyux</h3><p>{escape(v["differs"])}</p></div>
        </div>
      </div>
    </section>

    <section class="section alt">
      <div class="wrap">
        <div class="section-head"><h2>Side by side</h2></div>
        <div class="table-wrap">
          <table class="matrix narrow">
            <caption class="sr-only">tinyux compared with {name}</caption>
            <thead><tr><th scope="col">Dimension</th><th scope="col" class="col-us">tinyux</th><th scope="col">{name}</th></tr></thead>
            <tbody>
{rows}
            </tbody>
          </table>
        </div>
        <p class="note">A product-shape comparison, not a procurement document. Vendor features change; verify details with {name}.</p>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head"><h2>Which should you choose?</h2></div>
        <div class="pair">
          <div class="panel"><h3>Choose {name} if...</h3><p>{escape(v["choose_them"])}</p></div>
          <div class="panel pick"><h3>Choose tinyux if...</h3><p>{escape(v["choose_us"])}</p></div>
        </div>
      </div>
    </section>

    <section class="section alt">
      <div class="wrap">
        <div class="section-head"><h2>Other comparisons</h2></div>
        <div class="vs">
{other_cards(v)}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">
      <div class="foot">
        <div>
          <a class="brand" href="./index.html" aria-label="tinyux home"><svg class="logo-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="14.5" fill="#2540FF" fill-opacity=".13"/><circle cx="16" cy="16" r="10" fill="#2540FF" fill-opacity=".3"/><circle cx="16" cy="16" r="5.6" fill="#2540FF"/></svg>tinyux</a>
          <p class="foot-note">Self-hosted UX telemetry and micro-surveys. Built by <a href="https://tanziro.com" target="_blank" rel="noopener">tanziro.com</a>.</p>
        </div>
        <div><h4>Product</h4><ul><li><a href="./demo/product.html">Demo</a></li><li><a href="./docs.html">Docs</a></li><li><a href="./compare.html">Compare</a></li><li><a href="./llms.txt">llms.txt</a></li></ul></div>
        <div><h4>Alternatives</h4><ul><li><a href="./hotjar-alternative.html">vs Hotjar</a></li><li><a href="./fullstory-alternative.html">vs FullStory</a></li><li><a href="./logrocket-alternative.html">vs LogRocket</a></li><li><a href="./posthog-alternative.html">vs PostHog</a></li></ul></div>
        <div><h4>Project</h4><ul><li><a href="https://github.com/tanzir71/tinyuxjs" target="_blank" rel="noopener">GitHub</a></li><li><a href="https://buymeacoffee.com/tanzir" target="_blank" rel="noopener">Support</a></li><li><a href="./README.md">README</a></li><li><a href="./CHANGELOG.md">Changelog</a></li></ul></div>
      </div>
      <a class="donate" href="https://buymeacoffee.com/tanzir" target="_blank" rel="noopener">
        <span class="donate-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h12v4.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9.5z"/><path d="M16 11h1.6a2.4 2.4 0 0 1 0 4.8H16"/><path d="M8.5 3.5c-.6.8-.6 1.6 0 2.4M12 3.5c-.6.8-.6 1.6 0 2.4"/></svg></span>
        <span class="donate-text"><strong>Tanzir Rahman</strong> is fueling open-source code, local utilities, and late-night builds.</span>
        <span class="donate-cta">Buy me a coffee</span>
      </a>
      <div class="legal"><span>MIT License.</span><span>v0.2.0</span></div>
    </div>
  </footer>
  <script src="./site.js"></script>
</body>
</html>
"""


for vendor in VENDORS:
    out = ROOT / f"{vendor['slug']}.html"
    out.write_text(render(vendor), encoding="utf-8")
    print(f"wrote {out.name}")
