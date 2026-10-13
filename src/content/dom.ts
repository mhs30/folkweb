/** Safe DOM helpers for content scripts. Text only — never innerHTML. */

import type { HideReason } from '../lib/hidden-report';

export const HIDDEN_ATTR = 'data-folkweb-hidden';
export const REVEALED_ATTR = 'data-folkweb-revealed';

// Kept in the isolated world (not in page-visible attributes), so the page can't read or forge reasons.
const reasons = new WeakMap<Element, HideReason>();
// The attribute is output only (for themes and debugging). A page can set it too, so it is never trusted as proof.
const hiddenByUs = new WeakSet<HTMLElement>();
const priorDisplay = new WeakMap<HTMLElement, { value: string; priority: string }>();

// Folkweb's own <style> elements, held here in the isolated world instead of looked up by
// id: a page could plant an element with the same id to swallow or replace our CSS.
const styles = new Map<string, HTMLStyleElement>();

export function upsertStyle(key: string, css: string): void {
  let el = styles.get(key);
  if (!el) {
    el = document.createElement('style');
    styles.set(key, el);
  }
  if (!el.isConnected) (document.head ?? document.documentElement).appendChild(el);
  if (el.textContent !== css) el.textContent = css;
}

export function removeStyle(key: string): void {
  styles.get(key)?.remove();
  styles.delete(key);
}

/** Hide via CSSOM so it works even when page CSP blocks inline <style>. Records why, for the popup report. */
export function hideElement(el: Element, reason?: HideReason): boolean {
  if (!(el instanceof HTMLElement) || hiddenByUs.has(el)) return false;
  hiddenByUs.add(el);
  priorDisplay.set(el, { value: el.style.getPropertyValue('display'), priority: el.style.getPropertyPriority('display') });
  el.setAttribute(HIDDEN_ATTR, '');
  el.style.setProperty('display', 'none', 'important');
  if (reason) reasons.set(el, reason);
  return true;
}

/** Undo hideElement(), restoring the page's own inline display value. */
export function unhideElement(el: Element): boolean {
  if (!(el instanceof HTMLElement) || !hiddenByUs.has(el)) return false;
  hiddenByUs.delete(el);
  const prior = priorDisplay.get(el);
  if (prior?.value) el.style.setProperty('display', prior.value, prior.priority);
  else el.style.removeProperty('display');
  el.removeAttribute(HIDDEN_ATTR);
  return true;
}

/** Show a hidden element with a dashed outline, keeping its reason so the report still lists it. */
export function revealElement(el: Element): boolean {
  if (!unhideElement(el)) return false;
  const html = el as HTMLElement;
  html.setAttribute(REVEALED_ATTR, '');
  html.style.setProperty('outline', '2px dashed #9a7a12', 'important');
  html.style.setProperty('outline-offset', '2px', 'important');
  return true;
}

export function hideReasonOf(el: Element): HideReason | undefined {
  return reasons.get(el);
}

export function isValidSelector(selector: string): boolean {
  try {
    return CSS.supports(`selector(${selector})`);
  } catch {
    return false;
  }
}

/** querySelectorAll that never throws: one bad list selector must not break the rest. */
export function queryAllSafe(selector: string, root: ParentNode = document): Element[] {
  if (!isValidSelector(selector)) return [];
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

/** Run `fn` at most once per animation frame burst, coalescing DOM mutations. */
export function observeMutations(fn: () => void, delayMs = 250): () => void {
  let timer: number | undefined;
  const schedule = () => {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      fn();
    }, delayMs);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  return () => {
    mo.disconnect();
    if (timer !== undefined) clearTimeout(timer);
  };
}
