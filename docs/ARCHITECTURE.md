# Architecture

```
            ┌──────────────────────── web page (untrusted) ────────────────────────┐
            │  DOM, <link rel="human-json">, feeds, media, search results          │
            └───────────────▲──────────────────────────────────────────────────────┘
                            │ reads DOM, hides elements (isolated world, text-only writes)
┌───────────────────────────┴────────────┐   runtime messages (validated, sender-checked)
│ content script  src/entrypoints/content │◄───────────────────────────┐
│  · look (themes, calm, autoplay guard)  │                            │
│  · cosmetics + :has-text + sponsored    │──open-blocked──►┌──────────┴──────────────┐
│  · search annotate / Google udm=14      │                 │ background (service wkr) │
│  · human signals (same-origin fetch)    │                 │  · context menu (C2PA)   │
└───────────────▲────────────────────────┘                 │  · open blocked page     │
                │ get-signals, reveal-hidden                └──────────┬──────────────┘
┌───────────────┴──────────┐   ┌─────────────────────┐   ┌─────────────▼──────────────┐
│ popup: signals, trust,   │   │ options: settings,  │   │ credentials page:          │
│ boost/block, Wander      │   │ lists, trust circle │   │ fetch media → C2PA WASM    │
└───────────────┬──────────┘   └──────────┬──────────┘   │ (bundled WASM) → summary   │
                └───────── storage.local (validated on every read) ─────────────────────┘
```

## Contexts and responsibilities

| Context | File | Can | Must not |
|---|---|---|---|
| Content script | `src/entrypoints/content.ts` | Read the DOM, hide elements, inject theme `<style>`, fetch **same-origin** human.json via `safeFetch` | Trust anything from the page; use `postMessage`; write HTML |
| Background | `src/entrypoints/background.ts` | Context menu, navigate a tab to `blocked.html` | Fetch arbitrary URLs; act on unvalidated messages |
| Popup / options | `src/entrypoints/{popup,options}` | Read and write settings and trust, open tabs | Store page-provided data without re-validating it |
| Credentials page | `src/entrypoints/credentials` | Request per-origin host permission on click, fetch media, run the bundled C2PA WASM | Auto-fetch without user action |
| Welcome page | `src/entrypoints/welcome` | Opens once on install (`shouldOpenWelcome`); edit settings with the shared toggles; Wander | Open on updates; send anything anywhere |
| Blocked page | `src/entrypoints/blocked` | Offer back / continue / unblock | Navigate to anything that isn't public http(s) |

## Pure logic (unit-tested in Node)

`src/lib/` holds everything that decides something: filter parsing (`filters.ts`), domain
lists (`domains.ts`), URL safety (`url-safety.ts`), human.json (`human-json.ts`), the trust
graph (`trust.ts`), C2PA summaries (`c2pa-summary.ts`), settings validation (`settings.ts`),
the "hidden on this page" report (`hidden-report.ts`) and message validation (`messages.ts`).
Entry points stay thin and wire these together.

## Hiding transparency

Every element Folkweb hides carries a reason: which list (AI surfaces, sponsored, calm,
your own filters), the "Sponsored" label it carried, or the blocked or untrusted domain
of a search result. Reasons live in a `WeakMap` inside the isolated world, so a page can't
read or forge them. Stylesheet rules are attributed by re-querying their selectors when
the popup asks. The popup groups them with a short text preview, and *Show them on the
page* swaps hiding for a dashed outline until the next reload. Folkweb tracks what it hid
in a `WeakSet`; the `data-folkweb-hidden` attribute is output only, so a page that sets it
can neither dodge hiding nor get its own elements un-hidden.

Trusted sources in search use the boost lists plus *whole-site* hosts from the trust
circle, matched exactly (no subdomains, any distrust on a host removes it). The trust
circle is only consulted when the person turns the feature on, because marks on a search
page are visible to that page's scripts. Badges use one generic title for the same reason.

## Testing

| Layer | Where | What it proves |
|---|---|---|
| Unit tests (Vitest, Node and happy-dom) | `tests/` | Parsers, validators, URL safety, trust graph, themes, site files; attack cases for every parser |
| Browser smoke tests (Playwright, Chromium) | `e2e/` | The built extension installs, every page renders, content-script features work on local fixture pages, and **no error is logged anywhere**, including Chrome's own extension Errors page |
| Security gate | `scripts/security-scan.mjs` | Manifest, source bans, lists, secrets, dependencies, CI workflows, website |
| Firefox lint | `npm run lint:firefox` | Mozilla's addons-linter, as AMO runs it |
| DCO check (pull requests) | `scripts/check-dco.mjs` | Every commit in a pull request is signed off by its author |

Smoke tests serve fixture pages over HTTPS with a throwaway certificate and map test
hostnames (`*.e2e.test`, a fake `www.bing.com`) to a local server inside the test browser
only, so they never touch the real web.

## Data model (storage.local)

| Key | Shape | Validator |
|---|---|---|
| `settings` | `Settings` | `sanitizeSettings` |
| `trust` | `{ seeds: TrustedSeed[], distrusted: string[] }` | `sanitizeTrust` |
| `allowOnce` | `{ [domain]: expiresAtMs }` | inline in `storage.ts` |

## Why these choices

- **WXT + vanilla TypeScript.** One codebase for Chrome and Firefox MV3, with a small
  dependency surface. No UI framework is needed for a few small pages.
- **Content script on all http(s) pages.** Themes and decluttering need it. Network
  access stays opt-in per origin.
- **C2PA on an extension page, using `@contentauth/c2pa-wasm` directly.** The higher-level
  `c2pa-web` SDK insists on an `https:` or `blob:` worker URL, which would mean loosening the
  CSP. Instead the WASM reader runs on the credentials page's main thread with
  `WasmReader.fromBytes`. The page is a small popup window, which also gives room to
  explain the result.
- **Google `udm=14` instead of selectors.** Google's AI Overview markup is obfuscated, and
  the official "Web" results mode removes it reliably.
