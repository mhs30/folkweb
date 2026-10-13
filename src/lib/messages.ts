import { cleanText, groupHidden, isHideKind, REPORT_LIMITS, type HiddenGroup, type HiddenItem } from './hidden-report';
import { normalizeHumanUrl, type HumanJson } from './human-json';
import type { TrustLevel } from './trust';
import { parseSafeUrl } from './url-safety';

/**
 * Typed messages between extension contexts. Every receiver validates the
 * shape at runtime (never trust the type annotation alone) and checks that
 * the sender is this extension.
 */

export interface OpenBlockedMessage {
  type: 'folkweb:open-blocked';
  url: string;
  matched: string;
}

export interface GetSignalsMessage {
  type: 'folkweb:get-signals';
}

/** Popup → content script: show everything Folkweb hid on this page (until reload). */
export interface RevealHiddenMessage {
  type: 'folkweb:reveal-hidden';
}

export type HumanJsonStatus =
  | { status: 'none' }
  | { status: 'found'; href: string; doc: HumanJson }
  | { status: 'invalid'; href: string; reason: string }
  | { status: 'out-of-scope'; href: string; declared: string }
  | { status: 'cross-origin'; href: string }
  | { status: 'pending' };

export interface PageSignals {
  url: string;
  host: string;
  disabled: boolean;
  humanJson: HumanJsonStatus;
  trust: TrustLevel;
  curated: { boost: string | null; block: string | null };
  feeds: Array<{ title: string; href: string }>;
  aiPolicy: string | null;
  /** What Folkweb hid on this page, grouped by reason. */
  hidden: HiddenGroup[];
  hiddenTotal: number;
  /** True after the user asked to show hidden elements on this page. */
  revealed: boolean;
  /** Search engine adapter id when this page is a search results page. */
  searchEngine: string | null;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isOpenBlockedMessage(x: unknown): x is OpenBlockedMessage {
  return (
    isObj(x) &&
    x.type === 'folkweb:open-blocked' &&
    typeof x.url === 'string' &&
    x.url.length <= 4096 &&
    typeof x.matched === 'string' &&
    x.matched.length <= 253
  );
}

export function isGetSignalsMessage(x: unknown): x is GetSignalsMessage {
  return isObj(x) && x.type === 'folkweb:get-signals';
}

export function isRevealHiddenMessage(x: unknown): x is RevealHiddenMessage {
  return isObj(x) && x.type === 'folkweb:reveal-hidden';
}

/** Only accept messages that originate from this extension. */
export function isFromThisExtension(sender: { id?: string }, runtimeId: string): boolean {
  return sender.id === runtimeId;
}

// --- Content script → popup -------------------------------------------------
// The reply comes from a content script that reads a hostile page, and after an
// update an older content script may still be running in a tab. Validate it like
// any other untrusted input and fill in safe defaults.

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const safeHref = (v: unknown): string | null => parseSafeUrl(str(v, 4096) ?? '')?.href ?? null;
const scope = (v: unknown): string | null => normalizeHumanUrl(v);
/** The page itself may be local (e.g. a dev server); it's never fetched or linked, only compared. */
const pageHref = (v: unknown): string | null => {
  const s = str(v, 4096);
  if (!s) return null;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};

function sanitizeHumanJsonStatus(raw: unknown): HumanJsonStatus {
  if (!isObj(raw)) return { status: 'none' };
  const href = safeHref(raw.href);
  switch (raw.status) {
    case 'found': {
      const doc = isObj(raw.doc) ? raw.doc : null;
      const url = scope(doc?.url);
      const version = str(doc?.version, 16);
      if (!href || !doc || !url || !version) return { status: 'none' };
      const vouches = Array.isArray(doc.vouches)
        ? doc.vouches
            .slice(0, 1000)
            .map((v) => (isObj(v) ? { url: scope(v.url), vouchedAt: str(v.vouchedAt, 10) ?? undefined } : null))
            .filter((v): v is { url: string; vouchedAt: string | undefined } => v !== null && v.url !== null)
            .map((v) => (v.vouchedAt ? { url: v.url, vouchedAt: v.vouchedAt } : { url: v.url }))
        : [];
      return { status: 'found', href, doc: { version, url, vouches } };
    }
    case 'invalid':
      return href ? { status: 'invalid', href, reason: cleanText(str(raw.reason, 500), 120) } : { status: 'none' };
    case 'out-of-scope': {
      const declared = scope(raw.declared);
      return href && declared ? { status: 'out-of-scope', href, declared } : { status: 'none' };
    }
    case 'cross-origin':
      return href ? { status: 'cross-origin', href } : { status: 'none' };
    case 'pending':
      return { status: 'pending' };
    default:
      return { status: 'none' };
  }
}

function sanitizeTrustLevel(raw: unknown): TrustLevel {
  if (!isObj(raw)) return { level: 'unknown' };
  switch (raw.level) {
    case 'distrusted':
    case 'declared':
      return { level: raw.level };
    case 'seed': {
      const seed = scope(raw.seed);
      return seed ? { level: 'seed', seed } : { level: 'unknown' };
    }
    case 'vouched': {
      const by = Array.isArray(raw.by) ? raw.by.slice(0, 50).map(scope).filter((v): v is string => v !== null) : [];
      return by.length ? { level: 'vouched', by } : { level: 'unknown' };
    }
    default:
      return { level: 'unknown' };
  }
}

function sanitizeHiddenGroups(raw: unknown): HiddenGroup[] {
  if (!Array.isArray(raw)) return [];
  const items: HiddenItem[] = [];
  const counts = new Map<HiddenItem['kind'], number>();
  for (const g of raw.slice(0, 20)) {
    if (!isObj(g) || !isHideKind(g.kind) || !Array.isArray(g.items)) continue;
    const count = typeof g.count === 'number' && Number.isInteger(g.count) && g.count >= 0 ? Math.min(g.count, 100_000) : 0;
    counts.set(g.kind, (counts.get(g.kind) ?? 0) + count);
    for (const i of g.items.slice(0, REPORT_LIMITS.itemsPerGroup)) {
      if (!isObj(i)) continue;
      items.push({ kind: g.kind, detail: str(i.detail, 2000) ?? '', preview: str(i.preview, 2000) ?? '' });
    }
  }
  // groupHidden re-caps and re-cleans the text; keep the content script's exact counts.
  return groupHidden(items).map((g) => ({ ...g, count: Math.max(counts.get(g.kind) ?? 0, g.items.length) }));
}

export interface SanitizedSignals {
  signals: PageSignals;
  /** The tab runs an older Folkweb content script (reload the tab to update it). */
  outdated: boolean;
}

/** Validate the content script's reply. Returns null if it isn't usable at all. */
export function sanitizePageSignals(raw: unknown): SanitizedSignals | null {
  if (!isObj(raw)) return null;
  const url = pageHref(raw.url);
  const host = str(raw.host, 253);
  if (!url || !host) return null;
  const curated = isObj(raw.curated) ? raw.curated : {};
  const feeds = Array.isArray(raw.feeds)
    ? raw.feeds
        .slice(0, 10)
        .map((f) => (isObj(f) ? { title: cleanText(str(f.title, 500), 80) || 'Feed', href: safeHref(f.href) } : null))
        .filter((f): f is { title: string; href: string } => f !== null && f.href !== null)
    : [];
  const hidden = sanitizeHiddenGroups(raw.hidden);
  return {
    outdated: !Array.isArray(raw.hidden) || typeof raw.revealed !== 'boolean',
    signals: {
      url,
      host: host.toLowerCase(),
      disabled: raw.disabled === true,
      humanJson: sanitizeHumanJsonStatus(raw.humanJson),
      trust: sanitizeTrustLevel(raw.trust),
      curated: { boost: str(curated.boost, 253), block: str(curated.block, 253) },
      feeds,
      aiPolicy: safeHref(raw.aiPolicy),
      hidden,
      hiddenTotal: hidden.reduce((n, g) => n + g.count, 0),
      revealed: raw.revealed === true,
      searchEngine: str(raw.searchEngine, 32),
    },
  };
}
