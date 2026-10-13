# How Folkweb releases are made

Releases are built by GitHub Actions from a version tag, checked, and uploaded to the
browser stores **by a maintainer, by hand**. Agents and CI never publish to a store.

## What the pipeline does

`.github/workflows/release.yml` runs when a maintainer pushes a tag like `v0.2.0`:

1. Checks the tag matches `package.json`'s version.
2. Installs with `npm ci` (install scripts disabled) and runs the full `npm run check`: types, lint, unit tests, builds, browser smoke tests, Firefox lint and the security scan, plus `npm audit`.
3. Builds the store packages: `folkweb-X.Y.Z-chrome.zip`, `folkweb-X.Y.Z-firefox.zip` and `folkweb-X.Y.Z-sources.zip` (the source code Mozilla's reviewers need).
4. Writes `SHA256SUMS.txt` and signs **build provenance** for every zip (Sigstore, via GitHub attestations).
5. Creates a **draft** GitHub release with the notes from `CHANGELOG.md` (`scripts/release-notes.mjs`).

A maintainer approves the release, checks the files, uploads them to Firefox Add-ons, Edge
Add-ons and the Chrome Web Store, and publishes the GitHub release.

## Verify a release yourself

```bash
gh attestation verify folkweb-X.Y.Z-firefox.zip --repo mhs30/folkweb
shasum -a 256 -c SHA256SUMS.txt
```

## Reproducible builds

Building the same commit twice produces byte-identical zips, and rebuilding from the sources
zip alone reproduces the Firefox package exactly. Anyone can check a release:

```bash
git checkout vX.Y.Z && npm ci && npm run zip && npm run zip:firefox
shasum -a 256 .output/*.zip   # compare with SHA256SUMS.txt from the release
```

Use Node 22, as in CI. A different Node or npm version can change the output.

**For Mozilla's reviewers:** unzip `folkweb-X.Y.Z-sources.zip`, then run
`npm ci && npm run zip:firefox` with Node 22. The result in `.output/` matches the uploaded
Firefox package.
