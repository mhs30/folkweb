---
description: "Use when changing the Folkweb manifest, permissions, CSP, background service worker, runtime messaging, URL safety or the security scan. Covers least-privilege rules and approval requirements."
applyTo: "wxt.config.ts, src/entrypoints/background.ts, src/lib/url-safety.ts, src/lib/messages.ts, scripts/security-scan.mjs"
---
# Extension security surface

These files define what Folkweb is *allowed* to do. Changes here need human approval.

- **Least privilege.** Required permissions are `storage` and `contextMenus` only. Host access is `optional_host_permissions`, requested per origin from a user click (see `src/entrypoints/credentials/main.ts`). Never add `host_permissions`, `<all_urls>`, `tabs`, `scripting`, `webRequest`, `web_accessible_resources` or `externally_connectable` without updating the table in `SECURITY.md#permissions` and the allowlist in `scripts/security-scan.mjs`. Both changes need human review.
- **CSP** stays `script-src 'self' 'wasm-unsafe-eval'`. `'wasm-unsafe-eval'` exists only for the bundled C2PA WASM. Never add `'unsafe-eval'`, `'unsafe-inline'` or remote hosts.
- **Messages:** every `onMessage` listener checks `isFromThisExtension(sender, browser.runtime.id)` and a runtime shape validator from `src/lib/messages.ts`, then re-validates any URL with `parseSafeUrl()` before acting.
- **Navigation:** the background only navigates tabs to extension pages, with untrusted values in query parameters. The destination page re-validates them.
- **`safeFetch()`** is the only network primitive: `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, timeout, streaming size cap, post-redirect address check. Don't loosen it. Add tests for any change in `tests/domains-and-urls.test.ts`.
- **Firefox:** keep `data_collection_permissions: { required: ['none'] }` and build MV3 (`--mv3`). Run `npm run lint:firefox` after manifest changes.
- After any change here: `npm run security && npm run lint:firefox`.
