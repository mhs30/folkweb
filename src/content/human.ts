import { LIMITS } from '../lib/constants';
import { claimCoversPage, parseHumanJsonText } from '../lib/human-json';
import type { HumanJsonStatus } from '../lib/messages';
import { parseSafeUrl, safeFetch } from '../lib/url-safety';

/**
 * Discover the page's own human.json (<link rel="human-json">).
 * MVP scope: same-origin documents only — fetched without cookies. Cross-origin
 * documents are reported but not fetched (needs optional host permission, v0.2).
 */
export async function discoverHumanJson(): Promise<HumanJsonStatus> {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="human-json" i][href]');
  if (!link) return { status: 'none' };
  const url = parseSafeUrl(link.getAttribute('href'), location.href);
  if (!url) return { status: 'invalid', href: String(link.getAttribute('href')).slice(0, 200), reason: 'not a public http(s) URL' };
  if (url.origin !== location.origin) return { status: 'cross-origin', href: url.href };

  try {
    const { bytes } = await safeFetch(url.href, { maxBytes: LIMITS.humanJsonBytes, accept: 'application/json' });
    const parsed = parseHumanJsonText(new TextDecoder().decode(bytes));
    if (!parsed.ok) return { status: 'invalid', href: url.href, reason: parsed.reason };
    if (!claimCoversPage(parsed.doc, location.href)) {
      return { status: 'out-of-scope', href: url.href, declared: parsed.doc.url };
    }
    return { status: 'found', href: url.href, doc: parsed.doc };
  } catch (err) {
    return { status: 'invalid', href: url.href, reason: err instanceof Error ? err.message : 'fetch failed' };
  }
}

const FEED_TYPES = ['application/rss+xml', 'application/atom+xml', 'application/feed+json', 'application/json'];

export function discoverFeeds(): Array<{ title: string; href: string }> {
  const out: Array<{ title: string; href: string }> = [];
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate" i][href][type]')) {
    const type = (link.getAttribute('type') ?? '').toLowerCase();
    if (!FEED_TYPES.includes(type)) continue;
    const url = parseSafeUrl(link.getAttribute('href'), location.href);
    if (!url) continue;
    out.push({ title: (link.getAttribute('title') ?? 'Feed').slice(0, 80), href: url.href });
    if (out.length >= 5) break;
  }
  return out;
}

/** A link to an /ai slashpage (https://slashpages.net) on the same site, if any. */
export function discoverAiPolicy(): string | null {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const url = parseSafeUrl(a.getAttribute('href'), location.href);
    if (url && url.origin === location.origin && /^\/ai\/?$/i.test(url.pathname)) return url.href;
  }
  return null;
}
