# tinyux identity and survey placement design

## Goal

Let integrators associate tinyux telemetry with their own user/account data, and let surveys appear either as the current blocking center modal or as a subtle non-blocking corner prompt.

## Identity Scope

tinyux should support explicit user association through integrator-provided data:

```js
const ux = window.tinyux.getInstance()
ux.identify('user_123', {
  account_id: 'acct_456',
  plan: 'team',
  role: 'admin'
})
```

Configuration can also provide an initial user:

```js
tinyux.init({
  appId: 'acme',
  apiUrl: '/collect.php',
  user: {
    id: 'user_123',
    account_id: 'acct_456',
    traits: { plan: 'team' }
  }
})
```

Payloads include top-level `user` and the meta snapshot also includes `user` so the existing PHP/SQLite collector can store association data in `clients.meta` and `sessions.meta` without a new table. The current anonymous `client_id` and `session_id` remain the default identifiers.

The client should not perform automatic browser/device fingerprinting. Server request metadata is allowed only as an explicit collector configuration option, with hashed IP by default when enabled.

## Survey Placement Scope

Surveys keep the existing modal behavior by default:

```js
ui: { mode: 'modal' }
```

Each survey can opt into a non-blocking corner presentation:

```js
ui: {
  mode: 'corner',
  position: 'bottom-right'
}
```

Supported positions are `bottom-right`, `bottom-left`, `top-right`, and `top-left`. Corner surveys do not render the page overlay, do not use `aria-modal="true"`, and should not block interaction outside the prompt. They reuse the existing survey content, controls, cooldowns, lifecycle events, and submission pipeline.

## Collector Scope

`collect.php` should expose these opt-in request metadata controls:

```php
$CAPTURE_REQUEST_META = false;
$HASH_IP_WITH_SALT = true;
$IP_HASH_SALT = 'change-me';
$CAPTURE_USER_AGENT = false;
```

When request metadata capture is enabled, the collector merges a `request` object into the stored payload meta. It should never be required for user association; integrator-provided `user` data is the primary path.

## Tests

Add automated tests proving:

- `identify()` adds top-level user data and meta user data to payloads.
- config-provided `user` data is included before `identify()` is called.
- corner surveys render without overlay, use `aria-modal="false"`, and apply the selected corner class.
- default surveys still render as blocking center modal with overlay.

