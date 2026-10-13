import { matchDomain, normalizeDomain } from '../lib/domains';
import type { SearchAdapter } from '../lib/search';
import type { TrustedMode } from '../lib/settings';
import { hideElement, unhideElement, upsertStyle } from './dom';

const DONE_ATTR = 'data-folkweb-seen';
export const FADE_ATTR = 'data-folkweb-faded';
const STYLE_ID = 'folkweb-search';
const SEARCH_CSS = `[${FADE_ATTR}] { opacity: 0.45 !important; }
[${FADE_ATTR}]:hover, [${FADE_ATTR}]:focus-within { opacity: 1 !important; }`;

export interface SearchContext {
  adapter: SearchAdapter;
  block: ReadonlySet<string>;
  /** Curator boost lists (bundled + yours). */
  boost: ReadonlySet<string>;
  /** Whole-site hosts in your human.json trust circle, matched exactly (no subdomains). Empty unless trustedMode is on. */
  circle: ReadonlySet<string>;
  hideBlocked: boolean;
  annotate: boolean;
  trustedMode: TrustedMode;
}

// Per-page state: results hidden by "only trusted sources", and whether the user chose to see them.
const untrustedHidden: HTMLElement[] = [];
let trustedSeen = 0;
let showAllHere = false;
let notice: HTMLElement | null = null;

function containerFor(adapter: SearchAdapter, result: Element): Element {
  return adapter.id === 'google' ? result.closest('#search [data-hveid], #search .g') ?? result : result;
}

// One generic title: page scripts can read it, so it must not reveal *why* a site is trusted.
const BADGE_TITLE = 'A source you chose: on a list you follow or in your trust circle';

function badge(): HTMLSpanElement {
  const el = document.createElement('span');
  el.setAttribute('data-folkweb-badge', '');
  el.title = BADGE_TITLE;
  el.textContent = '★ folk';
  return el;
}

function fade(el: Element): boolean {
  if (el.hasAttribute(FADE_ATTR)) return false;
  el.setAttribute(FADE_ATTR, '');
  return true;
}

/**
 * Hide results from blocked domains, badge trusted ones, and fade or hide the
 * rest according to the trusted-sources mode. Returns how many were hidden.
 */
export function annotateSearch(ctx: SearchContext): number {
  upsertStyle(STYLE_ID, SEARCH_CSS);
  const mode: TrustedMode = showAllHere && ctx.trustedMode === 'only' ? 'fade' : ctx.trustedMode;
  let hidden = 0;
  for (const result of document.querySelectorAll(ctx.adapter.resultSelector)) {
    if (result.hasAttribute(DONE_ATTR)) continue;
    result.setAttribute(DONE_ATTR, '');
    const host = ctx.adapter.hostOf(result);
    if (!host) continue;
    const container = containerFor(ctx.adapter, result);

    const blocked = ctx.hideBlocked ? matchDomain(host, ctx.block) : null;
    if (blocked) {
      if (hideElement(container, { kind: 'blocked-result', detail: `${host} (blocked: ${blocked})` })) hidden++;
      continue;
    }

    const boosted = matchDomain(host, ctx.boost) !== null;
    const key = normalizeDomain(host);
    const inCircle = !boosted && key !== null && ctx.circle.has(key);
    if (boosted || inCircle) {
      trustedSeen++;
      if (ctx.annotate) {
        const target = result.querySelector('h3, h2, a[data-testid="result-title-a"]') ?? result;
        target.prepend(badge());
      }
      continue;
    }

    if (mode === 'fade') fade(container);
    else if (mode === 'only' && hideElement(container, { kind: 'untrusted-result', detail: host })) {
      untrustedHidden.push(container as HTMLElement);
      hidden++;
    }
  }
  if (ctx.trustedMode === 'only') updateNotice(ctx.adapter);
  return hidden;
}

/** Un-hide results hidden by "only trusted sources" on this page and fade them instead. */
export function showAll(adapter: SearchAdapter): void {
  showAllHere = true;
  for (const el of untrustedHidden.splice(0)) if (unhideElement(el)) fade(el);
  updateNotice(adapter);
}

function updateNotice(adapter: SearchAdapter): void {
  const count = untrustedHidden.length;
  if (!showAllHere && count === 0) {
    removeTrustedNotice();
    return;
  }
  if (!notice?.isConnected) {
    const container = document.querySelector(adapter.resultsContainerSelector);
    if (!container) return;
    notice = buildNotice(adapter);
    container.prepend(notice);
  }
  const text = notice.querySelector('span');
  const button = notice.querySelector('button');
  if (!text || !button) return;
  if (showAllHere) {
    text.textContent = '★ Showing all results on this page. Results from other sources are faded.';
    button.hidden = true;
  } else {
    text.textContent =
      trustedSeen === 0
        ? `★ None of these results come from sources you trust yet, so Folkweb hid ${count}. `
        : `★ Showing only sources you trust. ${count} other result${count === 1 ? '' : 's'} hidden. `;
    button.hidden = false;
  }
}

function buildNotice(adapter: SearchAdapter): HTMLElement {
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.setAttribute('data-folkweb-notice', '');
  const s = box.style;
  s.setProperty('margin', '0 0 14px');
  s.setProperty('padding', '8px 12px');
  s.setProperty('border', '1px solid #f3c4ad');
  s.setProperty('border-left', '4px solid #d9542b');
  s.setProperty('border-radius', '10px');
  s.setProperty('background', '#fff1e9');
  s.setProperty('color', '#1f2433');
  s.setProperty('font', '14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif');
  const text = document.createElement('span');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Show all here';
  button.style.setProperty('font', 'inherit');
  button.style.setProperty('cursor', 'pointer');
  // Only a real click by the person counts; page scripts can't flip it.
  button.addEventListener('click', (e) => {
    if (e.isTrusted) showAll(adapter);
  });
  box.append(text, button);
  return box;
}

/** Reset per-page state (used by tests). */
export function resetSearchState(): void {
  untrustedHidden.length = 0;
  trustedSeen = 0;
  showAllHere = false;
  removeTrustedNotice();
}

export function removeTrustedNotice(): void {
  notice?.remove();
  notice = null;
}
