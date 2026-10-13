---
name: security-check
description: 'Run the Folkweb security gate and review a change against SECURITY.md before finishing any task. Use when: completing a feature or fix, touching content scripts, messaging, fetch/URL handling, manifest/permissions/CSP, lists, dependencies, or when asked for a security review.'
---
# Security check

Run this before you say any change is done.

## 1. Automated gate (must be green)

```bash
npm run compile && npm run lint && npm test && npm run security
npm run build && npm run lint:firefox     # when manifest, entrypoints or dependencies changed
node scripts/security-scan.mjs --audit    # when dependencies changed (network)
```

If something fails, fix the code. Never edit `scripts/security-scan.mjs`, ESLint rules,
tests or CSP to get green without explicit human approval.

## 2. Manual review checklist (read the diff)

- [ ] **Untrusted input:** every value from the page, lists, storage, query strings, human.json or C2PA is validated (`parseSafeUrl`, `sanitize*`, `parse*`, `is*Message`).
- [ ] **DOM:** text-only writes (`textContent`, `h()`). No HTML strings. No inline event handlers.
- [ ] **Network:** only `safeFetch()`; no cookies; size cap and timeout kept; no new destinations without a user action.
- [ ] **Messaging:** sender check plus a shape validator. No `window.postMessage`.
- [ ] **Permissions/CSP/manifest:** unchanged, or justified in `SECURITY.md#permissions` with human approval.
- [ ] **Dependencies:** none added, or pinned exactly, with the reason stated and `npm audit` clean.
- [ ] **Privacy:** no telemetry, no new data leaving the browser, no new persisted personal data.
- [ ] **Honesty:** UI text never states guesses as facts. Missing credentials mean "unknown".
- [ ] **Lists:** data only, scoped, verification markers, evidence for domain entries.
- [ ] **Tests:** new parsing or validation logic has attack-case tests.

## 3. Report

Tell the human, briefly: which checks ran and their results, any checklist item that needed
thought, and anything you could not verify. For a deeper independent review, invoke the
`security-reviewer` agent.
