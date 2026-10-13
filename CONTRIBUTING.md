# Contributing to Folkweb

Thank you for helping move the web back to people. Folkweb runs on every page its users
visit, so we care about safety first and features second. Please read
[SECURITY.md](SECURITY.md) before changing code. It is the contract every change keeps.

## Ways to help

| You want to… | Do this |
|---|---|
| Report a broken filter (an AI widget or ad slipped through, or something useful got hidden) | Open a **Broken filter** issue. Include the URL, what you expected and a screenshot. |
| Suggest a human-made site to boost, or a content farm to block | Open a **List proposal** issue with public evidence. See the [curation policy](docs/LIST-FORMAT.md#curation-policy). |
| Ask for your site to be removed from a list | Open a **Removal request** issue. Removal is weighed the same as addition. |
| Report a security vulnerability | **Don't open an issue.** Follow [SECURITY.md](SECURITY.md#reporting-a-vulnerability). |
| Fix a bug or build a feature | Open an issue first for anything bigger than a small fix, so we can agree on the approach. |

## Development

Requires Node 20+.

```bash
npm ci && npm run prepare:wxt   # install scripts are disabled on purpose (.npmrc)
npx playwright install chromium # once: the browser for the smoke tests
npm run dev                     # Chrome with live reload (npm run dev:firefox for Firefox)
npm run check                   # everything CI runs: types, lint, tests, builds, smoke tests, Firefox lint, security scan
```

Architecture and trust boundaries: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Rules for changes

- **Decisions live in `src/lib/`, with tests.** Entry points stay thin.
- **User-visible flows get a smoke test** in `e2e/smoke.spec.ts` when they touch a new page or a new kind of page interaction. Smoke tests use local fixture pages only, never the real web.
- **Untrusted input everywhere.** Pages, lists, storage, query strings and human.json go through the existing `sanitize*`, `parse*` and `is*` helpers. New parsers need attack-case tests.
- **Text, never HTML.** Use `textContent` or `h()`. Never `innerHTML`.
- **Network only through `safeFetch()`**, with URLs checked by `parseSafeUrl()`.
- **No new dependencies** unless there is no reasonable alternative. If one is needed, pin an exact version and explain why in the PR.
- **Permissions, CSP and the manifest** change only with a written justification in `SECURITY.md#permissions`.
- **Honest copy.** Missing signals mean "unknown", never "AI". No AI-detection scores.
- **Fix the code, not the check.** Never weaken tests, lint rules or `scripts/security-scan.mjs` to get green.

## Pull requests

- Keep them small and focused. One topic per PR.
- `npm run check` must pass. CI runs the same steps.
- Fill in the PR template, including the security checklist.
- Changes to `lists/`, `wxt.config.ts`, `SECURITY.md`, `AGENTS.md`, `.github/`, `scripts/` and dependencies need a maintainer's review (see [CODEOWNERS](.github/CODEOWNERS)).

### Sign your commits off (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/). Add a
`Signed-off-by` line to every commit to certify that you wrote the change or have the right
to submit it under the project's licenses:

```bash
git commit -s -m "Fix DuckDuckGo result selector"
```

### AI-assisted contributions

Welcome, with the same bar as any other change. You are responsible for every line you
submit. Say in the PR if an AI tool wrote a substantial part of it. AI agents working in this
repo follow [AGENTS.md](AGENTS.md) and its guard hooks. Never ask an agent to bypass them.

## Licenses

By contributing, you agree that your contributions are licensed under the project's licenses:

- Code: [GPL-3.0-or-later](LICENSE)
- Lists in `lists/`: [CC BY-SA 4.0](lists/LICENSE.md)

## Code of Conduct

Everyone taking part follows our [Code of Conduct](CODE_OF_CONDUCT.md). Be kind, judge
content rather than people, and assume good faith.
