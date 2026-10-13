import { hideElement } from './dom';

/**
 * Sponsored-label heuristic: hide feed items that carry a short, exact
 * "Sponsored"/"Promoted" label. Conservative by design — it only looks inside
 * known feed-item containers and only at short text nodes.
 */

const LABELS = new Set([
  'sponsored',
  'promoted',
  'ad',
  'patrocinado',
  'publicidad',
  'promocionado',
  'gesponsert',
  'anzeige',
  'sponsorisé',
  'sponsorizzato',
  'reklam',
  'annonce',
]);

const FEED_ITEMS = [
  'article',
  '[role="article"]',
  '[data-testid="cellInnerDiv"]',
  'shreddit-post',
  'div[data-pagelet^="FeedUnit"]',
].join(',');

const MAX_TEXT_NODES = 150;
const MAX_CHECKS = 3;
const checked = new WeakMap<Element, number>();

export function isSponsoredLabel(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[·•:]/g, '').trim();
  return t.length > 0 && t.length <= 14 && LABELS.has(t);
}

function findLabel(item: Element): string | null {
  for (const el of item.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label');
    if (isSponsoredLabel(label)) return label!.trim();
  }
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  let n = 0;
  for (let node = walker.nextNode(); node && n < MAX_TEXT_NODES; node = walker.nextNode(), n++) {
    if (isSponsoredLabel(node.nodeValue)) return node.nodeValue!.trim();
  }
  return null;
}

export function scanSponsored(): number {
  let hidden = 0;
  for (const item of document.querySelectorAll(FEED_ITEMS)) {
    const count = checked.get(item) ?? 0;
    if (count >= MAX_CHECKS) continue;
    checked.set(item, count + 1);
    // Skip page-sized containers (e.g. <article> wrapping a whole blog post).
    if ((item.textContent?.length ?? 0) > 6000) continue;
    const label = findLabel(item);
    if (label && hideElement(item, { kind: 'sponsored-label', detail: `Labelled “${label}”` })) hidden++;
  }
  return hidden;
}
