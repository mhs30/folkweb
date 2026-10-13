# Changelog

All notable changes to Folkweb. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/). Release notes on GitHub are
generated from this file (`scripts/release-notes.mjs`).

## [Unreleased]

Not released to any store yet. Planned as **0.2.0**, the first public release.

### Added
- **Human signals:** reads a site's `human.json`, lets you trust sites and see the sites they vouch for; shows feeds and `/ai` pages.
- **Curators, not algorithms:** boost and block lists for Google, DuckDuckGo and Bing results, a ★ folk badge on trusted results, and a calm stop page for blocked sites. The boost list has 29 evidence-backed entries.
- **Trusted sources in search:** show all, fade other sources, or show only trusted sources, with an in-page note and "Show all here".
- **Declutter, your way:** hides AI panels, AI summaries and sponsored modules you didn't ask for, each one a setting. Google opens as plain web results.
- **"Hidden on this page":** the popup lists what was hidden and why, and can show it all again with an outline.
- **Content Credentials:** right-click any image, video or audio to read its C2PA credentials, on your device.
- **Calm and looks:** no autoplay, still pages, optional grayscale, and four themes (Newsprint, Terminal, ’98, 2000s Web 2.0) built on a shared palette so dark-mode sites stay readable.
- **Welcome page** on first install; **Share and back up**: export and import lists, and create a `human.json` for your own website.
- **folkweb.org:** a script-free site with privacy, curation, security and AI policy pages.

### Security
- Minimal permissions (`storage`, `contextMenus`), host access only per site when you check an image, strict content security policy, no remote code, no telemetry.
- Untrusted input everywhere is validated: pages, lists, imported files, storage and content-script replies.
- Supply chain: exact pinned dependencies, install scripts disabled, SHA-pinned CI actions, Dependabot with a 7-day cooldown, a security scan on every change, browser smoke tests, reproducible builds and signed build provenance for releases.
