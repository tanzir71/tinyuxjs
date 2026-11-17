import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'tinyux.js'), 'utf8')

let passed = 0

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`ok ${passed} - ${name}`)
  } catch (err) {
    err.message = `${name}\n${err.message}`
    throw err
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class Store {
  constructor() { this.map = new Map() }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null }
  setItem(key, value) { this.map.set(String(key), String(value)) }
  removeItem(key) { this.map.delete(String(key)) }
}

function dataName(attr) {
  return attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.children = []
    this.attributes = {}
    this.dataset = {}
    this.listeners = {}
    this.style = {}
    this._text = ''
    this.id = ''
    this.className = ''
    this.disabled = false
    this.type = ''
    this.rows = 0
    this.placeholder = ''
  }

  set textContent(value) {
    this._text = String(value)
    this.children = []
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('')
  }

  setAttribute(name, value) {
    const v = String(value)
    this.attributes[name] = v
    if (name === 'id') this.id = v
    if (name === 'class') this.className = v
    if (name === 'src') this.src = v
    if (name.startsWith('data-')) this.dataset[dataName(name)] = v
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
  }

  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child)
    child.parentNode = null
    return child
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this)
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = []
    this.listeners[type].push(handler)
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== handler)
  }

  dispatchEvent(event) {
    event.target = event.target || this
    for (const handler of this.listeners[event.type] || []) handler.call(this, event)
    return true
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this })
  }

  focus() {}

  getBoundingClientRect() {
    return { top: 10, left: 10, width: 120, height: 36 }
  }

  get classList() {
    return (this.className || '').split(/\s+/).filter(Boolean)
  }

  matches(selector) {
    return matchesSelector(this, selector)
  }

  querySelector(selector) {
    return queryAll(this, selector)[0] || null
  }

  querySelectorAll(selector) {
    return queryAll(this, selector)
  }
}

class FakeDocument {
  constructor() {
    this.listeners = {}
    this.visibilityState = 'visible'
    this.referrer = ''
    this.currentScript = null
    this.documentElement = new FakeElement('html', this)
    this.head = new FakeElement('head', this)
    this.body = new FakeElement('body', this)
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
  }

  createElement(tagName) {
    return new FakeElement(tagName, this)
  }

  getElementById(id) {
    return queryAll(this.documentElement, `#${id}`)[0] || null
  }

  getElementsByTagName(tag) {
    return queryAll(this.documentElement, tag)
  }

  querySelector(selector) {
    return queryAll(this.documentElement, selector)[0] || null
  }

  querySelectorAll(selector) {
    return queryAll(this.documentElement, selector)
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = []
    this.listeners[type].push(handler)
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== handler)
  }

  dispatchEvent(event) {
    for (const handler of this.listeners[event.type] || []) handler.call(this, event)
    return true
  }

  hasFocus() { return true }
}

function queryAll(root, selector) {
  const selectors = selector.split(',').map((item) => item.trim()).filter(Boolean)
  const out = []
  function visit(node) {
    for (const child of node.children || []) {
      if (selectors.some((sel) => matchesSelector(child, sel))) out.push(child)
      visit(child)
    }
  }
  visit(root)
  return out
}

function matchesSelector(el, selector) {
  if (!selector) return false
  if (selector.startsWith('#')) return el.id === selector.slice(1)
  if (selector.startsWith('.')) return el.classList.includes(selector.slice(1))
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const inner = selector.slice(1, -1)
    const [name, rawValue] = inner.split('=')
    if (!Object.prototype.hasOwnProperty.call(el.attributes, name)) return false
    if (rawValue == null) return true
    return el.attributes[name] === rawValue.replace(/^["']|["']$/g, '')
  }
  return el.tagName.toLowerCase() === selector.toLowerCase()
}

function makeWindow() {
  const document = new FakeDocument()
  const win = {
    document,
    navigator: {
      userAgent: 'fake-browser',
      language: 'en-US',
      sendBeacon: undefined
    },
    location: new URL('https://app.example.test/pricing?plan=pro'),
    innerWidth: 1280,
    innerHeight: 720,
    screen: { width: 1280, height: 720 },
    localStorage: new Store(),
    sessionStorage: new Store(),
    console,
    URL,
    Blob,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    MutationObserver: undefined,
    IntersectionObserver: undefined,
    crypto: {
      getRandomValues(arr) {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 3) % 255
        return arr
      }
    },
    listeners: {},
    addEventListener(type, handler) {
      if (!this.listeners[type]) this.listeners[type] = []
      this.listeners[type].push(handler)
    },
    removeEventListener(type, handler) {
      this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== handler)
    },
    dispatchEvent(event) {
      for (const handler of this.listeners[event.type] || []) handler.call(this, event)
      return true
    }
  }
  win.window = win
  document.defaultView = win
  const sent = []
  win.fetch = (url, init = {}) => {
    sent.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    return Promise.resolve({ ok: true, status: 204 })
  }
  return { win, document, sent }
}

function installScript(win, attrs = '') {
  const script = win.document.createElement('script')
  script.setAttribute('src', './tinyux.js')
  const attrPattern = /([a-zA-Z0-9_-]+)=['"]([^'"]*)['"]/g
  let match
  while ((match = attrPattern.exec(attrs))) script.setAttribute(match[1], match[2])
  win.document.body.appendChild(script)
  win.document.currentScript = script
  vm.runInNewContext(source, win, { filename: 'tinyux.js' })
  return script
}

await test('auto-init exposes a destroy lifecycle method that clears the singleton', async () => {
  const { win } = makeWindow()
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  assert.equal(typeof win.tinyux.destroy, 'function')
  assert.ok(win.tinyux.getInstance())
  win.tinyux.destroy()
  assert.equal(win.tinyux.getInstance(), null)
})

await test('survey styles use the Volt accent and square modal/button corners', async () => {
  const { win } = makeWindow()
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  const ux = win.tinyux.getInstance()
  ux.registerSurvey({ id: 'rating', type: 'rating', title: 'Quick check', question: 'Was this clear?' })
  assert.equal(ux.showSurvey('rating'), true)
  const style = win.document.getElementById('tinyux-style').textContent
  assert.match(style, /#2540ff/i)
  assert.match(style, /--tinyux-radius:0;/)
  assert.match(style, /\.tinyux-modal\{[^}]*border-radius:var\(--tinyux-radius\)/)
  assert.match(style, /\.tinyux-btn\{[^}]*border-radius:var\(--tinyux-radius\)/)
  assert.equal(win.document.querySelectorAll('.tinyux-overlay').length, 1)
  assert.equal(win.document.querySelector('.tinyux-root').getAttribute('aria-modal'), 'true')
  win.tinyux.destroy()
})

await test('corner surveys render without a blocking overlay in the configured corner', async () => {
  const { win } = makeWindow()
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  const ux = win.tinyux.getInstance()
  ux.registerSurvey({
    id: 'corner-check',
    type: 'yesno',
    title: 'Quick check',
    question: 'Was this clear?',
    ui: { mode: 'corner', position: 'bottom-left' }
  })
  assert.equal(ux.showSurvey('corner-check'), true)
  const root = win.document.querySelector('.tinyux-root')
  const style = win.document.getElementById('tinyux-style').textContent
  assert.equal(root.getAttribute('aria-modal'), 'false')
  assert.equal(win.document.querySelectorAll('.tinyux-overlay').length, 0)
  assert.ok(root.classList.includes('tinyux-root-corner'))
  assert.ok(root.classList.includes('tinyux-pos-bottom-left'))
  assert.match(style, /\.tinyux-root-corner/)
  win.tinyux.destroy()
})

await test('declarative click triggers an interaction event and survey submission payload', async () => {
  const { win, sent } = makeWindow()
  const button = win.document.createElement('button')
  button.setAttribute('id', 'upgrade')
  button.setAttribute('data-plan', 'pro')
  button.setAttribute('data-tinyux-trigger', 'click')
  button.setAttribute('data-tinyux-survey-id', 'post-cta')
  button.textContent = 'Upgrade'
  win.document.body.appendChild(button)
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  const ux = win.tinyux.getInstance()
  ux.registerSurvey({
    id: 'post-cta',
    type: 'yesno',
    title: 'Question',
    question: 'Was {{data-plan}} useful?'
  })
  button.click()
  await wait(10)
  assert.match(win.document.body.textContent, /Was pro useful/)
  win.document.querySelector('.tinyux-btn-primary').click()
  await wait(300)
  assert.ok(sent.length >= 1)
  const latest = sent.at(-1).body
  assert.equal(latest.app_id, 'demo')
  assert.ok(latest.events.some((event) => event.type === 'interaction'))
  assert.ok(latest.surveys.some((survey) => survey.survey_id === 'post-cta'))
  win.tinyux.destroy()
})

await test('failed sends are retried from localStorage on the next flush', async () => {
  const { win, sent } = makeWindow()
  let fail = true
  win.fetch = (url, init = {}) => {
    sent.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    if (fail) return Promise.resolve({ ok: false, status: 500 })
    return Promise.resolve({ ok: true, status: 204 })
  }
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  const ux = win.tinyux.getInstance()
  ux.track('custom_event', { source: 'test' })
  await ux.flush()
  const raw = win.localStorage.getItem('tinyux:failed_queue:demo')
  assert.ok(raw && JSON.parse(raw).length > 0)
  const queue = JSON.parse(raw)
  queue[0].nextAttemptMs = 0
  win.localStorage.setItem('tinyux:failed_queue:demo', JSON.stringify(queue))
  fail = false
  await ux.flush()
  assert.equal(JSON.parse(win.localStorage.getItem('tinyux:failed_queue:demo')).length, 0)
  win.tinyux.destroy()
})

await test('config user identity is included in payload user and metadata', async () => {
  const { win, sent } = makeWindow()
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  win.tinyux.destroy()
  const ux = win.tinyux.init({
    appId: 'demo',
    apiUrl: '/collect',
    user: {
      id: 'user_123',
      account_id: 'acct_456',
      traits: { plan: 'team', role: 'owner' }
    }
  })
  ux.track('custom_event', { source: 'identity-test' })
  await ux.flush()
  const latest = sent.at(-1).body
  assert.deepEqual(latest.user, {
    id: 'user_123',
    account_id: 'acct_456',
    traits: { plan: 'team', role: 'owner' }
  })
  assert.deepEqual(latest.meta.user, latest.user)
  win.tinyux.destroy()
})

await test('identify updates payload identity for subsequent events', async () => {
  const { win, sent } = makeWindow()
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  const ux = win.tinyux.getInstance()
  assert.equal(typeof ux.identify, 'function')
  assert.equal(typeof ux.clearIdentity, 'function')
  assert.equal(typeof ux.getIdentity, 'function')

  ux.identify('user_999', { account_id: 'acct_999', plan: 'scale', role: 'admin' })
  const identity = JSON.parse(JSON.stringify(ux.getIdentity()))
  assert.deepEqual(identity, {
    id: 'user_999',
    account_id: 'acct_999',
    traits: { plan: 'scale', role: 'admin' }
  })
  ux.track('custom_event', { source: 'identify-test' })
  await ux.flush()
  assert.deepEqual(sent.at(-1).body.user, identity)

  ux.clearIdentity()
  ux.track('anonymous_event', {})
  await ux.flush()
  assert.equal(Object.prototype.hasOwnProperty.call(sent.at(-1).body, 'user'), false)
  win.tinyux.destroy()
})

await test('heatmap points are not captured unless heatmaps are enabled', async () => {
  const { win, document, sent } = makeWindow()
  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  const ux = win.tinyux.getInstance()
  document.dispatchEvent({ type: 'click', target: document.body, pageX: 120, pageY: 160, clientX: 120, clientY: 160 })
  await ux.flush()
  assert.ok(sent.length >= 1)
  const events = sent.flatMap((item) => item.body.events || [])
  assert.equal(events.some((event) => event.type === 'heatmap_point'), false)
  win.tinyux.destroy()
})

await test('enabled heatmaps capture coarse click density without text or form values', async () => {
  const { win, document, sent } = makeWindow()
  document.documentElement.scrollWidth = 1000
  document.documentElement.scrollHeight = 2000
  document.documentElement.clientWidth = 500
  document.documentElement.clientHeight = 500
  document.body.scrollWidth = 1000
  document.body.scrollHeight = 2000

  const button = document.createElement('button')
  button.setAttribute('id', 'buy')
  button.setAttribute('data-plan', 'team')
  button.setAttribute('data-email', 'private@example.test')
  button.textContent = 'Private checkout text'
  document.body.appendChild(button)

  installScript(win, 'data-app-id="demo" data-api-url="/collect"')
  win.tinyux.destroy()
  const ux = win.tinyux.init({
    appId: 'demo',
    apiUrl: '/collect',
    heatmaps: { enabled: true },
    heartbeatMs: 60000
  })

  document.dispatchEvent({ type: 'click', target: button, pageX: 250, pageY: 500, clientX: 250, clientY: 500 })
  await ux.flush()

  const events = sent.flatMap((item) => item.body.events || [])
  const point = events.find((event) => event.type === 'heatmap_point')
  assert.ok(point)
  assert.equal(point.meta.x_pct, 25)
  assert.equal(point.meta.y_pct, 25)
  assert.equal(point.meta.viewport, '500x500')
  assert.equal(point.meta.path, '/pricing')
  assert.equal(point.meta.input, 'click')
  assert.equal(point.meta.element.id, 'buy')
  assert.equal(point.meta.element.dataset.plan, 'team')
  assert.equal(Object.prototype.hasOwnProperty.call(point.meta.element.dataset, 'email'), false)
  assert.doesNotMatch(JSON.stringify(point.meta), /Private checkout text/)
  assert.doesNotMatch(JSON.stringify(point.meta), /private@example\.test/)
  win.tinyux.destroy()
})

const SITE_PAGES = [
  'index.html',
  'docs.html',
  'compare.html',
  'example.html',
  'hotjar-alternative.html',
  'fullstory-alternative.html',
  'logrocket-alternative.html',
  'posthog-alternative.html',
  path.join('demo', 'product.html')
]

await test('every page shares the site header, footer, stylesheet, heat-point logo and favicon', async () => {
  const css = fs.readFileSync(path.join(root, 'site.css'), 'utf8')
  assert.match(css, /\.block\s*\{[^}]*background:\s*var\(--code\)/)
  assert.match(css, /\.site-nav \.nav-gh\s*\{[^}]*border:\s*1px solid var\(--line-2\)/)
  for (const file of SITE_PAGES) {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/|\.\/)site\.css">/, `${file} missing site.css`)
    assert.match(html, /<header class="site-header">/, `${file} missing site header`)
    assert.match(html, /<div class="foot">/, `${file} missing site footer`)
    assert.match(html, /rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]*%232540FF/, `${file} missing heat-point favicon`)
    assert.match(html, /<svg class="logo-mark"[^>]*><circle cx="16" cy="16" r="14.5"/, `${file} missing heat-point logo mark`)
    assert.doesNotMatch(html, /class="container/, `${file} still uses the old layout classes`)
  }
})

await test('every page has the mobile hamburger navigation', async () => {
  const css = fs.readFileSync(path.join(root, 'site.css'), 'utf8')
  const js = fs.readFileSync(path.join(root, 'site.js'), 'utf8')
  assert.match(css, /\.menu-toggle\s*\{[^}]*display:\s*none/)
  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.menu-toggle\s*\{[^}]*display:\s*inline-flex/)
  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.site-nav\s*\{[^}]*display:\s*none/)
  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.header-inner\.is-menu-open \.site-nav\s*\{[^}]*display:\s*flex/)
  assert.match(css, /\.section\s*\{[^}]*scroll-margin-top:\s*64px/)
  for (const file of SITE_PAGES) {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
    assert.match(html, /data-menu-toggle/, `${file} missing menu toggle`)
    assert.match(html, /aria-controls="primary-navigation"/, `${file} menu toggle not wired`)
    assert.match(html, /<nav id="primary-navigation" class="site-nav" aria-label="Primary">/, `${file} missing primary nav`)
  }
  assert.match(js, /querySelectorAll\('\[data-menu-toggle\]'\)/)
  assert.match(js, /aria-expanded/)
  assert.match(js, /is-menu-open/)
})

await test('landing setup cards align code blocks and docs use a sidebar article layout', async () => {
  const landing = fs.readFileSync(path.join(root, 'landing.css'), 'utf8')
  assert.match(landing, /\.paths\s*\{[^}]*grid-template-rows:\s*repeat\(5,\s*auto\)/)
  assert.match(landing, /\.path\s*\{[^}]*grid-template-rows:\s*subgrid/)
  assert.match(landing, /\.hero-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/)
  const css = fs.readFileSync(path.join(root, 'site.css'), 'utf8')
  assert.match(css, /\.docs-intro\s*\{[^}]*border-bottom:\s*1px solid var\(--line\)/)
  assert.match(css, /\.toc\s*\{[^}]*position:\s*sticky/)

  const docsHtml = fs.readFileSync(path.join(root, 'docs.html'), 'utf8')
  assert.doesNotMatch(docsHtml, /<section class="hero"/)
  assert.match(docsHtml, /<main id="content" class="docs-main">/)
  assert.match(docsHtml, /class="docs-intro"/)
  assert.match(docsHtml, /<h1>Implementation guide<\/h1>/)
  assert.match(docsHtml, /<nav data-toc>/)
  const tocIds = [...docsHtml.matchAll(/<nav data-toc>([\s\S]*?)<\/nav>/g)][0][1].match(/href="#([^"]+)"/g).map((h) => h.slice(7, -1))
  for (const id of tocIds) assert.match(docsHtml, new RegExp(`<section class="doc-section" id="${id}">`), `docs TOC links to missing section ${id}`)
  for (const m of docsHtml.matchAll(/data-copy-target="([^"]+)"/g)) assert.match(docsHtml, new RegExp(`id="${m[1]}"`), `copy button target ${m[1]} missing`)
})

await test('demo page keeps every hook its script and the docs refer to', async () => {
  const html = fs.readFileSync(path.join(root, 'demo', 'product.html'), 'utf8')
  for (const id of ['event-count', 'survey-count', 'send-count', 'refresh-events', 'clear-log', 'log', 'payload', 'manual-survey', 'corner-survey', 'nps-survey', 'dead-button', 'rage-button', 'spa-route', 'pricing']) {
    assert.match(html, new RegExp(`id="${id}"`), `demo missing #${id}`)
  }
  assert.match(html, /data-tinyux-survey-id="upgrade-clarity"/)
  assert.match(html, /data-tinyux-trigger="section-scroll"/)
  assert.match(html, /"frustration":true/)
  assert.ok(html.indexOf('window.tinyuxDemo') < html.indexOf('<script src="../tinyux.js"'), 'collector shim must load before tinyux.js')
})

await test('landing page describes compliance posture without claiming blanket compliance', async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  assert.match(html, /Compliance-friendly by design/)
  assert.match(html, /GDPR \/ UK GDPR/)
  assert.match(html, /CCPA \/ CPRA/)
  assert.match(html, /SOC 2/)
  assert.match(html, /does not make your product compliant by itself/)
  assert.doesNotMatch(html, /GDPR compliant/i)
  assert.doesNotMatch(html, /HIPAA compliant/i)
})


// ---------------------------------------------------------------------------
// v0.2 regression tests
// ---------------------------------------------------------------------------

function freshInstance(cfg = {}, setup) {
  const env = makeWindow()
  if (setup) setup(env)
  installScript(env.win, '')
  const ux = env.win.tinyux.init({ appId: 'demo', apiUrl: '/collect', heartbeatMs: 600000, ...cfg })
  return { ...env, ux }
}

function sentEvents(sent) {
  return sent.flatMap((item) => (item.body && item.body.events) || [])
}

function listenerCount(win) {
  const count = (map) => Object.values(map).reduce((n, list) => n + list.length, 0)
  return count(win.listeners) + count(win.document.listeners)
}

await test('flush delivers every due retry and the fresh batch without dropping any', async () => {
  const { win, sent, ux } = freshInstance()
  let fail = true
  win.fetch = (url, init = {}) => {
    sent.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    return Promise.resolve(fail ? { ok: false, status: 500 } : { ok: true, status: 204 })
  }
  ux.track('lost_1')
  await ux.flush()
  ux.track('lost_2')
  await ux.flush()
  const queue = JSON.parse(win.localStorage.getItem('tinyux:failed_queue:demo'))
  assert.equal(queue.length, 2)
  queue.forEach((item) => { item.nextAttemptMs = 0 })
  win.localStorage.setItem('tinyux:failed_queue:demo', JSON.stringify(queue))
  fail = false
  sent.length = 0
  ux.track('fresh_event')
  assert.equal(await ux.flush(), true)
  const types = sentEvents(sent).map((event) => event.type)
  for (const type of ['lost_1', 'lost_2', 'fresh_event']) assert.ok(types.includes(type), `${type} was not delivered`)
  assert.equal(JSON.parse(win.localStorage.getItem('tinyux:failed_queue:demo')).length, 0)
  win.tinyux.destroy()
})

await test('a failed send keeps every unsent payload in the retry queue', async () => {
  const { win, sent, ux } = freshInstance({ batchSize: 2 })
  win.fetch = (url, init = {}) => {
    sent.push({ body: JSON.parse(init.body) })
    return Promise.resolve({ ok: false, status: 503 })
  }
  for (let i = 0; i < 5; i++) ux.track('evt_' + i)
  assert.equal(await ux.flush(), false)
  const queue = JSON.parse(win.localStorage.getItem('tinyux:failed_queue:demo'))
  const queuedTypes = queue.flatMap((item) => item.payload.events.map((event) => event.type))
  for (let i = 0; i < 5; i++) assert.ok(queuedTypes.includes('evt_' + i))
  assert.equal(sent.length, 1, 'stops at the first failure instead of hammering the endpoint')
  win.tinyux.destroy()
})

await test('pagehide drains the whole buffer, not just one batch', async () => {
  const { win, sent, ux } = freshInstance({ batchSize: 10 })
  const beacons = []
  win.navigator.sendBeacon = (url, blob) => { beacons.push({ url, blob }); return true }
  for (let i = 0; i < 35; i++) ux.track('burst', { i })
  win.dispatchEvent({ type: 'pagehide' })
  assert.ok(beacons.length >= 4)
  const bodies = await Promise.all(beacons.map((b) => b.blob.text()))
  const count = bodies.map((text) => JSON.parse(text)).flatMap((p) => p.events).filter((e) => e.type === 'burst').length
  assert.equal(count, 35)
  assert.match(beacons[0].blob.type, /^text\/plain/)
  assert.equal(sent.length, 0)
  win.tinyux.destroy()
})

await test('beacons that the browser refuses are kept for the next page load', async () => {
  const { win, ux } = freshInstance()
  win.navigator.sendBeacon = () => false
  ux.track('keep_me')
  win.dispatchEvent({ type: 'pagehide' })
  const queue = JSON.parse(win.localStorage.getItem('tinyux:failed_queue:demo'))
  assert.ok(queue.some((item) => item.payload.events.some((event) => event.type === 'keep_me')))
  win.tinyux.destroy()
})

await test('events and survey answers carry ids for server-side dedupe', async () => {
  const { win, sent, ux } = freshInstance({}, ({ win }) => {
    let n = 0
    win.crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  })
  ux.registerSurvey({ id: 'q1', type: 'yesno', question: 'Clear?' })
  ux.showSurvey('q1')
  win.document.querySelector('.tinyux-btn-primary').click()
  await ux.flush()
  const body = sent.at(-1).body
  const ids = body.events.map((event) => event.id)
  assert.ok(ids.every((id) => /^[0-9a-f-]{36}$/.test(id)))
  assert.equal(new Set(ids).size, ids.length)
  assert.match(body.surveys[0].id, /^[0-9a-f-]{36}$/)
  win.tinyux.destroy()
})

await test('bind() cooldown is per element and is not consumed by unrelated clicks', async () => {
  const { win, document, ux } = freshInstance()
  const cta = document.createElement('button')
  cta.setAttribute('class', 'cta')
  document.body.appendChild(cta)
  const other = document.createElement('div')
  document.body.appendChild(other)
  let interactions = 0
  ux.on('interaction', () => interactions++)
  ux.bind('.cta', 'click')
  document.dispatchEvent({ type: 'click', target: other })
  document.dispatchEvent({ type: 'click', target: cta })
  assert.equal(interactions, 1)
  document.dispatchEvent({ type: 'click', target: cta })
  assert.equal(interactions, 1, 'second click on the same element inside the cooldown is ignored')
  win.tinyux.destroy()
})

await test('destroy() removes every listener tinyux added', async () => {
  const { win } = freshInstance({ exitIntent: true, heatmaps: true, frustration: true, captureInputs: true, spa: true }, ({ win }) => {
    win.history = { pushState() {}, replaceState() {} }
  })
  assert.ok(listenerCount(win) > 5)
  win.tinyux.destroy()
  assert.equal(listenerCount(win), 0)
  assert.equal(typeof win.history.pushState, 'function')
})

await test('no beforeunload listener; bfcache restores count as page views', async () => {
  const { win, sent, ux } = freshInstance()
  assert.equal((win.listeners.beforeunload || []).length, 0)
  assert.equal((win.listeners.unload || []).length, 0)
  win.dispatchEvent({ type: 'pageshow', persisted: false })
  win.dispatchEvent({ type: 'pageshow', persisted: true })
  await ux.flush()
  const views = sentEvents(sent).filter((event) => event.type === 'page_view')
  assert.equal(views.length, 2)
  assert.equal(views[1].meta.restored, true)
  win.tinyux.destroy()
})

await test('mouseSampling is gone: no pointer trail is recorded even if configured', async () => {
  const { win, sent, ux } = freshInstance({ mouseSampling: { enabled: true, rateHz: 50 } })
  for (const handler of win.listeners.mousemove || []) handler({ clientX: 10, clientY: 10 })
  await ux.flush()
  assert.equal(sentEvents(sent).some((event) => event.type === 'mouse_sample'), false)
  assert.equal((win.listeners.mousemove || []).length, 0)
  win.tinyux.destroy()
})

await test('the DOM observer only watches childList and tinyux attributes', async () => {
  let options = null
  const { win } = freshInstance({}, ({ win }) => {
    win.MutationObserver = class {
      constructor(cb) { this.cb = cb }
      observe(target, opts) { options = opts }
      disconnect() {}
    }
  })
  assert.ok(options)
  assert.ok(Array.isArray(options.attributeFilter))
  assert.ok(options.attributeFilter.includes('data-tinyux-trigger'))
  assert.ok(options.attributeFilter.every((name) => name.startsWith('data-tinyux-')))
  win.tinyux.destroy()
})

await test('each section fires its own section_view (shared IntersectionObserver)', async () => {
  let observer = null
  const { win, document, sent, ux } = freshInstance({}, ({ win, document }) => {
    for (const id of ['pricing', 'faq']) {
      const el = document.createElement('section')
      el.setAttribute('id', id)
      el.setAttribute('data-tinyux-trigger', 'section-scroll')
      document.body.appendChild(el)
    }
    win.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; this.targets = []; observer = this }
      observe(el) { this.targets.push(el) }
      disconnect() {}
    }
  })
  const faq = document.getElementById('faq')
  observer.cb([{ target: faq, intersectionRatio: 0.9 }])
  await ux.flush()
  const sections = sentEvents(sent).filter((event) => event.type === 'section_view').map((event) => event.meta.section)
  assert.deepEqual(sections, ['faq'])
  win.tinyux.destroy()
})

await test('survey labels and CSP nonce are configurable; corner prompts do not steal focus', async () => {
  const { win, document, ux } = freshInstance({ ui: { nonce: 'abc123', labels: { skip: 'Später', submit: 'Senden' } } })
  ux.registerSurvey({ id: 'c', type: 'yesno', question: 'Klar?', ui: { mode: 'corner' } })
  ux.showSurvey('c')
  assert.equal(document.getElementById('tinyux-style').getAttribute('nonce'), 'abc123')
  assert.match(document.body.textContent, /Später/)
  assert.match(document.body.textContent, /Senden/)
  win.tinyux.destroy()
})

await test('closing a survey records a survey_closed event', async () => {
  const { win, document, sent, ux } = freshInstance()
  ux.registerSurvey({ id: 'c2', type: 'rating', question: 'How easy?' })
  ux.showSurvey('c2')
  document.querySelector('.tinyux-close').click()
  await ux.flush()
  const closed = sentEvents(sent).find((event) => event.type === 'survey_closed')
  assert.ok(closed)
  assert.equal(closed.meta.reason, 'close')
  win.tinyux.destroy()
})

await test('only one survey is on screen at a time', async () => {
  const { win, document, ux } = freshInstance({ surveys: { maxPerSession: 5, minIntervalMinutes: 0 } })
  ux.registerSurvey({ id: 'first', type: 'yesno', question: 'First?' })
  ux.registerSurvey({ id: 'second', type: 'yesno', question: 'Second?' })
  assert.notEqual(ux.showSurvey('first'), false)
  assert.equal(ux.showSurvey('second'), false)
  assert.equal(document.querySelectorAll('.tinyux-root').length, 1)
  document.querySelector('.tinyux-close').click()
  assert.notEqual(ux.showSurvey('second'), false)
  assert.match(document.body.textContent, /Second\?/)
  win.tinyux.destroy()
})

// ---------------------------------------------------------------------------
// v0.2 opt-in signals
// ---------------------------------------------------------------------------

await test('consent: pending holds events in memory, writes nothing, and sends after consent(true)', async () => {
  const { win, sent, ux } = freshInstance({ consent: 'pending' })
  ux.track('before_consent')
  await ux.flush()
  assert.equal(sent.length, 0)
  assert.equal(win.localStorage.map.size, 0)
  assert.equal(win.sessionStorage.map.size, 0)
  ux.registerSurvey({ id: 's', type: 'yesno', question: 'Q?' })
  assert.equal(ux.showSurvey('s'), false, 'no surveys before consent')
  win.tinyux.consent(true)
  await ux.flush()
  assert.ok(sentEvents(sent).some((event) => event.type === 'before_consent'))
  assert.ok(win.localStorage.getItem('tinyux:client_id'))
  win.tinyux.destroy()
})

await test('consent(false) clears buffered data and stored keys and stops tracking', async () => {
  const { win, sent, ux } = freshInstance()
  ux.track('x')
  assert.ok(win.localStorage.getItem('tinyux:client_id'))
  ux.consent(false)
  ux.track('after_opt_out')
  await ux.flush()
  assert.equal(sent.length, 0)
  assert.equal(listenerCount(win), 0)
  win.tinyux.destroy()
})

await test('respectGPC drops identity (or everything with "all") when the GPC signal is on', async () => {
  const a = freshInstance({ respectGPC: true, user: { id: 'u1' } }, ({ win }) => { win.navigator.globalPrivacyControl = true })
  a.ux.identify('u2')
  a.ux.track('e')
  await a.ux.flush()
  const body = a.sent.at(-1).body
  assert.equal(body.user, undefined)
  assert.equal(body.meta.gpc, true)
  a.win.tinyux.destroy()

  const b = freshInstance({ respectGPC: 'all' }, ({ win }) => { win.navigator.globalPrivacyControl = true })
  b.ux.track('e')
  await b.ux.flush()
  assert.equal(b.sent.length, 0)
  assert.equal(b.ux.isActive(), false)
  b.win.tinyux.destroy()

  const c = freshInstance({ respectGPC: true, user: { id: 'u1' } })
  c.ux.track('e')
  await c.ux.flush()
  assert.equal(c.sent.at(-1).body.user.id, 'u1', 'no GPC signal: identity is kept')
  c.win.tinyux.destroy()
})

await test('storage: none keeps ids in memory and writes nothing to web storage', async () => {
  const { win, sent, ux } = freshInstance({ storage: 'none' })
  ux.track('e')
  await ux.flush()
  assert.ok(sent.length >= 1)
  assert.ok(sent.at(-1).body.client_id)
  assert.equal(win.localStorage.map.size, 0)
  assert.equal(win.sessionStorage.map.size, 0)
  win.tinyux.destroy()
})

await test('the anonymous client_id rotates after clientIdTtlDays', async () => {
  const { win, ux } = freshInstance({}, ({ win }) => {
    win.localStorage.setItem('tinyux:client_id', 'old-id')
    win.localStorage.setItem('tinyux:client_id_ts', String(Date.now() - 400 * 86400000))
  })
  assert.notEqual(ux.getClientId(), 'old-id')
  assert.equal(win.localStorage.getItem('tinyux:client_id'), ux.getClientId())
  win.tinyux.destroy()

  const legacy = freshInstance({}, ({ win }) => { win.localStorage.setItem('tinyux:client_id', 'legacy-id') })
  assert.equal(legacy.ux.getClientId(), 'legacy-id', 'v0.1 ids are kept and start their TTL now')
  assert.ok(legacy.win.localStorage.getItem('tinyux:client_id_ts'))
  legacy.win.tinyux.destroy()
})

await test('sampleRate 0 turns the instance off; the decision is stored per session', async () => {
  const { win, sent, ux } = freshInstance({ sampleRate: 0.5 }, ({ win }) => {
    win.sessionStorage.setItem('tinyux:sample:demo', '0')
  })
  ux.track('e')
  await ux.flush()
  assert.equal(sent.length, 0)
  assert.equal(ux.isActive(), false)
  win.tinyux.destroy()
})

await test('spa: true records a page_view for each client-side route change', async () => {
  const { win, sent, ux } = freshInstance({ spa: true }, ({ win }) => {
    win.history = {
      pushState(state, title, url) { win.location = new URL(url, win.location.href) },
      replaceState(state, title, url) { win.location = new URL(url, win.location.href) }
    }
  })
  win.history.pushState({}, '', '/checkout')
  win.history.replaceState({}, '', '/checkout?step=2')
  win.history.pushState({}, '', '/done')
  await ux.flush()
  const views = sentEvents(sent).filter((event) => event.type === 'page_view' && event.meta.spa)
  assert.deepEqual(views.map((event) => event.meta.path), ['/checkout', '/done'])
  assert.equal(views[0].meta.from, '/pricing')
  win.tinyux.destroy()
})

await test('spa uses the Navigation API when it exists', async () => {
  const { win, sent, ux } = freshInstance({ spa: true }, ({ win }) => {
    win.navigation = {
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn) }
    }
  })
  win.location = new URL('https://app.example.test/settings')
  win.navigation.listeners.currententrychange.forEach((fn) => fn({}))
  await ux.flush()
  assert.ok(sentEvents(sent).some((event) => event.type === 'page_view' && event.meta.path === '/settings'))
  win.tinyux.destroy()
  assert.equal(win.navigation.listeners.currententrychange.length, 0)
})

await test('frustration: rapid clicks in one spot record a single rage_click', async () => {
  const { win, document, sent, ux } = freshInstance({ frustration: true })
  const box = document.createElement('div')
  document.body.appendChild(box)
  for (let i = 0; i < 5; i++) document.dispatchEvent({ type: 'click', target: box, clientX: 100 + i, clientY: 200, pageX: 100, pageY: 200 })
  await ux.flush()
  const rage = sentEvents(sent).filter((event) => event.type === 'rage_click')
  assert.equal(rage.length, 1)
  assert.equal(rage[0].meta.clicks, 3)
  assert.equal(rage[0].meta.path, '/pricing')
  win.tinyux.destroy()
})

await test('frustration: a button click with no DOM change is a dead_click; a click that changes the page is not', async () => {
  let observers = []
  const { win, document, sent, ux } = freshInstance({ frustration: { enabled: true, deadClickMs: 200 } }, ({ win }) => {
    win.MutationObserver = class {
      constructor(cb) { this.cb = cb; observers.push(this) }
      observe() {}
      disconnect() { this.disconnected = true }
    }
  })
  const dead = document.createElement('button')
  dead.setAttribute('id', 'dead')
  document.body.appendChild(dead)
  document.dispatchEvent({ type: 'click', target: dead, clientX: 5, clientY: 5 })
  await wait(260)
  const live = document.createElement('button')
  live.setAttribute('id', 'live')
  document.body.appendChild(live)
  document.dispatchEvent({ type: 'click', target: live, clientX: 300, clientY: 300 })
  observers.at(-1).cb([{ type: 'childList' }])
  await wait(260)
  await ux.flush()
  const deadClicks = sentEvents(sent).filter((event) => event.type === 'dead_click')
  assert.equal(deadClicks.length, 1)
  assert.equal(deadClicks[0].meta.element.id, 'dead')
  win.tinyux.destroy()
})

await test('frustration signals stay off by default', async () => {
  const { win, document, sent, ux } = freshInstance()
  for (let i = 0; i < 5; i++) document.dispatchEvent({ type: 'click', target: document.body, clientX: 1, clientY: 1 })
  await ux.flush()
  assert.equal(sentEvents(sent).some((event) => event.type === 'rage_click' || event.type === 'dead_click'), false)
  win.tinyux.destroy()
})

await test('nps surveys render 0-10 and a follow-up question collects a comment', async () => {
  const { win, document, sent, ux } = freshInstance()
  ux.registerSurvey({ id: 'nps', type: 'nps', question: 'Recommend us?', followUp: { when: '<=6', question: 'What should we fix?' } })
  ux.showSurvey('nps')
  const buttons = document.querySelector('.tinyux-row').querySelectorAll('.tinyux-btn')
  assert.equal(buttons.length, 11)
  assert.equal(buttons[0].textContent, '0')
  assert.match(document.body.textContent, /Not likely/)
  buttons[3].click()
  assert.match(document.body.textContent, /What should we fix\?/)
  const textarea = document.querySelector('textarea')
  textarea.value = 'Pricing page is confusing'
  textarea.dispatchEvent({ type: 'input' })
  document.querySelector('.tinyux-btn-primary').click()
  await ux.flush()
  const answer = sent.at(-1).body.surveys[0]
  assert.equal(answer.type, 'nps')
  assert.deepEqual(JSON.parse(JSON.stringify(answer.response)), { value: 3, comment: 'Pricing page is confusing' })
  win.tinyux.destroy()
})

await test('follow-up is skipped when the answer does not match', async () => {
  const { win, document, sent, ux } = freshInstance()
  ux.registerSurvey({ id: 'nps2', type: 'nps', question: 'Recommend us?', followUp: { when: '<=6', question: 'Why?' } })
  ux.showSurvey('nps2')
  document.querySelector('.tinyux-row').querySelectorAll('.tinyux-btn')[9].click()
  await ux.flush()
  assert.equal(sent.at(-1).body.surveys[0].response.value, 9)
  win.tinyux.destroy()
})

await test('survey theme classes and CSS variables support dark and auto modes', async () => {
  const { win, document, ux } = freshInstance({ ui: { theme: 'auto' } })
  ux.registerSurvey({ id: 't', type: 'yesno', question: 'Q?' })
  ux.showSurvey('t')
  assert.ok(document.querySelector('.tinyux-root').classList.includes('tinyux-theme-auto'))
  const style = document.getElementById('tinyux-style').textContent
  assert.match(style, /prefers-color-scheme:dark/)
  assert.match(style, /--tinyux-accent:#2540ff/)
  win.tinyux.destroy()
})

await test('with every new option off, payload keys match the v0.1 contract', async () => {
  const { win, sent, ux } = freshInstance()
  ux.track('e')
  await ux.flush()
  const body = sent.at(-1).body
  assert.deepEqual(Object.keys(body).sort(), ['app_id', 'client_id', 'events', 'meta', 'session_id', 'surveys', 'ts'])
  assert.equal(body.meta.gpc, undefined)
  assert.equal(body.meta.v, '0.2.0')
  win.tinyux.destroy()
})

await test('tinyux.min.js stays inside the gzip size budget', async () => {
  const zlib = await import('node:zlib')
  const min = fs.readFileSync(path.join(root, 'tinyux.min.js'))
  const gz = zlib.gzipSync(min, { level: 9 }).length
  const budget = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).sizeBudget.gzipBytes
  assert.ok(gz <= budget, `tinyux.min.js is ${gz} bytes gzipped, budget is ${budget}`)
  const minSource = min.toString('utf8')
  assert.match(minSource, /0\.2\.0/)
})

console.log(`\n${passed} tests passed`)
