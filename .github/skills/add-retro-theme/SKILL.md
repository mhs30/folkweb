---
name: add-retro-theme
description: 'Create or modify a Folkweb retro theme (Newsprint, Terminal, ’98, 2000s Web 2.0 style) applied to every website. Use when: adding a new look such as GeoCities, Mac OS 9, Teletext or high-contrast, or fixing a theme that breaks readability or icons on a site.'
argument-hint: 'Theme idea, e.g. "Teletext: black, primary colours, chunky type"'
---
# Add or change a retro theme

## Procedure

1. **Pick an id** (lowercase, no spaces) and a friendly label.
2. **Create `src/themes/<id>.css`.** Start from the closest existing theme (`y2k.css` or `win98.css` show both palette and character). Rules:
   - Set the palette on `html[data-folkweb-theme="<id>"]`: every `--fw-t-*` property listed at the top of `src/themes/base.css`. The base applies it to text, links, controls and layout backgrounds, so dark-mode sites stay readable.
   - `--fw-t-page` must keep text readable on its own: on long pages `<body>` can end before the content does.
   - Add only the theme's character on top (bevels, gradients, title bars). To override a base rule, repeat its `:not()` chain so the theme wins by order.
   - Scope every selector under `html[data-folkweb-theme="<id>"]`.
   - Load nothing: no `url()`, `@import`, `@font-face` or web fonts. Use system font stacks and CSS gradients.
   - Apply font overrides only to text elements, excluding icons: `:not([class*="icon" i]):not([class*="symbol" i]):not([aria-hidden="true"])`.
   - No animations. Decorations use `pointer-events: none`.
   - Body-text contrast ≥ 4.5:1 for ink, muted and link colours against `--fw-t-bg` and `--fw-t-page`. Don't change font sizes.
3. **Register it:** add the id to `THEMES` and `THEME_LABELS` in `src/lib/settings.ts`, and import the CSS with `?raw` in `src/content/look.ts` (`THEME_CSS`).
4. **Test:** extend `tests/settings-messages-search.test.ts` so `sanitizeSettings({ theme: '<id>' })` keeps the id. Run `npm test && npm run security && npm run build`.
5. **Look at it:** load `.output/chrome-mv3`, select the theme in the popup, and check at least a news article, a search results page, a page with icon fonts (e.g. a Google product) and a site in dark mode (e.g. GitHub with the system in dark mode). Take screenshots for the human reviewer. If you can, run axe-core's `color-contrast` rule on those pages: a theme must not add contrast failures.
6. **Report:** the theme's intent, screenshots, and any sites where it looks off.
