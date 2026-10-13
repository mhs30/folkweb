---
description: "Use when writing or changing Folkweb tests (Vitest, happy-dom). Covers what must be tested, attack-case fixtures and keeping tests honest."
applyTo: "tests/**, e2e/**"
---
# Tests

- Pure logic in `src/lib/` runs under Node. DOM code uses `// @vitest-environment happy-dom` at the top of the file.
- **Every parser or validator of untrusted input** gets attack cases next to the happy path: CSS breakout, `javascript:` URLs, private IPs, oversized input, wrong types, impersonation (see `tests/filters.test.ts`, `tests/human-json.test.ts`). `javascript:` fixtures are allowed in `tests/` only.
- Never weaken an assertion, skip a test or loosen `scripts/security-scan.mjs` to get green. Fix the code. If a test is genuinely wrong, explain why in the change.
- `tests/lists.test.ts` enforces the curation policy. `tests/agent-guard.test.ts` pins the agent guard behaviour.
- Keep tests deterministic: no network, no real timers unless faked.
- **Browser smoke tests** live in `e2e/` (Playwright, `npm run test:e2e` after `npm run build`). They run one fresh Chromium profile in order, like a person installing Folkweb, against local fixture pages in `e2e/pages/`, never the real web. The last test asserts that nothing logged an error. Add a smoke test when a change adds an extension page or a new kind of page interaction.
