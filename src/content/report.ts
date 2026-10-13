import { REPORT_LIMITS, type HiddenItem } from '../lib/hidden-report';
import type { RuleSource } from '../lib/lists';
import { HIDDEN_ATTR, hideReasonOf, queryAllSafe, REVEALED_ATTR } from './dom';

const MAX_ANCESTOR_WALK = 40;
const MAX_PREVIEW_NODES = 60;

/** First words of the element's visible text, joined with spaces. Bounded: reads at most a few dozen text nodes. */
function preview(el: Element): string {
  const parts: string[] = [];
  let length = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(), i = 0; n && i < MAX_PREVIEW_NODES && length < REPORT_LIMITS.previewChars * 2; n = walker.nextNode(), i++) {
    const parent = n.parentElement;
    if (parent && (parent.closest('script, style, noscript, template') || parent.hasAttribute('data-folkweb-badge'))) continue;
    const t = n.nodeValue?.trim();
    if (!t) continue;
    parts.push(t);
    length += t.length + 1;
  }
  return parts.join(' ');
}

function insideListed(el: Element, listed: ReadonlySet<Element>): boolean {
  let p = el.parentElement;
  for (let i = 0; p && i < MAX_ANCESTOR_WALK; i++, p = p.parentElement) if (listed.has(p)) return true;
  return false;
}

/**
 * Everything Folkweb hid (or revealed) on this page, with the reason. Elements
 * nested inside an already-listed element are skipped so counts stay honest.
 */
export function collectHiddenItems(selectors: ReadonlyArray<{ selector: string; source: RuleSource }>): HiddenItem[] {
  const listed = new Set<Element>();
  const items: HiddenItem[] = [];
  const add = (el: Element, kind: HiddenItem['kind'], detail: string) => {
    if (items.length >= REPORT_LIMITS.scanItems || listed.has(el) || insideListed(el, listed)) return;
    listed.add(el);
    items.push({ kind, detail, preview: preview(el) });
  };

  for (const el of document.querySelectorAll(`[${HIDDEN_ATTR}], [${REVEALED_ATTR}]`)) {
    const reason = hideReasonOf(el);
    if (reason) add(el, reason.kind, reason.detail);
  }
  for (const { selector, source } of selectors) {
    for (const el of queryAllSafe(selector)) add(el, source, selector);
  }
  return items;
}
