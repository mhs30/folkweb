import { LIMITS } from './constants';
import { isSafePublicHttpUrl } from './url-safety';

/**
 * human.json protocol support (https://codeberg.org/robida/human.json, v0.1.x).
 * A site declares human authorship and vouches for other sites. Identity is a
 * URL prefix. Everything here treats the document as untrusted input.
 */

export interface HumanJson {
  version: string;
  /** Normalized canonical URL (scope of the authorship claim). */
  url: string;
  /** Normalized vouched URLs. */
  vouches: Array<{ url: string; vouchedAt?: string }>;
}

export type HumanJsonResult = { ok: true; doc: HumanJson } | { ok: false; reason: string };

/** Normalize per spec: http(s) only, lowercase host, drop default port, strip trailing slash, drop query/hash. */
export function normalizeHumanUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (!isSafePublicHttpUrl(u)) return null;
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host.toLowerCase()}${path}`;
}

/** Is `pageUrl` inside the scope of `scopeUrl` (same origin + path-segment prefix)? */
export function isUnderScope(pageUrl: string, scopeUrl: string): boolean {
  const page = normalizeHumanUrl(pageUrl);
  const scope = normalizeHumanUrl(scopeUrl);
  if (!page || !scope) return false;
  return page === scope || page.startsWith(scope + '/');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export function parseHumanJson(raw: unknown): HumanJsonResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'not a JSON object' };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== 'string' || !/^0\.\d+(\.\d+)?$/.test(obj.version)) {
    return { ok: false, reason: 'unsupported or missing version' };
  }
  const url = normalizeHumanUrl(obj.url);
  if (!url) return { ok: false, reason: 'missing or invalid url' };

  const vouches: HumanJson['vouches'] = [];
  if (obj.vouches !== undefined) {
    if (!Array.isArray(obj.vouches)) return { ok: false, reason: 'vouches must be an array' };
    for (const v of obj.vouches.slice(0, LIMITS.humanJsonVouches)) {
      if (typeof v !== 'object' || v === null) continue;
      const rec = v as Record<string, unknown>;
      const vu = normalizeHumanUrl(rec.url);
      if (!vu || vu === url) continue;
      const at = typeof rec.vouched_at === 'string' && DATE_RE.test(rec.vouched_at) ? rec.vouched_at.slice(0, 10) : undefined;
      vouches.push(at ? { url: vu, vouchedAt: at } : { url: vu });
    }
  }
  return { ok: true, doc: { version: obj.version, url, vouches } };
}

/**
 * Parse JSON text with a size cap. Never uses eval; JSON.parse only.
 */
export function parseHumanJsonText(text: string): HumanJsonResult {
  if (text.length > LIMITS.humanJsonBytes) return { ok: false, reason: 'document too large' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid JSON' };
  }
  return parseHumanJson(data);
}

/**
 * A claim only counts for the page if the page is inside the declared scope.
 * This stops site A from publishing a human.json that claims site B's identity.
 */
export function claimCoversPage(doc: HumanJson, pageUrl: string): boolean {
  return isUnderScope(pageUrl, doc.url);
}
