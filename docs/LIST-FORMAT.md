# List format and curation policy

Folkweb uses two kinds of lists. Both are plain text, both are **data only**, and both
are linted by `npm run lint:lists` (`tests/lists.test.ts`).

## 1. Cosmetic filter lists (`lists/ai-surfaces.txt`, `sponsored.txt`, `calm.txt`)

These use a **safe subset** of uBlock Origin / AdGuard cosmetic syntax, so existing
filter-list knowledge transfers.

```text
! Title: Folkweb — Example            ← required header
! verified: 2026-10-12 — what this hides   ← required before each rule group
example.com##.newsletter-modal
google.*##a[href*="udm=50"]           ← entity: any TLD
a.com,~shop.a.com##div[data-ad]       ← include / exclude domains
x.com##article:has-text(Promoted)     ← plain text, case-insensitive, must be last
```

| Supported | Rejected (always) |
|---|---|
| `##selector` with standard CSS selectors, including `:has()` and `:not()` | `##+js(...)` scriptlets |
| Domain scoping with `,` and `~` | `#$#` CSS injection |
| `entity.*` domains | `#?#` procedural filters, `#%#` JavaScript |
| `:has-text(plain text)` as the last part, scoped to a domain | `#@#` exceptions, `$$` / `##^` HTML filters |
| Comments `!` and headers `[...]` | Selectors containing `{ } ; @ < \`, `/*`, `url(`, newlines |
| Network rules are **ignored** (Folkweb isn't a network blocker) | Regular expressions in `:has-text()` |

Rules for **bundled** lists, enforced by the lint:
- Every rule is scoped to at least one site. Generic rules are not allowed in bundled lists.
- Every rule group is preceded by `! verified: YYYY-MM-DD` or `! unverified — reason`.
- Prefer stable hooks: custom element names (`ytd-ad-slot-renderer`), `data-testid`, `aria-label`, ids, and URL patterns (`a[href*="udm=50"]`). Avoid obfuscated class names (`.MjjYud`).
- Keep selectors as specific as possible. A `:has-text()` rule hides every matching element whose text contains the needle, so never target page-level containers.

## 2. Domain lists (`lists/block-domains.txt`, `folk-boost.txt`)

One domain per line. Comments start with `#`. Subdomains are included automatically.
`||example.com^` and `*.example.com` are accepted for compatibility.

Because an entry covers every subdomain, a boost entry vouches for everything under it.
Platforms where anyone can get a subdomain (`neocities.org`, `github.io`, `wordpress.com`…)
or that replay other sites (`web.archive.org`) can't be boosted whole: boost the person's
own site (`alice.neocities.org`) instead. `npm run lint:lists` refuses known platforms.

```text
# Title: Folkweb — Example
example.com          # optional trailing note
```

## Curation policy

Folkweb exists to put people back in charge. Our lists must earn trust.

1. **Evidence, not vibes.** Every block-list addition links public, reproducible
   evidence in the PR, such as archived pages showing mass-generated content, fabricated
   authors, or recycled AI text across many pages. "Feels like AI" is not evidence.
2. **Judge content, not people.** No entries based on politics, identity, competition
   or personal disputes.
3. **Boost means human-run.** A boost entry is a site primarily made and maintained by
   people. The PR says who vouches for it and why.
4. **Removal is equal to addition.** Site owners can request removal. Requests are
   reviewed with the same weight and timeline.
5. **No secret lists.** Every bundled entry is public and has a git history.
6. **AI may draft, humans decide.** Agents can propose list changes and check
   selectors, but a human maintainer approves every change to `lists/`.
7. **When in doubt, leave it out.**
