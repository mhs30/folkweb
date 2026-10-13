## What and why

<!-- One topic per PR. Link the issue: "Fixes #123". -->

## Security checklist

<!-- See SECURITY.md. Tick what applies; explain anything you leave unticked. -->

- [ ] Untrusted input (pages, lists, storage, query strings, human.json, C2PA) is validated with the existing helpers
- [ ] DOM writes are text-only (`textContent` / `h()`), no HTML strings
- [ ] Network access only through `safeFetch()`, URLs through `parseSafeUrl()`
- [ ] No new permissions, CSP or manifest changes (or justified in `SECURITY.md#permissions`)
- [ ] No new dependencies (or pinned exactly, with the reason below)
- [ ] No telemetry; no new data leaves the browser
- [ ] UI copy is honest: missing signals mean "unknown", never "AI"
- [ ] New parsing/validation logic has attack-case tests
- [ ] `npm run check` passes locally

## For list changes

- [ ] Every entry has public evidence linked above ([curation policy](https://github.com/mhs30/folkweb/blob/main/docs/LIST-FORMAT.md#curation-policy))
- [ ] Filter rules are scoped and carry a `! verified: YYYY-MM-DD` or `! unverified — reason` marker

## AI assistance

<!-- Did an AI tool write a substantial part of this? Say which parts. You are responsible for every line. -->

Commits are signed off (`git commit -s`, see CONTRIBUTING.md).
