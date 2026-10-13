---
description: "Use when creating or editing Folkweb retro themes, the calm layer, or extension UI styles (Newsprint, Terminal, ’98, 2000s Web 2.0). Covers scoping, no-network CSS and accessibility."
applyTo: "src/themes/**, src/ui/**/*.css"
---
# Themes and UI styles

- **Scope everything** under `html[data-folkweb-theme="<id>"]` (themes) or `html[data-folkweb-calm~="<flag>"]` (calm). Never style bare elements globally.
- **Load nothing.** No `url()`, `@import` or `@font-face`, and no external fonts. Use system font stacks and gradients only. Enforced by `npm run security`.
- **Don't break icon fonts:** text font overrides use `:not([class*="icon" i]):not([class*="symbol" i]):not([aria-hidden="true"])`.
- **Readable first:** keep body-text contrast at WCAG AA (4.5:1) or better. Respect user zoom: don't change font sizes on page content.
- **Calm means no motion.** Themes add no animations. Purely decorative additions use `pointer-events: none`.
- **Use the shared base.** `src/themes/base.css` applies a theme's palette (`--fw-t-*` custom properties) so text always sits on the theme's own background, including on dark-mode sites. A theme sets the palette and adds only its character. To override a base rule, repeat its `:not()` chain so specificity is equal and the theme wins by order.
- Use `!important` only where needed to beat page styles. Prefer low-specificity selectors inside the scope.
- A new theme needs: an id in `THEMES` and `THEME_LABELS` (`src/lib/settings.ts`), CSS in `src/themes/<id>.css`, registration in `src/content/look.ts`, and a settings test. See the `add-retro-theme` skill.
