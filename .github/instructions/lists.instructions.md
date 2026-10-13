---
description: "Use when editing Folkweb curator lists (filter lists, boost or block domain lists). Covers safe syntax, verification markers and the evidence-based curation policy."
applyTo: "lists/**"
---
# Curator lists — data only, evidence first

Full spec: [docs/LIST-FORMAT.md](../../docs/LIST-FORMAT.md). Every change to `lists/` needs human approval.

- **Safe syntax only:** `domain##selector`, `entity.*##selector`, `~exclude`, and a trailing `:has-text(plain text)`. Never scriptlets (`##+js`), CSS injection (`#$#`), procedural (`#?#`), JS (`#%#`), HTML filters, regex or `url()`.
- **Scope every rule** to at least one site. Generic rules are not allowed in bundled lists.
- **Mark verification** above each rule group: `! verified: YYYY-MM-DD — what it hides` (only if you actually loaded the page and confirmed the selector matched), otherwise `! unverified — reason`. Never mark something verified that you didn't check.
- **Stable hooks first:** custom elements, `data-testid`, `aria-label`, ids, URL patterns. Avoid obfuscated classes.
- **Domain lists:** block entries need public, reproducible evidence in the PR description. Boost entries need the voucher and the reason. Judge content, never people. When in doubt, leave it out.
- Validate with `npm run lint:lists` (and `npm run security`).
