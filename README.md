<img src="public/icon/logo.svg" alt="" width="72" height="72" />

# Folkweb

**The web, by folks.** Human signals you can see, curators you choose, and a calmer, retro web.

Folkweb is a browser extension for Chrome and Firefox. It isn't against AI; it's for people.
The goal is AI that humanizes the web, not the other way around: you choose which AI you see,
and (next) optional helpers use AI to bring you closer to the people behind what you read.

Folkweb doesn't try to "detect AI", because that can't be done honestly. Instead it surfaces
evidence that a person is behind what you're reading, lets *you* choose whose judgement to
trust, and quiets the noise in between.

## What it does

| | Feature | How |
|---|---|---|
| 🟢 | **Human signals** | Reads a site's [`human.json`](https://codeberg.org/robida/human.json): a site declares human authorship and vouches for other human sites. You choose seed sites you trust personally, and sites they vouch for show up as human-vouched. Also shows RSS/Atom feeds and `/ai` policy pages. |
| ★ | **Curators, not algorithms** | Boost and block lists mark human-made sites in Google, DuckDuckGo and Bing results and hide content farms. Blocked sites get a calm stop page, and you can always continue. |
| 🔎 | **Trusted sources in search** | Optional: fade or hide results that aren't from your boost lists or trust circle. A note above the results says how many were hidden and lets you show them all. |
| 🔁 | **Share your lists** | Export your boosted, blocked and paused sites and your own filters as a file, import a friend's (checked like anything you type; unsafe rules are skipped), or create a `human.json` for your own website that vouches for the sites you boost. |
| 🎲 | **Wander** | Jump to a random human-made site from your trust circle and curator lists. Like StumbleUpon, for the human web. |
| 🧹 | **Declutter, your way** | Hides the AI panels, AI summaries and sponsored modules you didn't ask for (each one a setting) with a safe, verified filter list. Google searches open as plain "Web" results (no AI Overviews). The popup lists **what was hidden on the page and why**, and can show it all again with a dashed outline. |
| 📷 | **Content Credentials** | Right-click any image, video or audio → *Check Content Credentials* reads [C2PA](https://c2pa.org) provenance: captured by a camera, declared AI-generated, edited, or unknown. |
| 🌿 | **Calm** | No autoplay, still pages (no animations), optional grayscale and hidden vanity metrics. |
| 💾 | **Retro looks** | Newsprint, Terminal, ’98 and **2000s Web 2.0** themes for any site. |

No servers, no accounts, no analytics. Everything stays in your browser.

Folkweb is not a tracker or cookie blocker. Use your browser's tracking protection or
uBlock Origin alongside it; Folkweb is designed to coexist with them.

## Develop

Requires Node 20+ (CI and releases use Node 22).

```bash
npm ci                          # install scripts are disabled (.npmrc) — supply-chain hardening
npm run prepare:wxt             # generate WXT types
npx playwright install chromium # once: the browser for the smoke tests
npm run dev                     # Chrome with live reload   (npm run dev:firefox for Firefox)
npm run check                   # typecheck + lint + tests + builds + smoke tests + Firefox lint + security scan
```

| Command | What it does |
|---|---|
| `npm run compile` | TypeScript strict typecheck |
| `npm run lint` | ESLint, including Mozilla's `no-unsanitized` and the project's security bans |
| `npm test` | Vitest unit tests (parsers, URL safety, trust graph, C2PA summary, DOM safety) |
| `npm run lint:lists` | Curation-policy lint for `lists/` |
| `npm run security` | Deterministic security gate (`--audit` adds `npm audit`) |
| `npm run build` / `build:firefox` | Production builds in `.output/` |
| `npm run test:e2e` | Browser smoke tests: the built extension in Chromium against local pages (`e2e/`); fails on any error |
| `npm run zip` / `zip:firefox` | Store packages (reproducible); releases are built by CI from a tag, see [docs/RELEASING.md](docs/RELEASING.md) |
| `npm run lint:firefox` | Mozilla `addons-linter`, the same check addons.mozilla.org runs |

Load the unpacked build from `.output/chrome-mv3` (chrome://extensions → Developer mode) or
`.output/firefox-mv3` (about:debugging → Load Temporary Add-on).

## Project map

```
src/
  entrypoints/   background, content script, popup, options, welcome, blocked and credentials pages
  content/       content-script modules (cosmetics, sponsored heuristic, human signals, search, look)
  lib/           pure, tested logic: filters, domains, url-safety, human-json, trust, c2pa-summary, settings
  themes/        retro themes + calm layer (pure CSS, loads nothing)
  ui/            safe DOM builder and the extension's own retro stylesheet
lists/           bundled curator lists (data only)
site/            folkweb.org: static, no JavaScript, served by Cloudflare Pages as-is
e2e/             browser smoke tests (Playwright) and their local fixture pages
scripts/         security scan, icon generator, release notes, agent guard hook
docs/            architecture, roadmap, list format, launch checklist
.github/         AI-agent instructions, skills, hooks, CI
```

## Read next

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit, and where the trust boundaries are
- [SECURITY.md](SECURITY.md): threat model, permissions and invariants (required reading for contributors and agents)
- [docs/LIST-FORMAT.md](docs/LIST-FORMAT.md): list syntax and curation policy
- [docs/ROADMAP.md](docs/ROADMAP.md): where we're going
- [docs/RELEASING.md](docs/RELEASING.md): how releases are built, and how to verify them
- [CHANGELOG.md](CHANGELOG.md): what changed in each version
- [AGENTS.md](AGENTS.md): how AI agents work on this project, and their limits

## Principles

1. **Evidence over guesses.** Show why, never a black-box score.
2. **People over algorithms.** You choose your curators and your circle.
3. **Calm by default.** Less motion, fewer counts, no autoplay.
4. **Private by design.** No data leaves your browser except what you ask for.
5. **Build on open standards.** human.json, C2PA, RSS, webrings, uBlock list syntax.
6. **AI that humanizes.** AI should help people find and understand each other's work: optional, clearly labelled, private. It also helps maintain Folkweb behind the scenes. Humans decide.

## Contributing

Bug reports, broken filters, list proposals with evidence and code are all welcome. Start
with [CONTRIBUTING.md](CONTRIBUTING.md). Please report vulnerabilities privately (see
[SECURITY.md](SECURITY.md)). Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

- Code: [GPL-3.0-or-later](LICENSE). Forks and modified versions must stay open source.
- Curator lists in `lists/`: [CC BY-SA 4.0](lists/LICENSE.md). Reuse them in other tools, with credit.
- "Folkweb" and its logo identify the official project. The licenses cover the code and
  lists, not the name: please give forks a different name.
