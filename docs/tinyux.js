/* tinyux.js v0.2.0 — minimal, dependency-free UX telemetry + micro-surveys
   https://github.com/tanzir71/tinyuxjs · MIT
   Privacy defaults:
   - No keystroke capture, no text content capture, no screenshots or DOM snapshots
   - No form input capture by default (see `captureInputs`: lengths/types only)
   - Optional signals (heatmaps, frustration, spa, exit intent) are off by default
*/

(function (window, document) {
  'use strict';

  var TINYUX_VERSION = '0.2.0';

  function nowMs() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function nowSec() {
    return Math.floor(nowMs() / 1000);
  }

  function clamp(n, min, max) {
    return n < min ? min : (n > max ? max : n);
  }

  function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  }

  function safeJsonStringify(v) {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return null;
    }
  }

  var HEX = null;
  function uuidv4() {
    var cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      try { return cryptoObj.randomUUID(); } catch (e) {}
    }
    if (cryptoObj && cryptoObj.getRandomValues) {
      var buf = new Uint8Array(16);
      cryptoObj.getRandomValues(buf);
      buf[6] = (buf[6] & 0x0f) | 0x40;
      buf[8] = (buf[8] & 0x3f) | 0x80;
      if (!HEX) {
        HEX = [];
        for (var i = 0; i < 256; i++) HEX[i] = (i + 0x100).toString(16).slice(1);
      }
      return (
        HEX[buf[0]] + HEX[buf[1]] + HEX[buf[2]] + HEX[buf[3]] + '-' +
        HEX[buf[4]] + HEX[buf[5]] + '-' +
        HEX[buf[6]] + HEX[buf[7]] + '-' +
        HEX[buf[8]] + HEX[buf[9]] + '-' +
        HEX[buf[10]] + HEX[buf[11]] + HEX[buf[12]] + HEX[buf[13]] + HEX[buf[14]] + HEX[buf[15]]
      );
    }
    var d = nowMs();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function throttle(fn, waitMs) {
    var last = 0;
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      var t = nowMs();
      var remaining = waitMs - (t - last);
      if (remaining <= 0) {
        last = t;
        fn.apply(ctx, args);
      } else if (!timer) {
        timer = window.setTimeout(function () {
          timer = null;
          last = nowMs();
          fn.apply(ctx, args);
        }, remaining);
      }
    };
  }

  function debounce(fn, waitMs) {
    var timer = null;
    var wrapped = function () {
      var ctx = this;
      var args = arguments;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        timer = null;
        fn.apply(ctx, args);
      }, waitMs);
    };
    wrapped.cancel = function () {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };
    return wrapped;
  }

  function Emitter() {
    this._h = {};
  }
  Emitter.prototype.on = function (evt, handler) {
    if (!this._h[evt]) this._h[evt] = [];
    this._h[evt].push(handler);
    return function () {
      var arr = this._h[evt] || [];
      var next = [];
      for (var i = 0; i < arr.length; i++) if (arr[i] !== handler) next.push(arr[i]);
      this._h[evt] = next;
    }.bind(this);
  };
  Emitter.prototype.emit = function (evt, payload) {
    var arr = this._h[evt] || [];
    for (var i = 0; i < arr.length; i++) {
      try {
        arr[i](payload);
      } catch (e) {}
    }
  };

  function RingBuffer(capacity) {
    this.cap = Math.max(1, capacity | 0);
    this.arr = new Array(this.cap);
    this.start = 0;
    this.size = 0;
  }
  RingBuffer.prototype.push = function (item) {
    var idx = (this.start + this.size) % this.cap;
    this.arr[idx] = item;
    if (this.size < this.cap) {
      this.size++;
    } else {
      this.start = (this.start + 1) % this.cap;
    }
  };
  RingBuffer.prototype.take = function (n) {
    var out = [];
    var count = Math.min(n | 0, this.size);
    for (var i = 0; i < count; i++) {
      out.push(this.arr[(this.start + i) % this.cap]);
    }
    this.start = (this.start + count) % this.cap;
    this.size -= count;
    return out;
  };
  RingBuffer.prototype.clear = function () {
    this.start = 0;
    this.size = 0;
  };

  /* In-memory storage used for `storage: 'none'` and before consent is granted. */
  function MemStore() {
    this.m = {};
  }
  MemStore.prototype.getItem = function (k) {
    return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null;
  };
  MemStore.prototype.setItem = function (k, v) {
    this.m[k] = String(v);
  };
  MemStore.prototype.removeItem = function (k) {
    delete this.m[k];
  };

  function storageGet(storage, key) {
    try {
      var v = storage.getItem(key);
      return v == null ? null : v;
    } catch (e) {
      return null;
    }
  }
  function storageSet(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }
  function storageDel(storage, key) {
    try {
      storage.removeItem(key);
    } catch (e) {}
  }
  function storageClearPrefix(storage, prefix) {
    try {
      if (!storage || typeof storage.key !== 'function') return;
      var keys = [];
      for (var i = 0; i < storage.length; i++) {
        var k = storage.key(i);
        if (k && k.indexOf(prefix) === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) storage.removeItem(keys[j]);
    } catch (e) {}
  }

  function pickDataset(el, cfg) {
    if (!el || !el.dataset) return null;
    var allow = cfg.datasetAllowlist;
    var deny = cfg.datasetDenylist || [];
    var out = {};
    for (var k in el.dataset) {
      if (!Object.prototype.hasOwnProperty.call(el.dataset, k)) continue;
      if (allow && allow.length && allow.indexOf(k) === -1) continue;
      var low = String(k).toLowerCase();
      var blocked = false;
      for (var i = 0; i < deny.length; i++) {
        if (low.indexOf(String(deny[i]).toLowerCase()) !== -1) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      var val = String(el.dataset[k]);
      if (val.length > 200) val = val.slice(0, 200);
      out[k] = val;
    }
    return out;
  }

  function rectMeta(el) {
    if (!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }

  function elementMeta(el, cfg, intersectionRatio) {
    if (!el || !el.tagName) return null;
    var cls = [];
    try {
      if (el.classList && el.classList.length) {
        for (var i = 0; i < el.classList.length; i++) cls.push(el.classList[i]);
      }
    } catch (e) {}
    var meta = {
      tag: String(el.tagName).toLowerCase(),
      id: el.id ? String(el.id).slice(0, 80) : undefined,
      classList: cls.length ? cls.slice(0, 16) : undefined,
      dataset: pickDataset(el, cfg) || undefined,
      rect: rectMeta(el) || undefined
    };
    if (typeof intersectionRatio === 'number') meta.intersection = Math.round(intersectionRatio * 1000) / 1000;
    return meta;
  }

  function closestMatch(target, selector) {
    if (!target || target === document) return null;
    var el = target;
    var matches = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
    while (el && el !== document.documentElement) {
      if (matches && matches.call(el, selector)) return el;
      el = el.parentElement || el.parentNode;
      if (el && el.nodeType && el.nodeType !== 1) el = null;
    }
    return null;
  }

  /* Interactive elements for dead-click detection. Inputs, selects and labels are
     excluded because they change state without DOM mutations. */
  var INTERACTIVE_ROLES = ['button', 'link', 'tab', 'menuitem', 'option', 'switch'];
  function closestInteractive(target) {
    var el = target;
    var depth = 0;
    while (el && el !== document && el !== document.documentElement && depth < 8) {
      if (el.tagName && el.getAttribute) {
        var tag = String(el.tagName).toLowerCase();
        var role = (el.getAttribute('role') || '').toLowerCase();
        if (tag === 'a') {
          if (el.getAttribute('href') == null) return null;
          if ((el.getAttribute('target') || '').toLowerCase() === '_blank' || el.getAttribute('download') != null) return null;
          return el;
        }
        if (tag === 'button' || tag === 'summary') return el;
        if (tag === 'input') {
          var type = (el.getAttribute('type') || '').toLowerCase();
          return (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') ? el : null;
        }
        if (tag === 'select' || tag === 'textarea' || tag === 'label') return null;
        if (INTERACTIVE_ROLES.indexOf(role) !== -1) return el;
      }
      el = el.parentElement || el.parentNode;
      depth++;
    }
    return null;
  }

  function computeScrollPct() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.pageYOffset || (doc && doc.scrollTop) || (body && body.scrollTop) || 0;
    var scrollHeight = (doc && doc.scrollHeight) || (body && body.scrollHeight) || 0;
    var clientHeight = (doc && doc.clientHeight) || window.innerHeight || 1;
    var denom = Math.max(1, scrollHeight - clientHeight);
    return clamp(Math.round((scrollTop / denom) * 100), 0, 100);
  }

  function safeUrl(cfg) {
    try {
      var u = new URL(window.location.href);
      var out = u.origin + u.pathname;
      if (cfg.includeQueryString) out += u.search;
      return out;
    } catch (e) {
      return String(window.location.href).split('#')[0];
    }
  }

  function safeReferrer(cfg) {
    try {
      if (!document.referrer) return '';
      var u = new URL(document.referrer);
      var out = u.origin + u.pathname;
      if (cfg.includeQueryString) out += u.search;
      return out;
    } catch (e) {
      return '';
    }
  }

  function safePath(cfg) {
    try {
      var u = new URL(window.location.href);
      var out = u.pathname || '/';
      if (cfg.includeQueryString) out += u.search;
      return out;
    } catch (e) {
      return '/';
    }
  }

  function defaultLabels() {
    return {
      close: 'Close',
      skip: 'Skip',
      submit: 'Submit',
      yes: 'Yes',
      no: 'No',
      thanksTitle: 'Thanks',
      thanksMessage: 'Feedback submitted',
      npsLow: 'Not likely',
      npsHigh: 'Very likely',
      followUpPlaceholder: 'Optional'
    };
  }

  function defaultConfig() {
    return {
      appId: '',
      apiUrl: '',
      apiKey: '',

      bufferCapacity: 200,
      batchSize: 10,
      heartbeatMs: 30000,
      retentionLimit: 20,
      maxPayloadBytes: 60000,

      includeQueryString: false,
      debug: false,

      datasetAllowlist: null,
      datasetDenylist: ['email', 'name', 'phone', 'token', 'auth', 'password', 'session', 'ssn'],

      /* Privacy and consent */
      consent: 'granted',          // 'granted' | 'pending' (call ux.consent(true|false))
      storage: 'local',            // 'local' | 'session' | 'none'
      clientIdTtlDays: 395,        // rotate the anonymous client_id after ~13 months
      respectGPC: false,           // true: drop identity when GPC is on · 'all': do not track at all
      sampleRate: 1,               // 0..1, decided once per session

      captureInputs: false,
      heatmaps: { enabled: false, clicks: true, taps: true },
      frustration: { enabled: false, rageClicks: 3, rageWindowMs: 700, rageRadiusPx: 24, deadClickMs: 1000 },
      spa: false,

      exitIntent: { enabled: false, sensitivity: 12, oncePerSession: true, cooldownMinutes: 60 },
      sectionScroll: { threshold: 0.5 },

      surveys: { maxPerSession: 2, minIntervalMinutes: 5 },
      ui: {
        accentColor: '#2540ff',
        zIndex: 2147483647,
        theme: 'light',            // 'light' | 'dark' | 'auto'
        nonce: '',                 // CSP nonce for the injected <style>
        labels: defaultLabels()
      },

      domScanThrottleMs: 500,
      scrollThrottleMs: 250,
      mouseThrottleMs: 200,
      interactionCooldownMs: 800
    };
  }

  function mergeConfig(base, override) {
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (var k2 in override) {
      if (!Object.prototype.hasOwnProperty.call(override, k2)) continue;
      if (isObject(base[k2]) && isObject(override[k2])) out[k2] = mergeConfig(base[k2], override[k2]);
      else out[k2] = override[k2];
    }
    return out;
  }

  /* `heatmaps: true`, `frustration: true` and `exitIntent: true` are shorthands for `{ enabled: true }`. */
  function normalizeConfig(cfg) {
    var defs = defaultConfig();
    var keys = ['heatmaps', 'frustration', 'exitIntent'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (cfg[k] === true) cfg[k] = mergeConfig(defs[k], { enabled: true });
      else if (cfg[k] === false || cfg[k] == null) cfg[k] = mergeConfig(defs[k], { enabled: false });
    }
    if (!isObject(cfg.ui)) cfg.ui = defs.ui;
    cfg.ui.labels = mergeConfig(defaultLabels(), isObject(cfg.ui.labels) ? cfg.ui.labels : {});
    if (['local', 'session', 'none'].indexOf(cfg.storage) === -1) cfg.storage = 'local';
    var rate = Number(cfg.sampleRate);
    cfg.sampleRate = isFinite(rate) ? clamp(rate, 0, 1) : 1;
    return cfg;
  }

  function clonePlainObject(obj) {
    var out = {};
    if (!isObject(obj)) return out;
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (v == null) continue;
      if (typeof v === 'function') continue;
      out[k] = v;
    }
    return out;
  }

  function normalizeUserIdentity(input, traits) {
    var src = isObject(input) ? input : {};
    var out = {};
    var traitOut = {};

    if (typeof input === 'string' || typeof input === 'number') out.id = String(input).slice(0, 160);
    else if (src.id != null) out.id = String(src.id).slice(0, 160);
    else if (src.user_id != null) out.id = String(src.user_id).slice(0, 160);

    if (src.account_id != null) out.account_id = String(src.account_id).slice(0, 160);

    var srcTraits = clonePlainObject(src.traits);
    for (var st in srcTraits) if (Object.prototype.hasOwnProperty.call(srcTraits, st)) traitOut[st] = srcTraits[st];

    for (var sk in src) {
      if (!Object.prototype.hasOwnProperty.call(src, sk)) continue;
      if (sk === 'id' || sk === 'user_id' || sk === 'account_id' || sk === 'traits') continue;
      if (src[sk] == null || typeof src[sk] === 'function') continue;
      traitOut[sk] = src[sk];
    }

    if (isObject(traits)) {
      if (traits.account_id != null) out.account_id = String(traits.account_id).slice(0, 160);
      for (var tk in traits) {
        if (!Object.prototype.hasOwnProperty.call(traits, tk)) continue;
        if (tk === 'account_id') continue;
        if (traits[tk] == null || typeof traits[tk] === 'function') continue;
        traitOut[tk] = traits[tk];
      }
    }

    var hasTraits = false;
    for (var k in traitOut) {
      if (Object.prototype.hasOwnProperty.call(traitOut, k)) {
        hasTraits = true;
        break;
      }
    }
    if (hasTraits) out.traits = traitOut;
    if (!out.id && !out.account_id && !hasTraits) return null;
    return out;
  }

  function cloneUserIdentity(user) {
    if (!user) return null;
    var out = {};
    if (user.id != null) out.id = user.id;
    if (user.account_id != null) out.account_id = user.account_id;
    if (isObject(user.traits)) out.traits = clonePlainObject(user.traits);
    return out;
  }

  /* followUp.when: an array of values, a comparison string ('<=3', '>=9', '==no'), or a single value. */
  function matchesWhen(when, value) {
    if (when == null) return true;
    if (Array.isArray(when)) return when.indexOf(value) !== -1;
    if (typeof when === 'string') {
      var m = when.match(/^\s*(<=|>=|==|!=|<|>)\s*(.+)$/);
      if (m) {
        var rhs = m[2];
        var num = Number(rhs);
        var lhs = value;
        if (!isNaN(num) && typeof value === 'number') rhs = num;
        else lhs = String(value);
        if (m[1] === '<=') return lhs <= rhs;
        if (m[1] === '>=') return lhs >= rhs;
        if (m[1] === '<') return lhs < rhs;
        if (m[1] === '>') return lhs > rhs;
        if (m[1] === '!=') return lhs != rhs; // eslint-disable-line eqeqeq
        return lhs == rhs; // eslint-disable-line eqeqeq
      }
    }
    return when === value;
  }

  function TinyUXInstance(userCfg) {
    var cfg = normalizeConfig(mergeConfig(defaultConfig(), userCfg || {}));
    var emitter = new Emitter();
    var buffer = new RingBuffer(cfg.bufferCapacity);
    var pendingSurveys = [];
    var surveysById = {};
    var cleanups = [];
    var boundElements = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var memDurable = new MemStore();
    var memSession = new MemStore();

    var metrics = {
      interaction_count: 0,
      click_count: 0,
      scroll_pct_max: 0,
      heartbeat_count: 0,
      exit_intent_count: 0
    };

    var startMs = nowMs();
    var focusStartMs = document.hasFocus && document.hasFocus() ? nowMs() : null;
    var focusedMs = 0;

    var lastSurveyShownAtMs = 0;
    var surveysShownThisSession = 0;
    var surveyOnScreen = false;

    var nav = typeof navigator !== 'undefined' ? navigator : (window.navigator || {});
    var gpc = !!(cfg.respectGPC && nav && nav.globalPrivacyControl === true);
    var dropIdentity = gpc;
    var consentGranted = cfg.consent !== 'pending';
    var active = !(gpc && cfg.respectGPC === 'all');
    var userIdentity = dropIdentity ? null : normalizeUserIdentity(cfg.user);

    var STORAGE_CLIENT_ID = 'tinyux:client_id';
    var STORAGE_CLIENT_TS = 'tinyux:client_id_ts';
    var STORAGE_SESSION_ID = 'tinyux:session_id';
    var STORAGE_QUEUE = 'tinyux:failed_queue:' + (cfg.appId || '');
    var STORAGE_SURVEY_STATE = 'tinyux:survey_state:' + (cfg.appId || '');
    var STORAGE_SAMPLE = 'tinyux:sample:' + (cfg.appId || '');

    function safeStorage(name) {
      try {
        var s = window[name];
        return s || null;
      } catch (e) {
        return null;
      }
    }

    /* Long-lived storage: client id, retry queue, survey cooldowns. */
    function durable() {
      if (!consentGranted || cfg.storage === 'none') return memDurable;
      var s = safeStorage(cfg.storage === 'session' ? 'sessionStorage' : 'localStorage');
      return s || memDurable;
    }

    /* Per-tab storage: session id, once-per-session flags, sampling decision. */
    function sess() {
      if (!consentGranted || cfg.storage === 'none') return memSession;
      return safeStorage('sessionStorage') || memSession;
    }

    var clientId = null;
    var sessionId = null;
    function ensureIds() {
      var d = durable();
      var s = sess();
      var ttl = Math.max(1, Number(cfg.clientIdTtlDays) || 395) * 86400000;
      var stored = storageGet(d, STORAGE_CLIENT_ID);
      var ts = parseInt(storageGet(d, STORAGE_CLIENT_TS) || '0', 10) || 0;
      if (stored && ts && nowMs() - ts > ttl) {
        stored = null;
        clientId = null;
      }
      if (!stored) {
        stored = clientId || uuidv4();
        ts = 0;
      }
      if (!ts) ts = nowMs();
      storageSet(d, STORAGE_CLIENT_ID, stored);
      storageSet(d, STORAGE_CLIENT_TS, String(ts));
      clientId = stored;
      var sid = storageGet(s, STORAGE_SESSION_ID);
      if (!sid) {
        sid = sessionId || uuidv4();
        storageSet(s, STORAGE_SESSION_ID, sid);
      }
      sessionId = sid;
    }

    function decideSampling() {
      if (cfg.sampleRate >= 1) return true;
      if (cfg.sampleRate <= 0) return false;
      var s = sess();
      var stored = storageGet(s, STORAGE_SAMPLE);
      if (stored === '1' || stored === '0') return stored === '1';
      var inSample = Math.random() < cfg.sampleRate;
      storageSet(s, STORAGE_SAMPLE, inSample ? '1' : '0');
      return inSample;
    }

    ensureIds();
    if (active && !decideSampling()) active = false;

    function debugLog() {
      if (!cfg.debug || !window.console || !console.log) return;
      try {
        console.log.apply(console, arguments);
      } catch (e) {}
    }

    /* Every listener, observer and timer goes through these so stop() can unwind them. */
    function listen(target, type, fn, opts) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, opts);
      cleanups.push(function () {
        try {
          target.removeEventListener(type, fn, opts);
        } catch (e) {}
      });
    }
    var timeouts = [];
    function later(fn, ms) {
      var id = window.setTimeout(function () {
        var idx = timeouts.indexOf(id);
        if (idx !== -1) timeouts.splice(idx, 1);
        fn();
      }, ms);
      timeouts.push(id);
      return id;
    }

    function makeEvent(type, meta) {
      return {
        id: uuidv4(),
        type: String(type || 'event'),
        ts: nowSec(),
        meta: meta || {}
      };
    }

    function enqueueEvent(type, meta) {
      if (!active) return;
      buffer.push(makeEvent(type, meta));
      if (buffer.size >= cfg.batchSize) scheduleFlush('threshold');
    }

    var flushTimer = null;
    function scheduleFlush(reason) {
      if (flushTimer || !active) return;
      flushTimer = window.setTimeout(function () {
        flushTimer = null;
        flush(reason || 'scheduled');
      }, 250);
    }

    var queueSeq = 0;
    function queueItem(payload, attempts, nextAttemptMs) {
      queueSeq++;
      return { id: 'q-' + nowMs() + '-' + queueSeq + '-' + Math.floor(Math.random() * 1e6), payload: payload, attempts: attempts | 0, nextAttemptMs: nextAttemptMs || 0 };
    }

    function backoffMs(attempts) {
      return Math.min(5 * 60 * 1000, 5000 * Math.pow(2, Math.max(0, (attempts | 0) - 1)));
    }

    function loadQueue() {
      var raw = storageGet(durable(), STORAGE_QUEUE);
      var q = raw ? safeJsonParse(raw) : null;
      if (!Array.isArray(q)) return [];
      return q;
    }

    function saveQueue(q) {
      var pruned = q.slice(0, Math.max(0, cfg.retentionLimit | 0));
      storageSet(durable(), STORAGE_QUEUE, safeJsonStringify(pruned) || '[]');
    }

    function buildMetaSnapshot() {
      var viewportW = (document.documentElement && document.documentElement.clientWidth) || window.innerWidth || 0;
      var viewportH = (document.documentElement && document.documentElement.clientHeight) || window.innerHeight || 0;
      var scrollPct = computeScrollPct();
      metrics.scroll_pct_max = Math.max(metrics.scroll_pct_max, scrollPct);
      var focusNow = document.hasFocus && document.hasFocus();
      if (focusNow && focusStartMs == null) focusStartMs = nowMs();
      if (!focusNow && focusStartMs != null) {
        focusedMs += nowMs() - focusStartMs;
        focusStartMs = null;
      }

      var totalFocusedMs = focusedMs;
      if (focusStartMs != null) totalFocusedMs += nowMs() - focusStartMs;

      var meta = {
        url: safeUrl(cfg),
        referrer: safeReferrer(cfg),
        viewport: { w: viewportW, h: viewportH },
        scroll_pct: scrollPct,
        t_ms: nowMs() - startMs,
        focus_ms: totalFocusedMs,
        interaction_count: metrics.interaction_count,
        click_count: metrics.click_count,
        scroll_pct_max: metrics.scroll_pct_max,
        v: TINYUX_VERSION
      };

      var userSnap = cloneUserIdentity(userIdentity);
      if (userSnap) meta.user = userSnap;
      if (gpc) meta.gpc = true;

      if (cfg.computeScore) {
        try {
          meta.score = Number(cfg.computeScore(meta)) || 0;
        } catch (e) {}
      } else {
        meta.score = Math.round((metrics.interaction_count * 1.0) + (metrics.scroll_pct_max / 10) + (meta.focus_ms / 60000));
      }
      return meta;
    }

    function buildPayload(events, surveys) {
      var payload = {
        app_id: cfg.appId,
        client_id: clientId,
        session_id: sessionId,
        ts: nowSec(),
        meta: buildMetaSnapshot(),
        events: events || [],
        surveys: surveys || []
      };
      var userSnap = cloneUserIdentity(userIdentity);
      if (userSnap) payload.user = userSnap;
      return payload;
    }

    /* Split a payload until it fits under maxPayloadBytes (one event always fits). */
    function splitPayload(payload, out) {
      var str = safeJsonStringify(payload) || '{}';
      if (str.length <= cfg.maxPayloadBytes || (payload.events || []).length <= 1) {
        out.push(payload);
        return out;
      }
      var half = Math.floor(payload.events.length / 2);
      var head = buildPayload(payload.events.slice(0, half), payload.surveys);
      var tail = buildPayload(payload.events.slice(half), []);
      splitPayload(head, out);
      splitPayload(tail, out);
      return out;
    }

    /* Drain the whole buffer (and pending survey answers) into payloads. */
    function takeFreshPayloads() {
      var out = [];
      while (buffer.size || pendingSurveys.length) {
        var events = buffer.take(cfg.batchSize);
        var surveys = pendingSurveys.splice(0, pendingSurveys.length);
        splitPayload(buildPayload(events, surveys), out);
      }
      return out;
    }

    function canSend() {
      return active && consentGranted && cfg.apiUrl && cfg.appId;
    }

    function postJson(url, payload) {
      var body = safeJsonStringify(payload) || '{}';
      var headers = { 'Content-Type': 'application/json' };
      if (cfg.apiKey) headers['X-API-KEY'] = cfg.apiKey;
      if (typeof fetch !== 'function') return Promise.resolve({ ok: false, status: 0 });
      return fetch(url, {
        method: 'POST',
        headers: headers,
        body: body,
        keepalive: body.length < 60000,
        credentials: 'omit'
      }).then(function (res) {
        return { ok: res.ok, status: res.status };
      }).catch(function (err) {
        return { ok: false, status: 0, error: err };
      });
    }

    /* Beacons use text/plain (a CORS-safelisted type), so cross-origin collectors need no preflight. */
    function beacon(payload) {
      var body = safeJsonStringify(payload) || '{}';
      if (nav && typeof nav.sendBeacon === 'function') {
        try {
          return nav.sendBeacon(cfg.apiUrl, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
        } catch (e) {
          return false;
        }
      }
      if (typeof fetch !== 'function') return false;
      try {
        fetch(cfg.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: body,
          keepalive: true,
          credentials: 'omit'
        }).then(function (res) {
          if (!res.ok) persistForRetry([payload]);
        }, function () {
          persistForRetry([payload]);
        });
        return true;
      } catch (e2) {
        return false;
      }
    }

    function persistForRetry(payloads) {
      if (!payloads.length) return;
      var q = loadQueue();
      for (var i = 0; i < payloads.length; i++) q.unshift(queueItem(payloads[i], 0, 0));
      saveQueue(q);
    }

    /* Page is going away: send everything that is buffered, keep what does not fit for next time. */
    function flushOnHide(reason) {
      if (!canSend()) return false;
      var payloads = takeFreshPayloads();
      var leftovers = [];
      var sentCount = 0;
      for (var i = 0; i < payloads.length; i++) {
        if (beacon(payloads[i])) sentCount++;
        else leftovers.push(payloads[i]);
      }
      persistForRetry(leftovers);
      if (sentCount) emitter.emit('sent', { reason: reason, status: 0, beacon: true, payloads: sentCount });
      return !leftovers.length;
    }

    var sending = false;
    function flush(reason, opts) {
      if (opts && opts.useBeacon) return Promise.resolve(flushOnHide(reason));
      if (!canSend() || sending) return Promise.resolve(false);
      sending = true;

      var t = nowMs();
      var due = [];
      var stored = loadQueue();
      for (var i = 0; i < stored.length; i++) {
        var item = stored[i];
        if (item && item.payload && typeof item.nextAttemptMs === 'number' && item.nextAttemptMs <= t) due.push(item);
      }
      var fresh = takeFreshPayloads();
      var work = [];
      for (var d = 0; d < due.length; d++) work.push({ item: due[d], queued: true });
      for (var f = 0; f < fresh.length; f++) work.push({ item: queueItem(fresh[f], 0, 0), queued: false });

      if (!work.length) {
        sending = false;
        return Promise.resolve(true);
      }

      var delivered = {};
      var retry = {};
      var newFailures = [];

      function finish(ok) {
        /* Re-read the queue: other code (unload beacons) may have changed it meanwhile. */
        var current = loadQueue();
        var next = [];
        for (var c = 0; c < current.length; c++) {
          var it = current[c];
          if (!it || delivered[it.id]) continue;
          next.push(retry[it.id] || it);
        }
        for (var n = newFailures.length - 1; n >= 0; n--) next.unshift(newFailures[n]);
        saveQueue(next);
        sending = false;
        return ok;
      }

      function step(idx) {
        if (idx >= work.length) return finish(true);
        var w = work[idx];
        return postJson(cfg.apiUrl, w.item.payload).then(function (res) {
          if (res.ok) {
            if (w.queued) delivered[w.item.id] = true;
            emitter.emit('sent', { reason: reason, status: res.status, beacon: false });
            debugLog('[tinyux] sent', reason, res.status);
            return step(idx + 1);
          }
          emitter.emit('send_error', { reason: reason, status: res.status, error: res.error });
          debugLog('[tinyux] send failed', reason, res.status);
          /* Stop at the first failure and keep this item plus everything after it. */
          for (var r = idx; r < work.length; r++) {
            var wi = work[r];
            var attempts = (wi.item.attempts | 0) + (r === idx ? 1 : 0);
            var bumped = { id: wi.item.id, payload: wi.item.payload, attempts: attempts, nextAttemptMs: nowMs() + backoffMs(Math.max(1, attempts)) };
            if (wi.queued) retry[wi.item.id] = bumped;
            else newFailures.push(bumped);
          }
          return finish(false);
        });
      }

      return step(0);
    }

    function templateWithDataset(text, ds) {
      if (!text) return '';
      var s = String(text);
      return s.replace(/\{\{\s*(data-[a-zA-Z0-9_-]+)\s*\}\}/g, function (_, token) {
        var key = token.slice(5).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
        if (!ds || !Object.prototype.hasOwnProperty.call(ds, key)) return '';
        var v = String(ds[key]);
        if (v.length > 200) v = v.slice(0, 200);
        return v;
      });
    }

    function loadSurveyState() {
      var raw = storageGet(durable(), STORAGE_SURVEY_STATE);
      var st = raw ? safeJsonParse(raw) : null;
      return isObject(st) ? st : {};
    }
    function saveSurveyState(st) {
      storageSet(durable(), STORAGE_SURVEY_STATE, safeJsonStringify(st) || '{}');
    }

    function dayKey(tsMs) {
      var dt = new Date(tsMs);
      var y = dt.getFullYear();
      var m = String(dt.getMonth() + 1);
      var dd = String(dt.getDate());
      if (m.length < 2) m = '0' + m;
      if (dd.length < 2) dd = '0' + dd;
      return y + '-' + m + '-' + dd;
    }

    function surveySessionKey(id) {
      return 'tinyux:survey_session:' + (cfg.appId || '') + ':' + id;
    }

    function canShowSurvey(survey) {
      if (!survey || !survey.survey_id) return false;
      if (!active || !consentGranted) return false;
      if (surveyOnScreen) return false;
      var id = survey.survey_id;
      var t = nowMs();
      if (cfg.surveys && typeof cfg.surveys.maxPerSession === 'number') {
        if (surveysShownThisSession >= cfg.surveys.maxPerSession) return false;
      }
      if (cfg.surveys && typeof cfg.surveys.minIntervalMinutes === 'number') {
        var minGap = cfg.surveys.minIntervalMinutes * 60 * 1000;
        if (lastSurveyShownAtMs && t - lastSurveyShownAtMs < minGap) return false;
      }
      if (survey.oncePerSession) {
        if (storageGet(sess(), surveySessionKey(id)) === '1') return false;
      }
      var st = loadSurveyState();
      var entry = st[id] || {};
      if (survey.cooldownMinutes && entry.lastShownAtMs) {
        var cd = survey.cooldownMinutes * 60 * 1000;
        if (t - entry.lastShownAtMs < cd) return false;
      }
      if (survey.maxPerDay) {
        var dk = dayKey(t);
        var c = (entry.dailyCounts && entry.dailyCounts[dk]) ? entry.dailyCounts[dk] : 0;
        if (c >= survey.maxPerDay) return false;
      }
      return true;
    }

    function markSurveyShown(survey) {
      if (!survey || !survey.survey_id) return;
      var id = survey.survey_id;
      var t = nowMs();
      surveysShownThisSession++;
      lastSurveyShownAtMs = t;
      if (survey.oncePerSession) storageSet(sess(), surveySessionKey(id), '1');
      var st = loadSurveyState();
      var entry = st[id] || {};
      entry.lastShownAtMs = t;
      if (survey.maxPerDay) {
        var dk = dayKey(t);
        var prev = (entry.dailyCounts && entry.dailyCounts[dk]) || 0;
        entry.dailyCounts = {};
        entry.dailyCounts[dk] = prev + 1;
      }
      st[id] = entry;
      saveSurveyState(st);
    }

    function themeClass() {
      var th = cfg.ui && cfg.ui.theme;
      return 'tinyux-theme-' + (th === 'dark' || th === 'auto' ? th : 'light');
    }

    function ensureStyles() {
      if (document.getElementById('tinyux-style')) return;
      var style = document.createElement('style');
      style.id = 'tinyux-style';
      style.type = 'text/css';
      if (cfg.ui && cfg.ui.nonce) style.setAttribute('nonce', String(cfg.ui.nonce));
      var accent = String(cfg.ui && cfg.ui.accentColor ? cfg.ui.accentColor : '#2540ff');
      var z = cfg.ui && cfg.ui.zIndex ? cfg.ui.zIndex : 2147483647;
      var dark = '--tinyux-bg:#16171a;--tinyux-fg:#f4f3ee;--tinyux-muted:#a3a39b;--tinyux-border:#f4f3ee;--tinyux-line:#3a3b3f;--tinyux-button:#1f2024;';

      /* Theme with CSS custom properties: override any --tinyux-* variable on .tinyux-root in your own CSS. */
      style.textContent =
        ':where(.tinyux-root,.tinyux-toast){--tinyux-bg:#f4f3ee;--tinyux-fg:#0a0a0a;--tinyux-muted:#6b6b66;--tinyux-border:#0a0a0a;--tinyux-line:#cfcdc4;--tinyux-button:#fbfaf6;--tinyux-accent:' + accent + ';--tinyux-accent-fg:#fff;--tinyux-radius:0;--tinyux-font:Inter,Helvetica Neue,Helvetica,Arial,system-ui,sans-serif;}' +
        ':where(.tinyux-theme-dark){' + dark + '}' +
        '@media (prefers-color-scheme:dark){:where(.tinyux-theme-auto){' + dark + '}}' +
        '.tinyux-root{position:fixed;inset:0;z-index:' + z + ';font-family:var(--tinyux-font);}' +
        'dialog.tinyux-root{margin:0;padding:0;border:0;width:100%;height:100%;max-width:none;max-height:none;background:transparent;overflow:visible;}' +
        'dialog.tinyux-root::backdrop{background:rgba(10,10,10,.52);}' +
        '.tinyux-root-corner{pointer-events:none;}' +
        '.tinyux-overlay{position:absolute;inset:0;background:rgba(10,10,10,.52);backdrop-filter:saturate(120%) blur(2px);}' +
        '.tinyux-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));box-sizing:border-box;background:var(--tinyux-bg);color:var(--tinyux-fg);border:1px solid var(--tinyux-border);border-radius:var(--tinyux-radius);box-shadow:none;}' +
        '.tinyux-root-corner .tinyux-modal{position:fixed;transform:none;width:min(380px,calc(100vw - 28px));pointer-events:auto;}' +
        '.tinyux-pos-bottom-right .tinyux-modal{right:14px;bottom:14px;left:auto;top:auto;}' +
        '.tinyux-pos-bottom-left .tinyux-modal{left:14px;bottom:14px;top:auto;}' +
        '.tinyux-pos-top-right .tinyux-modal{right:14px;top:14px;left:auto;}' +
        '.tinyux-pos-top-left .tinyux-modal{left:14px;top:14px;}' +
        '.tinyux-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 0 16px;}' +
        '.tinyux-title{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--tinyux-muted)}' +
        '.tinyux-close{appearance:none;border:1px solid transparent;background:transparent;color:var(--tinyux-fg);font-size:20px;line-height:1;padding:4px 8px;border-radius:var(--tinyux-radius);cursor:pointer;}' +
        '.tinyux-body{padding:14px 16px 16px 16px;}' +
        '.tinyux-q{font-size:17px;line-height:1.35;margin:6px 0 14px 0;color:var(--tinyux-fg);font-weight:650;letter-spacing:-.02em;}' +
        '.tinyux-sub{font-size:13px;color:var(--tinyux-muted);margin:0 0 14px 0;}' +
        '.tinyux-row{display:flex;flex-wrap:wrap;gap:10px;}' +
        '.tinyux-scale-hint{display:flex;justify-content:space-between;gap:12px;margin-top:8px;font-size:12px;color:var(--tinyux-muted);}' +
        '.tinyux-btn{appearance:none;border:1px solid var(--tinyux-line);background:var(--tinyux-button);color:var(--tinyux-fg);padding:10px 12px;border-radius:var(--tinyux-radius);cursor:pointer;min-width:44px;text-align:center;font:550 13px/1 var(--tinyux-font);}' +
        '.tinyux-row.tinyux-nps{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:6px;}' +
        '.tinyux-nps .tinyux-btn{min-width:0;padding:10px 0;}' +
        '.tinyux-btn:hover{border-color:var(--tinyux-accent);}' +
        '.tinyux-btn:focus-visible,.tinyux-close:focus-visible,.tinyux-input:focus-visible{outline:2px solid var(--tinyux-accent);outline-offset:2px;}' +
        '.tinyux-btn-primary{background:var(--tinyux-accent);border-color:var(--tinyux-accent);color:var(--tinyux-accent-fg);font-weight:650;}' +
        '.tinyux-btn[disabled]{opacity:.5;cursor:default;}' +
        '.tinyux-input{width:100%;box-sizing:border-box;border-radius:var(--tinyux-radius);border:1px solid var(--tinyux-line);background:var(--tinyux-button);color:var(--tinyux-fg);padding:10px 12px;font:14px/1.4 var(--tinyux-font);}' +
        '.tinyux-footer{display:flex;justify-content:flex-end;gap:10px;padding:0 16px 16px 16px;}' +
        '.tinyux-toast{position:fixed;right:14px;bottom:14px;z-index:' + z + ';background:var(--tinyux-bg);color:var(--tinyux-fg);border:1px solid var(--tinyux-border);border-radius:var(--tinyux-radius);padding:10px 12px;box-shadow:none;font-family:var(--tinyux-font);max-width:min(420px,calc(100vw - 28px));}' +
        '.tinyux-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}' +
        '@media (prefers-reduced-motion:no-preference){.tinyux-modal,.tinyux-toast{animation:tinyux-in .16s ease-out;}@keyframes tinyux-in{from{opacity:0}to{opacity:1}}}'
      ;
      (document.head || document.documentElement).appendChild(style);
    }

    function showToast(title, msg, timeoutMs) {
      ensureStyles();
      var el = document.createElement('div');
      el.className = 'tinyux-toast ' + themeClass();
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      var t = document.createElement('div');
      var s1 = document.createElement('strong');
      s1.textContent = title || 'tinyux';
      t.appendChild(s1);
      if (msg) {
        var m = document.createElement('div');
        m.style.marginTop = '4px';
        m.textContent = String(msg);
        t.appendChild(m);
      }
      el.appendChild(t);
      document.body.appendChild(el);
      later(function () {
        try {
          el.parentNode && el.parentNode.removeChild(el);
        } catch (e) {}
      }, timeoutMs || 2500);
    }

    function buildSurveyModel(input, ctxEl) {
      var s = null;
      if (typeof input === 'string') s = surveysById[input] || null;
      else if (isObject(input)) s = input;
      if (!s) return null;
      var type = String(s.type || s.survey_type || 'rating');
      var model = {
        survey_id: String(s.survey_id || s.id || ''),
        type: type,
        title: String(s.title || 'Feedback'),
        question: String(s.question || 'How was your experience?'),
        subtitle: s.subtitle ? String(s.subtitle) : '',
        min: type === 'nps' ? 0 : (typeof s.min === 'number' ? s.min : 1),
        scale: type === 'nps' ? 10 : (typeof s.scale === 'number' ? s.scale : 5),
        choices: Array.isArray(s.choices) ? s.choices.slice(0, 10) : null,
        placeholder: s.placeholder ? String(s.placeholder) : 'Optional',
        lowLabel: s.lowLabel ? String(s.lowLabel) : (type === 'nps' ? cfg.ui.labels.npsLow : ''),
        highLabel: s.highLabel ? String(s.highLabel) : (type === 'nps' ? cfg.ui.labels.npsHigh : ''),
        followUp: isObject(s.followUp) && s.followUp.question ? {
          when: s.followUp.when,
          question: String(s.followUp.question),
          placeholder: s.followUp.placeholder ? String(s.followUp.placeholder) : cfg.ui.labels.followUpPlaceholder
        } : null,
        oncePerSession: !!s.oncePerSession,
        cooldownMinutes: typeof s.cooldownMinutes === 'number' ? s.cooldownMinutes : 0,
        maxPerDay: typeof s.maxPerDay === 'number' ? s.maxPerDay : 0,
        ui: isObject(s.ui) ? clonePlainObject(s.ui) : {}
      };
      if (model.scale - model.min > 10) model.scale = model.min + 10;
      model.ui.mode = model.ui.mode === 'corner' ? 'corner' : 'modal';
      if (['bottom-right', 'bottom-left', 'top-right', 'top-left'].indexOf(model.ui.position) === -1) {
        model.ui.position = 'bottom-right';
      }
      if (!model.survey_id) return null;
      var ds = ctxEl && ctxEl.dataset ? ctxEl.dataset : null;
      model.question = templateWithDataset(model.question, ds);
      model.subtitle = templateWithDataset(model.subtitle, ds);
      return model;
    }

    function btn(text, primary) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'tinyux-btn tinyux-btn-primary' : 'tinyux-btn';
      b.textContent = text;
      return b;
    }

    function showSurvey(input, ctx) {
      var ctxEl = (ctx && ctx.element) ? ctx.element : null;
      var survey = buildSurveyModel(input, ctxEl);
      if (!survey) return false;
      if (!canShowSurvey(survey)) return false;
      ensureStyles();
      markSurveyShown(survey);
      surveyOnScreen = true;

      var labels = cfg.ui.labels;
      var isCorner = survey.ui && survey.ui.mode === 'corner';
      var useDialog = !isCorner && typeof window.HTMLDialogElement === 'function';
      var root = document.createElement(useDialog ? 'dialog' : 'div');
      if (useDialog && typeof root.showModal !== 'function') useDialog = false;
      var titleId = 'tinyux-title-' + survey.survey_id.replace(/[^a-zA-Z0-9_-]/g, '');
      var prevFocus = document.activeElement || null;

      root.className = 'tinyux-root ' + themeClass() + (isCorner ? ' tinyux-root-corner tinyux-pos-' + survey.ui.position : '');
      if (!useDialog) {
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', isCorner ? 'false' : 'true');
      }
      root.setAttribute('aria-labelledby', titleId);
      root.setAttribute('aria-label', survey.title);

      var overlay = null;
      if (!isCorner && !useDialog) {
        overlay = document.createElement('div');
        overlay.className = 'tinyux-overlay';
        root.appendChild(overlay);
      }

      var modal = document.createElement('div');
      modal.className = 'tinyux-modal';

      var header = document.createElement('div');
      header.className = 'tinyux-header';
      var title = document.createElement('div');
      title.className = 'tinyux-title';
      title.textContent = survey.title;
      var close = document.createElement('button');
      close.className = 'tinyux-close';
      close.type = 'button';
      close.setAttribute('aria-label', labels.close);
      close.textContent = '×';
      header.appendChild(title);
      header.appendChild(close);

      var body = document.createElement('div');
      body.className = 'tinyux-body';
      var q = document.createElement('div');
      q.className = 'tinyux-q';
      q.setAttribute('id', titleId);
      q.textContent = survey.question;
      body.appendChild(q);
      if (survey.subtitle) {
        var sub = document.createElement('div');
        sub.className = 'tinyux-sub';
        sub.textContent = survey.subtitle;
        body.appendChild(sub);
      }

      var answerWrap = document.createElement('div');
      answerWrap.className = 'tinyux-row' + (survey.type === 'nps' ? ' tinyux-nps' : '');
      body.appendChild(answerWrap);

      var footer = document.createElement('div');
      footer.className = 'tinyux-footer';
      var skip = btn(labels.skip, false);
      footer.appendChild(skip);
      var submit = btn(labels.submit, true);
      submit.disabled = true;
      footer.appendChild(submit);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      root.appendChild(modal);
      document.body.appendChild(root);
      if (useDialog) {
        try {
          root.showModal();
        } catch (e) {}
      }

      var value = null;
      var textValue = '';
      var inFollowUp = false;
      var closed = false;

      function teardown(reason) {
        if (closed) return;
        closed = true;
        surveyOnScreen = false;
        try {
          if (useDialog && root.open && typeof root.close === 'function') root.close();
          root.parentNode && root.parentNode.removeChild(root);
        } catch (e) {}
        if (!isCorner && prevFocus && typeof prevFocus.focus === 'function') {
          try { prevFocus.focus(); } catch (e2) {}
        }
        if (reason !== 'submit') enqueueEvent('survey_closed', { survey_id: survey.survey_id, survey_type: survey.type, reason: reason || 'close' });
        emitter.emit('survey_closed', { survey_id: survey.survey_id, reason: reason || 'close' });
      }

      function submitResponse() {
        var response = {};
        if (survey.type === 'text') response.value = textValue;
        else response.value = value;
        if (inFollowUp && textValue) response.comment = textValue;

        var ctxSnap = {
          url: safeUrl(cfg),
          viewport: buildMetaSnapshot().viewport,
          scroll_pct: computeScrollPct(),
          interaction_count: metrics.interaction_count,
          trigger: ctx && ctx.trigger ? ctx.trigger : undefined,
          element: ctxEl ? elementMeta(ctxEl, cfg, ctx && ctx.intersectionRatio) : undefined
        };

        pendingSurveys.push({
          id: uuidv4(),
          survey_id: survey.survey_id,
          type: survey.type,
          response: response,
          ts: nowSec(),
          context: ctxSnap
        });
        enqueueEvent('survey_submitted', { survey_id: survey.survey_id, survey_type: survey.type });
        emitter.emit('survey_submitted', { survey_id: survey.survey_id, type: survey.type, response: response });
        teardown('submit');
        scheduleFlush('survey');
        showToast(labels.thanksTitle, labels.thanksMessage);
      }

      function startFollowUp() {
        inFollowUp = true;
        textValue = '';
        q.textContent = survey.followUp.question;
        answerWrap.textContent = '';
        answerWrap.className = 'tinyux-row';
        var hint = body.querySelector ? body.querySelector('.tinyux-scale-hint') : null;
        if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
        var ta = document.createElement('textarea');
        ta.className = 'tinyux-input';
        ta.rows = 3;
        ta.placeholder = survey.followUp.placeholder;
        ta.setAttribute('aria-labelledby', titleId);
        ta.addEventListener('input', function () {
          textValue = String(ta.value || '');
        });
        answerWrap.appendChild(ta);
        submit.disabled = false;
        later(function () {
          try { ta.focus(); } catch (e) {}
        }, 0);
      }

      function choose(v) {
        value = v;
        submit.disabled = false;
        if (survey.followUp && !inFollowUp && matchesWhen(survey.followUp.when, v)) {
          startFollowUp();
          return;
        }
        submitResponse();
      }

      function focusLater(el) {
        if (isCorner) return;
        later(function () {
          try { el.focus(); } catch (e) {}
        }, 0);
      }

      if (overlay) overlay.addEventListener('click', function () { teardown('overlay'); });
      if (useDialog) {
        root.addEventListener('click', function (e) {
          if (e && e.target === root) teardown('overlay');
        });
        root.addEventListener('cancel', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          teardown('esc');
        });
      }
      close.addEventListener('click', function () { teardown('close'); });
      skip.addEventListener('click', function () { teardown('skip'); });
      submit.addEventListener('click', function () { submitResponse(); });
      root.addEventListener('keydown', function (e) {
        if (e && e.key === 'Escape') teardown('esc');
      });

      if (survey.type === 'rating' || survey.type === 'nps') {
        for (var i = survey.min; i <= survey.scale; i++) {
          (function (n) {
            var b = btn(String(n), false);
            b.addEventListener('click', function () { choose(n); });
            answerWrap.appendChild(b);
          })(i);
        }
        if (survey.lowLabel || survey.highLabel) {
          var hint = document.createElement('div');
          hint.className = 'tinyux-scale-hint';
          var lo = document.createElement('span');
          lo.textContent = survey.lowLabel;
          var hi = document.createElement('span');
          hi.textContent = survey.highLabel;
          hint.appendChild(lo);
          hint.appendChild(hi);
          body.appendChild(hint);
        }
        focusLater(close);
      } else if (survey.type === 'yesno') {
        var yes = btn(labels.yes, true);
        var no = btn(labels.no, false);
        yes.addEventListener('click', function () { choose(true); });
        no.addEventListener('click', function () { choose(false); });
        answerWrap.appendChild(yes);
        answerWrap.appendChild(no);
        focusLater(yes);
      } else if (survey.type === 'choice' && survey.choices) {
        for (var c = 0; c < survey.choices.length; c++) {
          (function (choice) {
            var b2 = btn(String(choice).slice(0, 80), false);
            b2.addEventListener('click', function () { choose(choice); });
            answerWrap.appendChild(b2);
          })(survey.choices[c]);
        }
        focusLater(close);
      } else if (survey.type === 'text') {
        /* Optional: text surveys can collect user-entered content (may include PII). Use sparingly. */
        var inputEl = document.createElement('textarea');
        inputEl.className = 'tinyux-input';
        inputEl.rows = 4;
        inputEl.placeholder = survey.placeholder;
        inputEl.setAttribute('aria-labelledby', titleId);
        inputEl.addEventListener('input', function () {
          textValue = String(inputEl.value || '');
          submit.disabled = textValue.trim().length < 1;
        });
        answerWrap.appendChild(inputEl);
        focusLater(inputEl);
      }

      emitter.emit('survey_shown', { survey_id: survey.survey_id, type: survey.type });
      enqueueEvent('survey_shown', { survey_id: survey.survey_id, survey_type: survey.type });
      return true;
    }

    function registerSurvey(surveyCfg) {
      if (!surveyCfg) return false;
      var id = String(surveyCfg.survey_id || surveyCfg.id || '');
      if (!id) return false;
      var s = mergeConfig({ id: id, survey_id: id }, surveyCfg);
      surveysById[id] = s;
      return true;
    }

    function recordInteraction(el, evt, selector, opts) {
      metrics.interaction_count++;
      var meta = elementMeta(el, cfg) || {};
      if (selector) meta.selector = selector;
      else if (el.id) meta.selector = '#' + String(el.id).slice(0, 80);
      meta.event = evt;
      enqueueEvent('interaction', meta);
      emitter.emit('interaction', { selector: selector, event: evt, element: el });
      if (opts.survey) showSurvey(opts.survey, { trigger: 'interaction', element: el });
      else if (opts.survey_id) showSurvey(String(opts.survey_id), { trigger: 'interaction', element: el });
    }

    /* Cooldowns are per element and only start once the selector matched. */
    function bind(selector, eventName, opts) {
      opts = opts || {};
      var evt = String(eventName || 'click');
      var sel = String(selector || '');
      if (!sel || !active) return false;
      var cooldownMs = typeof opts.cooldownMinutes === 'number' ? opts.cooldownMinutes * 60 * 1000 : cfg.interactionCooldownMs;
      var lastByEl = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

      listen(document, evt, function (e) {
        var el = closestMatch(e && e.target, sel);
        if (!el) return;
        var t = nowMs();
        if (cooldownMs) {
          var last = lastByEl ? (lastByEl.get(el) || 0) : (el.__tinyuxLastAt || 0);
          if (t - last < cooldownMs) return;
          if (lastByEl) lastByEl.set(el, t);
          else el.__tinyuxLastAt = t;
        }
        recordInteraction(el, evt, sel, opts);
      }, true);
      return true;
    }

    function bindElement(el, eventName, opts) {
      if (!el || !el.addEventListener) return false;
      if (boundElements && boundElements.has(el)) return false;
      if (boundElements) boundElements.add(el);
      opts = opts || {};
      var evt = String(eventName || 'click');
      var cooldownMs = typeof opts.cooldownMinutes === 'number' ? opts.cooldownMinutes * 60 * 1000 : cfg.interactionCooldownMs;
      var lastAt = 0;
      listen(el, evt, function () {
        var t = nowMs();
        if (cooldownMs && t - lastAt < cooldownMs) return;
        lastAt = t;
        recordInteraction(el, evt, null, opts);
      }, true);
      return true;
    }

    var timeArmed = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    function scanDeclarative() {
      if (!active) return;
      var nodes = document.querySelectorAll('[data-tinyux-survey],[data-tinyux-trigger]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var surveyAttr = el.getAttribute('data-tinyux-survey');
        var surveyId = el.getAttribute('data-tinyux-survey-id');
        var trigger = el.getAttribute('data-tinyux-trigger');
        var triggerEvent = el.getAttribute('data-tinyux-event') || 'click';

        if (surveyAttr) {
          var parsed = safeJsonParse(surveyAttr);
          if (parsed) registerSurvey(parsed);
          else if (surveyAttr.length && !surveyId) surveyId = surveyAttr;
        }

        if (!trigger) continue;
        var trig = String(trigger).toLowerCase();

        if (trig === 'click' || trig === 'interaction' || trig === 'event') {
          bindElement(el, triggerEvent, { survey_id: surveyId });
        } else if (trig === 'time') {
          if (timeArmed ? timeArmed.has(el) : el.__tinyuxTimeArmed) continue;
          if (timeArmed) timeArmed.add(el);
          else el.__tinyuxTimeArmed = true;
          var ms = parseInt(el.getAttribute('data-tinyux-after-ms') || '0', 10);
          if (!ms || ms < 1) ms = 5000;
          (function (target, sid) {
            later(function () {
              showSurvey(sid, { trigger: 'time', element: target });
            }, ms);
          })(el, surveyId);
        } else if (trig === 'section-scroll' || trig === 'section') {
          armSectionObserver(el, surveyId);
        } else if (trig === 'exit-intent') {
          // exit-intent is armed globally via config; this associates a survey declaratively
          if (surveyId) exitIntentSurveyId = surveyId;
        }
      }
    }

    var scanThrottled = debounce(scanDeclarative, cfg.domScanThrottleMs);
    cleanups.push(function () { scanThrottled.cancel(); });

    /* Only childList changes and tinyux's own attributes trigger a rescan. */
    function startMutationObserver() {
      if (typeof MutationObserver === 'undefined') return;
      var mo = new MutationObserver(function () {
        scanThrottled();
      });
      try {
        mo.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-tinyux-trigger', 'data-tinyux-survey', 'data-tinyux-survey-id', 'data-tinyux-event', 'data-tinyux-threshold', 'data-tinyux-once', 'data-tinyux-after-ms', 'data-tinyux-cooldown-min', 'data-tinyux-section']
        });
      } catch (e) {}
      cleanups.push(function () { mo.disconnect(); });
    }

    var sectionIO = null;
    var sectionFire = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    function armSectionObserver(el, surveyId) {
      if (!el) return;
      if (sectionFire && sectionFire.get(el)) return;
      var oncePerSession = (el.getAttribute('data-tinyux-once') || '').toLowerCase() === 'session';
      var cooldownMin = parseFloat(el.getAttribute('data-tinyux-cooldown-min') || '0') || 0;
      var threshold = parseFloat(el.getAttribute('data-tinyux-threshold') || '') || cfg.sectionScroll.threshold;

      function fire(intersectionRatio) {
        var key = 'tinyux:section:' + (cfg.appId || '') + ':' + (el.id || el.getAttribute('data-tinyux-section') || '');
        if (oncePerSession && storageGet(sess(), key) === '1') return;
        if (cooldownMin) {
          var t = nowMs();
          var last = parseInt(storageGet(durable(), key + ':last') || '0', 10) || 0;
          if (t - last < cooldownMin * 60 * 1000) return;
          storageSet(durable(), key + ':last', String(t));
        }
        if (oncePerSession) storageSet(sess(), key, '1');

        enqueueEvent('section_view', {
          section: el.id ? String(el.id) : (el.getAttribute('data-tinyux-section') || '').slice(0, 80),
          element: elementMeta(el, cfg, intersectionRatio)
        });
        if (surveyId) showSurvey(surveyId, { trigger: 'section-scroll', element: el, intersectionRatio: intersectionRatio });
      }

      if (sectionFire) sectionFire.set(el, fire);

      if (typeof IntersectionObserver !== 'undefined') {
        if (!sectionIO) {
          sectionIO = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
              var entry = entries[i];
              if (!entry || !entry.target) continue;
              var ratio = entry.intersectionRatio || 0;
              var needed = parseFloat(entry.target.getAttribute('data-tinyux-threshold') || '') || cfg.sectionScroll.threshold;
              var fn = sectionFire ? sectionFire.get(entry.target) : null;
              if (ratio >= needed && fn) fn(ratio);
            }
          }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
          cleanups.push(function () {
            sectionIO.disconnect();
            sectionIO = null;
          });
        }
        try { sectionIO.observe(el); } catch (e) {}
      } else {
        // Fallback for older browsers: check on scroll
        var onScroll = throttle(function () {
          var r = el.getBoundingClientRect();
          var vh = window.innerHeight || 1;
          var visible = clamp((vh - r.top) / Math.max(1, r.height), 0, 1);
          if (visible >= threshold) fire(visible);
        }, cfg.scrollThrottleMs);
        listen(window, 'scroll', onScroll, { passive: true });
        onScroll();
      }
    }

    var exitIntentSurveyId = null;
    function armExitIntent() {
      if (!cfg.exitIntent || !cfg.exitIntent.enabled) return;

      var key = 'tinyux:exit_intent:' + (cfg.appId || '');
      var oncePerSession = cfg.exitIntent.oncePerSession !== false;
      var cooldownMs = (cfg.exitIntent.cooldownMinutes || 0) * 60 * 1000;

      var lastFireAt = 0;
      var sensitivity = typeof cfg.exitIntent.sensitivity === 'number' ? cfg.exitIntent.sensitivity : 12;

      var onMove = throttle(function (e) {
        if (!e || typeof e.clientY !== 'number') return;
        if (document.visibilityState && document.visibilityState !== 'visible') return;
        var y = e.clientY;
        if (y > sensitivity) return;

        if (oncePerSession && storageGet(sess(), key) === '1') return;
        var t = nowMs();
        if (cooldownMs) {
          var last = parseInt(storageGet(durable(), key + ':last') || '0', 10) || 0;
          if (t - last < cooldownMs) return;
          storageSet(durable(), key + ':last', String(t));
        }
        if (t - lastFireAt < 2000) return;
        lastFireAt = t;

        if (oncePerSession) storageSet(sess(), key, '1');
        metrics.exit_intent_count++;
        enqueueEvent('exit_intent', { y: y, sensitivity: sensitivity });
        emitter.emit('exit_intent', { y: y });

        var sid = exitIntentSurveyId || (cfg.exitIntent && cfg.exitIntent.survey_id);
        if (sid) showSurvey(String(sid), { trigger: 'exit-intent', element: null });
      }, cfg.mouseThrottleMs);

      listen(window, 'mousemove', onMove, { passive: true });
    }

    function pagePointFromEvent(e) {
      if (!e) return null;
      var point = e;
      if (e.changedTouches && e.changedTouches.length) point = e.changedTouches[0];
      var doc = document.documentElement || {};
      var body = document.body || {};
      var scrollLeft = window.pageXOffset || doc.scrollLeft || body.scrollLeft || 0;
      var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
      var pageX = typeof point.pageX === 'number' ? point.pageX : ((point.clientX || 0) + scrollLeft);
      var pageY = typeof point.pageY === 'number' ? point.pageY : ((point.clientY || 0) + scrollTop);
      var viewportW = doc.clientWidth || window.innerWidth || 0;
      var viewportH = doc.clientHeight || window.innerHeight || 0;
      var pageW = Math.max(1, doc.scrollWidth || 0, body.scrollWidth || 0, viewportW);
      var pageH = Math.max(1, doc.scrollHeight || 0, body.scrollHeight || 0, viewportH);
      return {
        x_pct: clamp(Math.round((pageX / pageW) * 100), 0, 100),
        y_pct: clamp(Math.round((pageY / pageH) * 100), 0, 100)
      };
    }

    function viewportBucket() {
      var doc = document.documentElement || {};
      var w = doc.clientWidth || window.innerWidth || 0;
      var h = doc.clientHeight || window.innerHeight || 0;
      return Math.round(w) + 'x' + Math.round(h);
    }

    function enqueueHeatmapPoint(e, inputType) {
      var pt = pagePointFromEvent(e);
      if (!pt) return;
      enqueueEvent('heatmap_point', {
        x_pct: pt.x_pct,
        y_pct: pt.y_pct,
        viewport: viewportBucket(),
        path: safePath(cfg),
        input: inputType,
        element: elementMeta(e && e.target, cfg) || undefined
      });
    }

    function armHeatmaps() {
      if (!cfg.heatmaps || !cfg.heatmaps.enabled) return;
      if (cfg.heatmaps.clicks !== false) {
        listen(document, 'click', function (e) { enqueueHeatmapPoint(e, 'click'); }, true);
      }
      if (cfg.heatmaps.taps !== false) {
        listen(document, 'touchend', function (e) { enqueueHeatmapPoint(e, 'touch'); }, true);
      }
    }

    /* Opt-in frustration signals: rage clicks (rapid clicks in one spot) and dead clicks
       (a click on an interactive element with no DOM change or navigation afterwards). */
    function armFrustration() {
      var fc = cfg.frustration;
      if (!fc || !fc.enabled) return;
      var burst = [];
      var watching = false;
      var radius = Math.max(1, fc.rageRadiusPx | 0);
      var windowMs = Math.max(100, fc.rageWindowMs | 0);
      var needed = Math.max(2, fc.rageClicks | 0);

      function pointMeta(e, el) {
        var pt = pagePointFromEvent(e) || {};
        return { x_pct: pt.x_pct, y_pct: pt.y_pct, path: safePath(cfg), viewport: viewportBucket(), element: elementMeta(el, cfg) || undefined };
      }

      function watchDeadClick(el, e) {
        if (watching || typeof MutationObserver === 'undefined') return;
        watching = true;
        var startUrl = String(window.location && window.location.href);
        var changed = false;
        var obs = new MutationObserver(function () { changed = true; });
        try {
          obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        } catch (err) {
          watching = false;
          return;
        }
        var meta = pointMeta(e, el);
        cleanups.push(function () { obs.disconnect(); });
        later(function () {
          obs.disconnect();
          watching = false;
          var moved = String(window.location && window.location.href) !== startUrl;
          var hidden = document.visibilityState && document.visibilityState !== 'visible';
          if (!changed && !moved && !hidden) {
            enqueueEvent('dead_click', meta);
            emitter.emit('dead_click', meta);
          }
        }, Math.max(200, fc.deadClickMs | 0));
      }

      listen(document, 'click', function (e) {
        if (!e) return;
        var t = nowMs();
        var x = typeof e.clientX === 'number' ? e.clientX : 0;
        var y = typeof e.clientY === 'number' ? e.clientY : 0;
        var next = [];
        for (var i = 0; i < burst.length; i++) {
          var c = burst[i];
          if (t - c.t <= windowMs && Math.abs(c.x - x) <= radius && Math.abs(c.y - y) <= radius) next.push(c);
        }
        next.push({ t: t, x: x, y: y });
        burst = next;
        if (burst.length === needed) {
          var meta = pointMeta(e, e.target);
          meta.clicks = burst.length;
          enqueueEvent('rage_click', meta);
          emitter.emit('rage_click', meta);
        }
        var el = closestInteractive(e.target);
        if (el) watchDeadClick(el, e);
      }, true);
    }

    /* Opt-in SPA page views: Navigation API where available, history patch otherwise. */
    function armSpa() {
      if (!cfg.spa) return;
      var lastPath = safePath(cfg);
      function onRoute() {
        var p = safePath(cfg);
        if (p === lastPath) return;
        var from = lastPath;
        lastPath = p;
        enqueueEvent('page_view', { url: safeUrl(cfg), path: p, from: from, spa: true });
        emitter.emit('page_view', { path: p, from: from, spa: true });
        scheduleFlush('route');
        scanThrottled();
      }
      var navigation = window.navigation;
      if (navigation && typeof navigation.addEventListener === 'function') {
        listen(navigation, 'currententrychange', onRoute);
        return;
      }
      var h = window.history;
      if (h && typeof h.pushState === 'function') {
        ['pushState', 'replaceState'].forEach(function (name) {
          var orig = h[name];
          var wrapped = function () {
            var r = orig.apply(this, arguments);
            try { onRoute(); } catch (e) {}
            return r;
          };
          h[name] = wrapped;
          cleanups.push(function () {
            if (h[name] === wrapped) h[name] = orig;
          });
        });
      }
      listen(window, 'popstate', onRoute);
      listen(window, 'hashchange', onRoute);
    }

    function startCoreTracking() {
      listen(document, 'visibilitychange', function () {
        enqueueEvent('visibility', { state: document.visibilityState });
        if (document.visibilityState === 'hidden') flush('visibility_hidden', { useBeacon: true });
      });
      listen(window, 'focus', function () {
        focusStartMs = nowMs();
        enqueueEvent('focus', {});
      });
      listen(window, 'blur', function () {
        if (focusStartMs != null) {
          focusedMs += nowMs() - focusStartMs;
          focusStartMs = null;
        }
        enqueueEvent('blur', {});
      });

      listen(document, 'click', function () {
        metrics.click_count++;
      }, true);

      var onScroll = throttle(function () {
        var pct = computeScrollPct();
        metrics.scroll_pct_max = Math.max(metrics.scroll_pct_max, pct);
      }, cfg.scrollThrottleMs);
      listen(window, 'scroll', onScroll, { passive: true });
      onScroll();

      if (cfg.captureInputs) {
        /* Optional: captures input metadata only (lengths/types), never actual values. */
        var onInput = throttle(function (e) {
          var t = e && e.target;
          if (!t || !t.tagName) return;
          var tag = String(t.tagName).toLowerCase();
          if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
          var type = t.type ? String(t.type).toLowerCase() : '';
          var len = 0;
          try {
            if (typeof t.value === 'string') len = t.value.length;
          } catch (err) {}
          enqueueEvent('input_meta', { tag: tag, type: type, length: clamp(len, 0, 10000) });
        }, 800);
        listen(document, 'input', onInput, true);
        listen(document, 'change', onInput, true);
      }

      /* bfcache: no unload/beforeunload listeners. pagehide flushes; pageshow counts restores. */
      listen(window, 'pagehide', function () {
        flush('pagehide', { useBeacon: true });
      });
      listen(window, 'pageshow', function (e) {
        if (e && e.persisted) {
          enqueueEvent('page_view', { url: safeUrl(cfg), restored: true });
          emitter.emit('page_view', { path: safePath(cfg), restored: true });
        }
      });
    }

    var hbTimer = null;
    function startHeartbeat() {
      if (hbTimer) return;
      hbTimer = window.setInterval(function () {
        if (document.visibilityState && document.visibilityState !== 'visible') return;
        metrics.heartbeat_count++;
        enqueueEvent('heartbeat', { t_ms: nowMs() - startMs, scroll_pct: computeScrollPct() });
        flush('heartbeat');
      }, Math.max(5000, cfg.heartbeatMs | 0));
    }

    function stopHeartbeat() {
      if (!hbTimer) return;
      window.clearInterval(hbTimer);
      hbTimer = null;
    }

    function replayQueueSoon() {
      if (!consentGranted) return;
      var q = loadQueue();
      if (!q.length) return;
      scheduleFlush('replay');
    }

    var started = false;
    function init() {
      if (!cfg.appId || !cfg.apiUrl) {
        debugLog('[tinyux] missing appId or apiUrl');
        return;
      }
      if (!active || started) return;
      started = true;
      enqueueEvent('page_view', { url: safeUrl(cfg) });
      startCoreTracking();
      startHeartbeat();
      armExitIntent();
      armHeatmaps();
      armFrustration();
      armSpa();
      scanDeclarative();
      startMutationObserver();
      replayQueueSoon();
    }

    function stop() {
      stopHeartbeat();
      if (flushTimer) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
      while (timeouts.length) window.clearTimeout(timeouts.pop());
      var fns = cleanups.splice(0, cleanups.length);
      for (var i = 0; i < fns.length; i++) {
        try { fns[i](); } catch (e) {}
      }
      try {
        var roots = document.querySelectorAll('.tinyux-root,.tinyux-toast');
        for (var r = 0; r < roots.length; r++) {
          if (roots[r] && roots[r].parentNode) roots[r].parentNode.removeChild(roots[r]);
        }
      } catch (e2) {}
      surveyOnScreen = false;
      started = false;
    }

    init();

    return {
      version: TINYUX_VERSION,
      init: function (c) {
        cfg = normalizeConfig(mergeConfig(cfg, c || {}));
        if (c && Object.prototype.hasOwnProperty.call(c, 'user') && !dropIdentity) userIdentity = normalizeUserIdentity(c.user);
        return this;
      },
      on: emitter.on.bind(emitter),
      flush: function () {
        return flush('manual');
      },
      getClientId: function () { return clientId; },
      getSessionId: function () { return sessionId; },
      identify: function (idOrUser, traits) {
        if (dropIdentity) return null;
        userIdentity = normalizeUserIdentity(idOrUser, traits);
        return cloneUserIdentity(userIdentity);
      },
      clearIdentity: function () {
        userIdentity = null;
        return true;
      },
      getIdentity: function () {
        return cloneUserIdentity(userIdentity);
      },
      /* consent(true) starts sending (and persisting ids); consent(false) stops and forgets. */
      consent: function (granted) {
        if (granted) {
          if (!consentGranted) {
            consentGranted = true;
            ensureIds();
            emitter.emit('consent', { granted: true });
            replayQueueSoon();
            scheduleFlush('consent');
          }
          return true;
        }
        consentGranted = false;
        buffer.clear();
        pendingSurveys.splice(0, pendingSurveys.length);
        var stores = [safeStorage('localStorage'), safeStorage('sessionStorage')];
        for (var i = 0; i < stores.length; i++) {
          if (!stores[i]) continue;
          storageDel(stores[i], STORAGE_QUEUE);
          storageDel(stores[i], STORAGE_SURVEY_STATE);
          storageDel(stores[i], STORAGE_SESSION_ID);
          storageClearPrefix(stores[i], 'tinyux:');
        }
        stop();
        active = false;
        emitter.emit('consent', { granted: false });
        return false;
      },
      hasConsent: function () { return consentGranted; },
      isActive: function () { return active; },
      track: function (type, meta) {
        enqueueEvent(type, meta || {});
      },
      bind: bind,
      registerSurvey: registerSurvey,
      showSurvey: function (idOrCfg) { return showSurvey(idOrCfg, { trigger: 'manual' }); },
      stop: stop
    };
  }

  function readAutoConfig() {
    var script = document.currentScript;
    if (!script) {
      var scripts = document.getElementsByTagName('script');
      script = scripts && scripts.length ? scripts[scripts.length - 1] : null;
    }
    if (!script || !script.getAttribute) return null;
    var appId = script.getAttribute('data-app-id') || '';
    var apiUrl = script.getAttribute('data-api-url') || '';
    var cfgJson = script.getAttribute('data-config') || '';
    var cfg = cfgJson ? safeJsonParse(cfgJson) : null;
    cfg = isObject(cfg) ? cfg : {};
    cfg.appId = cfg.appId || appId;
    cfg.apiUrl = cfg.apiUrl || apiUrl;
    return cfg.appId && cfg.apiUrl ? cfg : null;
  }

  var tinyux = {
    version: TINYUX_VERSION,
    init: function (cfg) {
      if (tinyux._instance && typeof tinyux._instance.stop === 'function') tinyux._instance.stop();
      var inst = new TinyUXInstance(cfg || {});
      tinyux._instance = inst;
      return inst;
    },
    getInstance: function () {
      return tinyux._instance;
    },
    autoInit: function () {
      var cfg = readAutoConfig();
      if (!cfg) return null;
      if (tinyux._instance) return tinyux._instance;
      return tinyux.init(cfg);
    },
    consent: function (granted) {
      return tinyux._instance ? tinyux._instance.consent(granted) : false;
    },
    destroy: function () {
      if (tinyux._instance && typeof tinyux._instance.stop === 'function') {
        tinyux._instance.stop();
      }
      tinyux._instance = null;
      return true;
    },
    _instance: null
  };

  window.tinyux = tinyux;
  try { tinyux.autoInit(); } catch (e) {}
})(window, document);
