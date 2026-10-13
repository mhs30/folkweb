import { GOOGLE_SEARCH_DOMAINS } from './google-domains';

/**
 * Search engine adapters for annotating results with curator signals.
 * Selectors verified 2026-10-12 (see lists/ai-surfaces.txt for the method).
 *
 * Hosts are matched exactly: the marks Folkweb adds to results are visible to the page,
 * so a lookalike "search page" must never get them (it could read your lists back).
 */

export interface SearchAdapter {
  id: string;
  matches(url: URL): boolean;
  /** Elements that each represent one organic result. */
  resultSelector: string;
  /** Where to place Folkweb's "only trusted sources" notice. */
  resultsContainerSelector: string;
  /** Extract the result's destination host. Returns null when unknown. */
  hostOf(result: Element): string | null;
}

function hostFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Bing links are click-tracking redirects; the visible <cite> holds the real URL. */
export function hostFromCite(text: string | null | undefined): string | null {
  if (!text) return null;
  const first = text.trim().split(/[\s›]+/)[0] ?? '';
  return hostFromHref(/^https?:\/\//.test(first) ? first : `https://${first}`);
}

/** Google's own search hosts only: google.<domain> or www.google.<domain> from Google's list. */
export function isGoogleSearchHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return GOOGLE_SEARCH_DOMAINS.has(h.startsWith('www.') ? h.slice(4) : h);
}

export const SEARCH_ADAPTERS: SearchAdapter[] = [
  {
    id: 'google',
    matches: (u) => isGoogleSearchHost(u.hostname) && u.pathname === '/search',
    resultSelector: '#search a:has(h3)',
    resultsContainerSelector: '#search',
    hostOf: (el) => hostFromHref((el as HTMLAnchorElement).href),
  },
  {
    id: 'duckduckgo',
    matches: (u) => /(^|\.)duckduckgo\.com$/.test(u.hostname),
    resultSelector: 'article[data-testid="result"]',
    resultsContainerSelector: 'section[data-testid="mainline"]',
    hostOf: (el) => hostFromHref(el.querySelector<HTMLAnchorElement>('a[data-testid="result-title-a"]')?.href),
  },
  {
    id: 'bing',
    matches: (u) => /(^|\.)bing\.com$/.test(u.hostname) && u.pathname === '/search',
    resultSelector: 'li.b_algo',
    resultsContainerSelector: '#b_results',
    hostOf: (el) => hostFromCite(el.querySelector('cite')?.textContent),
  },
];

export function adapterFor(url: URL): SearchAdapter | null {
  return SEARCH_ADAPTERS.find((a) => a.matches(url)) ?? null;
}

/**
 * Google "Web" results (udm=14) drop AI Overviews. Only rewrite plain web
 * searches: leave image/news/shopping/etc. (tbm/udm already set) untouched, and
 * never rewrite when you came from a Google results page (you chose "All" there).
 */
export function googleWebOnlyUrl(url: URL, referrer = ''): string | null {
  if (!isGoogleSearchHost(url.hostname) || url.pathname !== '/search') return null;
  if (!url.searchParams.has('q') || url.searchParams.has('udm') || url.searchParams.has('tbm')) return null;
  try {
    const from = new URL(referrer);
    if (isGoogleSearchHost(from.hostname) && from.pathname === '/search') return null;
  } catch {
    // No or unreadable referrer: a search started elsewhere (address bar, search box).
  }
  const next = new URL(url.href);
  next.searchParams.set('udm', '14');
  return next.href;
}
