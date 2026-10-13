# Roadmap

**Mission:** move the web back to people. Show human signals, let people pick their
curators, and make browsing calm. Folkweb isn't against AI; it's for people. Use AI to
humanize the web, not the other way around: people choose which AI they see, and optional
helpers use AI to bring them closer to the people behind what they read. Never use AI to
judge whether something is human.

## Where we fit (prior art, October 2026)

| Piece | Who does it today | What Folkweb adds |
|---|---|---|
| Hiding AI widgets | aiBlock, Hide Gemini, "Hide Google AI Overviews", uBlock lists | Part of a bigger, calm experience; verified, data-only lists |
| Search filtering | uBlacklist | Curator lists plus a trust circle, not only personal blocklists |
| Flagging slop | Kagi SlopStop (inside Kagi only) | Works on any search engine and any site, with no account |
| Human web of trust | human.json + its verifier extension | Seeds, vouches, Wander and search badges in one place |
| Media provenance | Digimarc C2PA extension | Honest three-way verdicts tied to the human-signals card |
| Calm & retro | Demetricator, News Feed Eradicator, 98.css | Built in, including a 2000s Web 2.0 theme |
| "AI detectors" | Various | **We deliberately don't build one.** They are unreliable and erode trust |

## v0.1 — Foundation ✅ (this release)

- [x] WXT MV3 extension for Chrome and Firefox, strict CSP, minimal permissions
- [x] Themes: Newsprint, Terminal, ’98, **2000s Web 2.0**, plus the calm layer (still pages, no autoplay, grayscale)
- [x] Safe filter engine (uBlock subset + `:has-text`), verified AI-surface, sponsored and calm lists
- [x] Sponsored-label heuristic for feeds
- [x] Google "Web results" (udm=14) routing; search annotation and hiding for Google, DuckDuckGo and Bing
- [x] Block list with a calm stop page; boost list with ★ folk badges
- [x] human.json discovery (same-origin), trust circle (seeds plus 1 hop), Wander
- [x] On-demand C2PA checks with per-origin permission
- [x] Security gate, unit tests, Mozilla addons-linter clean
- [x] AI-agent instructions, skills, guard hooks, security-review agent

## v0.1.1 — Transparency ✅

- [x] "Hidden on this page" report in the popup: what was hidden, grouped by reason, with a text preview and the rule
- [x] *Show them on the page*: outline instead of hide, until reload
- [x] Browser smoke tests in CI; reproducible, tag-built releases with signed provenance
- [x] Share and back up: export/import personal lists as a file (re-validated on import), and a human.json generator that turns your boosts into vouches for your own site
- [x] Trusted sources in search: off / fade others / only trusted (boost lists + whole-site trust circle), with an in-page notice and *Show all here*

## AI that humanizes (opt-in) — next track

Rules for every AI feature: **off until the person turns it on**, clearly labelled as AI with
the original one click away, **on-device first** (Chrome's built-in AI, Firefox's local AI)
so it's private and free, never sends browsing to Folkweb, and never scores or guesses
whether something is human. Any new permission goes through `SECURITY.md#permissions`.

Candidates, roughly in order of value and effort:

- [ ] **Plain headlines:** rewrite clickbait headlines in plain words, original on hover
- [ ] **Find the person:** on an article, point to the author's own site, feed and human.json
- [ ] **Summaries that send you to the source:** a short summary that links to the original author, not a replacement for reading
- [ ] **Translate the small web:** read personal sites in other languages, on-device
- [ ] **Curator helper:** draft evidence for list proposals, for a person to review

## v0.2 — Trust graph & lists

- [ ] Cross-origin human.json and 2–3 hop trust crawling (optional host permissions, cached, polite crawling per spec)
- [ ] Remote list subscriptions with **Ed25519-signed** lists (WebCrypto), plus a list directory
- [ ] Curator profiles: name, contact, signing key, list history
- [ ] Badge overlay on images after a C2PA check; optional auto-check for large images on trusted sites
- [ ] Verify every `unverified` rule in the bundled lists (add-site-filter skill)
- [ ] Import uBlock-format lists from URL (cosmetic subset)
- [ ] Trusted-source marks beyond search: ★ next to links to trusted sites on any page (Hacker News, Reddit, blogs)
- [ ] Privacy card in the popup: which other companies' scripts a page loads (a fact, not a score)

## v0.3 — Front porch

- [ ] **Front porch** new-tab page: chronological RSS from your trust circle, no algorithm
- [ ] Webring bar: previous / next / random across human.json vouches
- [ ] Creator kit: generate `human.json`, an `/ai` page, a blogroll and a webring snippet, plus C2PA signing guidance
- [ ] Reader mode with themes (Mozilla Readability)

## v0.4 — Community

- [ ] AT Protocol integration: follow Bluesky labelers and lists as curators
- [ ] Public curator list registry (PR-governed), with abuse and removal process
- [ ] Localization; accessibility audit
- [ ] Safari build

## Cookies and tracking — a deliberate non-goal (for now)

Folkweb itself sets no cookies and sends none (`safeFetch` uses `credentials: 'omit'`).
It does **not** block third-party trackers or cookie banners:

- Network blocking needs `declarativeNetRequest` and large, fast-moving lists. Browsers
  (Firefox ETP, Safari ITP, Brave) and uBlock Origin / uBO Lite do this well already.
- Hiding cookie banners with CSS can leave consent in its default state or lock page
  scrolling. Doing it properly means clicking "reject" for the user (Consent-O-Matic,
  DuckDuckGo autoconsent), which is code that acts on pages — outside our "lists are data"
  rule.

If this changes, it must go through `SECURITY.md#permissions` with human approval.

## Always out of scope

- AI-text or AI-image "detection" scores
- Telemetry, accounts or servers that see browsing
- Crypto wallets or tokens
- Remote code of any kind

## How AI helps (behind the scenes, human-approved)

- Agents verify and repair broken selectors using the `add-site-filter` skill
- Agents triage list PRs: check evidence links, then draft a summary for maintainers
- Agents run the `security-check` skill on every change
- Humans approve every change to `lists/`, permissions, CSP and agent guardrails
