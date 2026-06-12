#!/usr/bin/env python3
"""Generate competitor alternative pages for tinyux."""

from html import escape
from pathlib import Path

BASE = "https://tanzir71.github.io/tinyuxjs"
ROOT = Path(__file__).resolve().parent
NINJA_FAVICON = "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20100%20100%27%3E%3Ctext%20y%3D%27.9em%27%20font-size%3D%2790%27%3E%F0%9F%A5%B7%3C%2Ftext%3E%3C%2Fsvg%3E"

VENDORS = [
    {
        "slug": "hotjar-alternative",
        "name": "Hotjar",
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
            ("Surveys", "Rating, yes/no, choice, text", "Yes"),
            ("Data hosting", "Your endpoint and SQLite database", "Vendor platform"),
            ("Setup", "One script tag plus collector", "Vendor project and tracking script"),
            ("Best fit", "Small self-hosted feedback loops", "Visual behavior analytics and website optimization"),
        ],
    },
    {
        "slug": "fullstory-alternative",
        "name": "FullStory",
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


def row_html(rows):
    return "\n".join(
        f"<tr><td><strong>{escape(dim)}</strong></td><td>{escape(us)}</td><td>{escape(them)}</td></tr>"
        for dim, us, them in rows
    )


def render(v):
    rows = row_html(v["rows"])
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(v["title"])}</title>
  <meta name="description" content="{escape(v["desc"])}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{BASE}/{v["slug"]}.html">
  <link rel="icon" type="image/svg+xml" href="{NINJA_FAVICON}">
  <link rel="stylesheet" href="./site.css">
</head>
<body>
  <header>
    <div class="container header-inner">
      <a class="brand" href="./index.html"><div class="logo"><span>TU</span></div><span class="brand-name">tinyux</span></a>
      <nav>
        <a class="nav-link" href="./index.html#features">Signals</a>
        <a class="nav-link" href="./docs.html">Docs</a>
        <a class="nav-link" href="./compare.html">Compare</a>
        <a class="nav-link" href="./demo/product.html">Demo</a>
        <a class="btn btn-primary" href="https://github.com/tanzir71/tinyuxjs" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </div>
  </header>
  <main>
    <section class="hero">
      <div class="container hero-inner">
        <span class="eyebrow">comparison - tinyux vs {escape(v["name"])}</span>
        <h1>{escape(v["h1"])}</h1>
        <p class="lead">{escape(v["desc"])}</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="./demo/product.html">Try the demo</a>
          <a class="btn" href="./docs.html">Read the docs</a>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="section-head"><span class="idx">ALT - 01</span><h2>What {escape(v["name"])} does</h2></div>
        <div class="grid grid-2">
          <div class="cell"><h3>{escape(v["name"])}</h3><p>{escape(v["what"])}</p></div>
          <div class="cell"><h3>tinyux</h3><p>{escape(v["differs"])}</p></div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="section-head"><span class="idx">ALT - 02</span><h2>Side by side</h2></div>
        <div class="table"><div class="table-wrap"><table>
          <thead><tr><th>Dimension</th><th>tinyux</th><th>{escape(v["name"])}</th></tr></thead>
          <tbody>{rows}</tbody>
        </table></div></div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="section-head"><span class="idx">ALT - 03</span><h2>Which should you choose?</h2></div>
        <div class="grid grid-2">
          <div class="cell"><h3>Choose {escape(v["name"])} if...</h3><p>{escape(v["choose_them"])}</p></div>
          <div class="cell"><h3>Choose tinyux if...</h3><p>{escape(v["choose_us"])}</p></div>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <div class="container footer-inner">
      <div class="footer-note">tinyux - built by <a href="https://tanziro.com" target="_blank" rel="noopener">tanziro.com</a></div>
      <div class="footer-links">
        <a href="./index.html">home</a>
        <a href="./docs.html">docs</a>
        <a href="./compare.html">compare</a>
        <a href="./demo/product.html">demo</a>
      </div>
    </div>
  </footer>
</body>
</html>
"""


for vendor in VENDORS:
    out = ROOT / f"{vendor['slug']}.html"
    out.write_text(render(vendor), encoding="utf-8")
    print(f"wrote {out.name}")
