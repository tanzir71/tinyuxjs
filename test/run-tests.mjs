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
  assert.match(style, /\.tinyux-modal\{[^}]*border-radius:0/)
  assert.match(style, /\.tinyux-btn\{[^}]*border-radius:0/)
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

await test('site chrome keeps setup code blocks dark, nav GitHub compact, and ninja favicon present', async () => {
  const css = fs.readFileSync(path.join(root, 'site.css'), 'utf8')
  assert.match(css, /\.pre-block\s*\{[^}]*background:\s*var\(--dk-bg\)/)
  assert.match(css, /header \.btn\s*\{[^}]*min-height:\s*36px/)
  assert.match(css, /header \.btn\s*\{[^}]*padding:\s*0 12px/)

  const htmlFiles = [
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
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8')
    assert.match(html, /rel="icon"/, `${file} missing favicon`)
    assert.match(html, /%F0%9F%A5%B7/, `${file} missing ninja emoji favicon`)
  }
})

await test('setup cards align code blocks and docs use reference-style article layout', async () => {
  const css = fs.readFileSync(path.join(root, 'site.css'), 'utf8')
  assert.match(css, /@supports\s*\(grid-template-rows:\s*subgrid\)/)
  assert.match(css, /\.paths\s*\{[^}]*grid-template-rows:\s*repeat\(5,\s*auto\)/)
  assert.match(css, /\.path\s*\{[^}]*grid-template-rows:\s*subgrid/)
  assert.match(css, /\.docs-main\s*\{[^}]*padding:\s*44px 0 72px/)
  assert.match(css, /\.docs-intro\s*\{[^}]*border-bottom:\s*1px solid var\(--border\)/)

  const docsHtml = fs.readFileSync(path.join(root, 'docs.html'), 'utf8')
  assert.doesNotMatch(docsHtml, /<section class="hero"/)
  assert.match(docsHtml, /<main id="content" class="docs-main">/)
  assert.match(docsHtml, /class="docs-intro"/)
  assert.match(docsHtml, /<h1>Implementation guide<\/h1>/)
})

console.log(`\n${passed} tests passed`)
