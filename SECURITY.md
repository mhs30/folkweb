# Security

Folkweb runs on every page people visit. A bug here is a bug on every site. This
document is the contract that humans, CI and AI agents all follow. `npm run security`
enforces the parts that can be checked mechanically.

## Reporting a vulnerability

Please email **security@folkweb.org** (or open a private GitHub security advisory).
Don't file public issues for vulnerabilities. We aim to reply within 7 days.

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| User's browsing (all sites) | Malicious page attacks the content script (DOM clobbering, spoofed messages, crafted markup) | Isolated world only; no `window.postMessage`; text-only DOM writes; every page value is untrusted input |
| Extension privileges | Page or list tricks the extension into fetching internal URLs (SSRF) or navigating to `javascript:` | `src/lib/url-safety.ts`: public http(s) only (IPv6 literals only in global unicast), no credentials, private/local ranges blocked including trailing-dot names, re-checked after redirects (human.json refuses redirects); no cookies sent |
| Filter lists (bundled, user, future remote) | A list injects CSS that exfiltrates data (`url()`), breaks out of the rule block, or runs code (scriptlets) | Safe subset parser (`src/lib/filters.ts`): rejects `{ } ; @ < \`, comments, `url()`, scriptlets, CSS injection, procedural filters. The browser parser double-checks via `CSS.supports` |
| human.json documents | Impersonation (site A claims site B), oversized or garbage payloads | Claim only counts if it covers the page URL; strict schema; size and vouch caps; same-origin fetch only (MVP) |
| C2PA media | Huge or malicious files, misleading "verdicts" | Size cap (50 MB), timeout, content-type check, bundled CAI WASM on an isolated extension page (no worker, no `blob:` CSP exception); UI states what credentials *declare*, and never says "AI" because credentials are missing |
| Storage | Tampered or corrupted `storage.local` | Every read goes through `sanitize*()` validators |
| Supply chain | Compromised npm package or install script | `ignore-scripts=true`, exact pinned versions, lockfile, `npm audit` in CI, Dependabot with a 7-day cooldown, SHA-pinned CI actions, no runtime remote code. Playwright is a dev-only dependency; its test browser is downloaded in CI and never shipped |
| Releases | Tampered or unreproducible store packages | Built only by CI from a version tag (`.github/workflows/release.yml`) after the full check; reproducible builds; SHA-256 sums and signed build provenance (`gh attestation verify`); draft release; store uploads are manual (`docs/RELEASING.md`) |
| Users' trust | Telemetry, data collection, dark patterns | No servers, no analytics, no accounts. Firefox manifest declares `data_collection_permissions: none` |
| Curator lists | Brigading, defamation, censorship pressure | Lists you can switch off (★ marks, hiding blocked results, stop page), public PR review with evidence, removal requests weighed equally, content judged rather than people |

## Permissions

| Permission | Why | Notes |
|---|---|---|
| `storage` | Settings, user lists, trust circle | `storage.local` only |
| `contextMenus` | "Check Content Credentials" on media | |
| Content scripts on `http(s)://*/*` | Themes, decluttering, human signals | Isolated world, `document_start`, top frame only |
| `optional_host_permissions` `http(s)://*/*` | Fetch media for C2PA checks | **Requested at runtime, per origin, after a user click.** Never at install |

Any new permission, `host_permissions`, `web_accessible_resources`,
`externally_connectable`, `scripting`, `tabs`, `webRequest` or `<all_urls>` needs:
1. a written justification added to this table,
2. a human maintainer's approval in review,
3. an update to the allowlist in `scripts/security-scan.mjs`.

## Invariants (must always hold)

1. **No remote code.** Everything executable ships in the package. WASM is bundled. No CDN scripts, fonts or CSS imports.
2. **No HTML from strings.** No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc`. Use `textContent` or `h()` from `src/ui/dom.ts`.
3. **No eval.** No `eval`, `new Function`, string timers, `importScripts`, `executeScript`.
4. **All network access goes through `safeFetch()`.** It uses `credentials: 'omit'`, enforces a timeout and size cap, and checks for public addresses.
5. **All URLs from pages, lists, storage or query strings go through `parseSafeUrl()`** before any fetch or navigation.
6. **Messages are validated.** Receivers check `sender.id === browser.runtime.id` and the message shape at runtime.
7. **Lists are data.** No scriptlets, no CSS injection, no regex in `:has-text()`.
8. **Themes load nothing.** No `url()`, `@import` or `@font-face` in theme CSS.
9. **No telemetry.** No analytics, beacons or error reporting to third parties.
10. **Honest signals.** Never present a guess as a fact. No "AI detector" scoring of text or images.

## Known limitations

- DNS rebinding: a public hostname that resolves to a private IP is not detected. Impact is limited because fetches are GET-only, carry no cookies, and are only parsed locally.
- Redirects for Content Credentials checks are checked where they end, not hop by hop: browsers hide a redirect's target even from extensions. A public file that redirects to a private address therefore causes one GET without cookies to that address before Folkweb refuses to read the answer. human.json fetches refuse redirects entirely.
- Pages with a strict `style-src` CSP may block Folkweb's injected `<style>` elements. `:has-text()` and sponsored hiding still work because they use inline styles set through the CSSOM. A move to `scripting.insertCSS` would need the `scripting` permission and is tracked in the roadmap.
- Pages can tell Folkweb is running. They can see the styles and attributes it adds (theme, calm, hidden and ★ marks) and which of their own elements it hid, which reveals some settings and, on that site, your custom filters for it. Your lists and trust circle are used only for marks on Google, DuckDuckGo and Bing results, and your block list for the stop page before a blocked site (which that site can notice). Folkweb adds nothing on sites where it is paused, and the calm layer only when a calm option is on. Hiding all of this from pages would need `scripting.insertCSS` (above).
- Cross-origin human.json and 2+ hop trust are not fetched yet (they need optional host permissions).
