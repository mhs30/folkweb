---
description: "Use when editing Folkweb content scripts: DOM reading/hiding, MutationObserver, page signals, search result annotation. Covers hostile-page safety rules."
applyTo: "src/content/**, src/entrypoints/content.ts"
---
# Content scripts — the page is hostile

Content scripts run on every http(s) page. Assume the page is trying to exploit you.

- **Write text, never markup.** Use `textContent`, `createElement` and `setAttribute` with fixed attribute names. `innerHTML` and friends are banned by lint and `npm run security`.
- **Hide with `hideElement()`** (`src/content/dom.ts`). It uses the CSSOM, so it works under a strict page CSP, and it marks elements with `data-folkweb-hidden` for counting.
- **No page messaging.** Never use `window.postMessage` or `addEventListener('message')`. Pages can forge them. Talk to the extension only via `browser.runtime`.
- **Network:** only same-origin, cookie-less `safeFetch()` with a size cap. Anything cross-origin goes through an extension page with an optional host permission.
- **URLs from the DOM** (`href`, `src`, `<link>`) go through `parseSafeUrl(value, location.href)`.
- **Performance budget:** work is debounced through `observeMutations()`. Keep each pass well under 5 ms on large pages. Scan bounded subtrees, cap text length, and skip page-sized containers.
- **Never break the page.** Prefer hiding a specific element over a container. Don't change layout outside themes. Respect `disabledSites`.
- Selectors come from lists: validate them with `isValidSelector()` before `querySelectorAll`.

```ts
// ✅
const badge = document.createElement('span');
badge.textContent = '✿ folk';
// ❌ el.innerHTML = `<span>${title}</span>`;
```
