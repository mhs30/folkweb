import { LIMITS } from './constants';

/**
 * Domain lists: one domain per line. Comments start with `#` or `!`.
 * Accepts a few common spellings for compatibility with existing lists:
 *   example.com, *.example.com, ||example.com^, www.example.com
 * A domain entry matches the domain itself and all of its subdomains.
 */

const LABEL = '(?!-)[a-z0-9-]{1,63}(?<!-)';
const HOSTNAME_RE = new RegExp(`^(?=.{1,253}$)${LABEL}(\\.${LABEL})+$`);

export interface DomainListError {
  line: number;
  text: string;
  reason: string;
}

export interface DomainList {
  domains: Set<string>;
  errors: DomainListError[];
}

export function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  if (d.startsWith('||')) d = d.slice(2);
  if (d.endsWith('^')) d = d.slice(0, -1);
  if (d.startsWith('*.')) d = d.slice(2);
  if (d.startsWith('www.')) d = d.slice(4);
  if (d.endsWith('.')) d = d.slice(0, -1);
  return HOSTNAME_RE.test(d) ? d : null;
}

export function parseDomainList(text: string): DomainList {
  const domains = new Set<string>();
  const errors: DomainListError[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('!')) continue;
    const entry = raw.split(/\s+#/)[0]!.trim();
    const d = normalizeDomain(entry);
    if (!d) {
      errors.push({ line: i + 1, text: raw.slice(0, 120), reason: 'not a valid domain' });
      continue;
    }
    if (domains.size >= LIMITS.domainEntries) {
      errors.push({ line: i + 1, text: raw.slice(0, 120), reason: 'list too long' });
      break;
    }
    domains.add(d);
  }
  return { domains, errors };
}

/** Returns the matching list entry (the host or one of its parent domains), or null. */
export function matchDomain(host: string, domains: ReadonlySet<string>): string | null {
  let h = host.toLowerCase();
  if (h.startsWith('www.')) h = h.slice(4);
  if (!h.includes('.')) return null; // never match a bare TLD or single-label host
  for (;;) {
    if (domains.has(h)) return h;
    const dot = h.indexOf('.');
    if (dot < 0) return null;
    h = h.slice(dot + 1);
    if (!h.includes('.')) return null; // never match a bare TLD
  }
}

/** Parse free-form user input (one per line) into normalized, de-duplicated domains. */
export function sanitizeDomainInput(lines: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    if (typeof l !== 'string') continue;
    const d = normalizeDomain(l);
    if (d) out.add(d);
    if (out.size >= LIMITS.domainEntries) break;
  }
  return [...out];
}
