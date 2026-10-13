import { normalizeDomain } from './domains';
import { isUnderScope, normalizeHumanUrl, type HumanJson } from './human-json';

/**
 * Local, user-owned trust graph. The user picks seeds (sites they personally
 * trust); a seed's human.json vouches extend trust one hop. Deeper crawling
 * (2+ hops) is a later milestone and needs optional host permissions.
 */

export interface TrustedSeed {
  /** Normalized canonical URL from the seed's human.json. */
  url: string;
  vouches: string[];
  addedAt: number;
  refreshedAt: number;
}

export interface TrustState {
  seeds: TrustedSeed[];
  /** Normalized URLs the user never wants to be considered human-vouched. */
  distrusted: string[];
}

export const EMPTY_TRUST: TrustState = { seeds: [], distrusted: [] };

export type TrustLevel =
  | { level: 'distrusted' }
  | { level: 'seed'; seed: string }
  | { level: 'vouched'; by: string[] }
  | { level: 'declared' }
  | { level: 'unknown' };

/**
 * Evaluate a page against the trust graph.
 * @param claim the page's own human.json, only if it was verified to cover the page.
 */
export function evaluateTrust(pageUrl: string, trust: TrustState, claim: HumanJson | null): TrustLevel {
  if (trust.distrusted.some((d) => isUnderScope(pageUrl, d))) return { level: 'distrusted' };
  const seed = trust.seeds.find((s) => isUnderScope(pageUrl, s.url));
  if (seed) return { level: 'seed', seed: seed.url };
  const by = trust.seeds.filter((s) => s.vouches.some((v) => isUnderScope(pageUrl, v))).map((s) => s.url);
  if (by.length) return { level: 'vouched', by };
  if (claim) return { level: 'declared' };
  return { level: 'unknown' };
}

export function addSeed(trust: TrustState, doc: HumanJson, now = Date.now()): TrustState {
  const seeds = trust.seeds.filter((s) => s.url !== doc.url);
  seeds.push({ url: doc.url, vouches: doc.vouches.map((v) => v.url), addedAt: now, refreshedAt: now });
  return { ...trust, seeds, distrusted: trust.distrusted.filter((d) => d !== doc.url) };
}

export function removeSeed(trust: TrustState, url: string): TrustState {
  return { ...trust, seeds: trust.seeds.filter((s) => s.url !== url) };
}

/** Validate untrusted storage contents into a TrustState. */
export function sanitizeTrust(raw: unknown): TrustState {
  if (typeof raw !== 'object' || raw === null) return EMPTY_TRUST;
  const r = raw as Record<string, unknown>;
  const seeds: TrustedSeed[] = [];
  if (Array.isArray(r.seeds)) {
    for (const s of r.seeds.slice(0, 500)) {
      if (typeof s !== 'object' || s === null) continue;
      const rec = s as Record<string, unknown>;
      const url = normalizeHumanUrl(rec.url);
      if (!url) continue;
      const vouches = Array.isArray(rec.vouches)
        ? rec.vouches.map(normalizeHumanUrl).filter((v): v is string => v !== null).slice(0, 1000)
        : [];
      const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
      seeds.push({ url, vouches, addedAt: num(rec.addedAt), refreshedAt: num(rec.refreshedAt) });
    }
  }
  const distrusted = Array.isArray(r.distrusted)
    ? r.distrusted.map(normalizeHumanUrl).filter((v): v is string => v !== null).slice(0, 5000)
    : [];
  return { seeds, distrusted };
}

/**
 * Hostnames that count as trusted sources for search filtering. Only whole-site
 * identities qualify: trusting `https://medium.com/@bob` must not make all of
 * medium.com trusted, so path-scoped seeds and vouches are skipped. Callers must
 * match these exactly (never subdomains). Any distrust on a host, even of a
 * single path, removes that host: when in doubt, it is not trusted.
 */
export function trustedHosts(trust: TrustState): Set<string> {
  const hostOf = (url: string, rootOnly: boolean): string | null => {
    try {
      const u = new URL(url);
      if (rootOnly && (u.pathname !== '/' || u.port !== '')) return null;
      return normalizeDomain(u.hostname);
    } catch {
      return null;
    }
  };
  const distrusted = new Set(trust.distrusted.map((d) => hostOf(d, false)).filter((h): h is string => h !== null));
  const hosts = new Set<string>();
  for (const s of trust.seeds) {
    for (const url of [s.url, ...s.vouches]) {
      const h = hostOf(url, true);
      if (h && !distrusted.has(h)) hosts.add(h);
    }
  }
  return hosts;
}

/** All URLs reachable at 0–1 hops: candidates for "Wander". */
export function wanderPool(trust: TrustState): string[] {
  const set = new Set<string>();
  for (const s of trust.seeds) {
    set.add(s.url);
    s.vouches.forEach((v) => set.add(v));
  }
  trust.distrusted.forEach((d) => set.delete(d));
  return [...set];
}
