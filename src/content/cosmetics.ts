import { buildHidingCss, buildRevealCss } from '../lib/filters';
import type { RuleSource, SourcedRule } from '../lib/lists';
import { hideElement, isValidSelector, queryAllSafe, upsertStyle } from './dom';

const STYLE_ID = 'folkweb-cosmetic';
const MAX_TEXT_SCAN = 20_000;

/** Plain (non-:has-text) selectors for this host, with the list each came from. */
export function selectorSources(rules: readonly SourcedRule[]): Array<{ selector: string; source: RuleSource }> {
  const seen = new Set<string>();
  const out: Array<{ selector: string; source: RuleSource }> = [];
  for (const r of rules) {
    if (r.hasText || seen.has(r.selector)) continue;
    seen.add(r.selector);
    out.push({ selector: r.selector, source: r.source });
  }
  return out;
}

/**
 * Apply cosmetic rules already filtered for this host. When `revealed`, the
 * same selectors are outlined instead of hidden. Returns a function that
 * re-scans :has-text() rules.
 */
export function applyCosmetics(rules: readonly SourcedRule[], revealed = false): () => void {
  const selectors = selectorSources(rules).map((s) => s.selector);
  upsertStyle(STYLE_ID, revealed ? buildRevealCss(selectors, isValidSelector) : buildHidingCss(selectors, isValidSelector));

  const textRules = rules.filter((r) => r.hasText && isValidSelector(r.selector));
  return () => {
    if (revealed) return;
    for (const r of textRules) {
      const needle = r.hasText!.toLowerCase();
      for (const el of queryAllSafe(r.selector)) {
        const content = (el.textContent ?? '').slice(0, MAX_TEXT_SCAN).toLowerCase();
        if (content.includes(needle)) hideElement(el, { kind: r.source, detail: `${r.selector}:has-text(${r.hasText})` });
      }
    }
  };
}
