import { sanitizeDomainInput } from './domains';
import { parseFilterList } from './filters';
import { normalizeHumanUrl } from './human-json';
import type { Settings } from './settings';

/**
 * Sharing and backing up personal lists. A list file is untrusted input: someone
 * else made it. Everything is re-validated with the same rules as the Settings page.
 */

export const LIST_FILE_FORMAT = 'folkweb-lists';
export const LIST_FILE_VERSION = 1;
export const MAX_LIST_FILE_BYTES = 1_000_000;
const MAX_FILTER_TEXT = 64 * 1024;

export interface PortableLists {
  boost: string[];
  block: string[];
  paused: string[];
  filters: string;
}

export type ImportResult = { ok: true; lists: PortableLists; dropped: number } | { ok: false; reason: string };

export function exportLists(s: Settings, now = new Date()): string {
  return `${JSON.stringify(
    {
      format: LIST_FILE_FORMAT,
      version: LIST_FILE_VERSION,
      exportedAt: now.toISOString(),
      boost: s.userBoost,
      block: s.userBlock,
      paused: s.disabledSites,
      filters: s.customFilters,
    },
    null,
    2,
  )}\n`;
}

/** Keep only filter lines that parse cleanly as safe rules (plus comments). */
export function keepSafeFilterLines(text: string): { text: string; dropped: number } {
  const kept: string[] = [];
  let dropped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('!')) {
      kept.push(line.slice(0, 200));
      continue;
    }
    const parsed = parseFilterList(line);
    if (parsed.errors.length === 0 && parsed.rules.length === 1) kept.push(line);
    else dropped++;
  }
  let out = kept.join('\n');
  if (out.length > MAX_FILTER_TEXT) {
    out = out.slice(0, out.lastIndexOf('\n', MAX_FILTER_TEXT));
    dropped++;
  }
  return { text: out, dropped };
}

function domains(raw: unknown): { list: string[]; dropped: number } {
  if (raw === undefined) return { list: [], dropped: 0 };
  if (!Array.isArray(raw)) return { list: [], dropped: 1 };
  const list = sanitizeDomainInput(raw.slice(0, 50_000));
  return { list, dropped: Math.max(0, raw.length - list.length) };
}

export function parseListFile(text: string): ImportResult {
  if (text.length > MAX_LIST_FILE_BYTES) return { ok: false, reason: 'The file is too large (over 1 MB).' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'This isn’t a Folkweb list file (it isn’t valid JSON).' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, reason: 'This isn’t a Folkweb list file.' };
  const d = data as Record<string, unknown>;
  if (d.format !== LIST_FILE_FORMAT) return { ok: false, reason: 'This isn’t a Folkweb list file.' };
  if (typeof d.version !== 'number' || !Number.isInteger(d.version) || d.version < 1) return { ok: false, reason: 'Unknown list file version.' };
  if (d.version > LIST_FILE_VERSION) return { ok: false, reason: 'This file was made by a newer Folkweb. Update Folkweb, then try again.' };

  const boost = domains(d.boost);
  const block = domains(d.block);
  const paused = domains(d.paused);
  const filters = typeof d.filters === 'string' ? keepSafeFilterLines(d.filters.slice(0, MAX_LIST_FILE_BYTES)) : { text: '', dropped: d.filters === undefined ? 0 : 1 };
  return {
    ok: true,
    lists: { boost: boost.list, block: block.list, paused: paused.list, filters: filters.text },
    dropped: boost.dropped + block.dropped + paused.dropped + filters.dropped,
  };
}

const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

/** Add imported lists to the current ones. Nothing is removed. */
export function mergeLists(s: Settings, l: PortableLists): Settings {
  const existing = new Set(s.customFilters.split(/\r?\n/).map((x) => x.trim()));
  const newFilters = l.filters.split('\n').filter((x) => x && !existing.has(x));
  const filters = [s.customFilters.trimEnd(), ...newFilters].filter(Boolean).join('\n');
  return {
    ...s,
    userBoost: union(s.userBoost, l.boost),
    userBlock: union(s.userBlock, l.block),
    disabledSites: union(s.disabledSites, l.paused),
    customFilters: filters.length <= MAX_FILTER_TEXT ? filters : s.customFilters,
  };
}

export function mergeSummary(s: Settings, l: PortableLists): { boost: number; block: number; paused: number; filters: number } {
  const count = (a: readonly string[], b: readonly string[]) => b.filter((x) => !a.includes(x)).length;
  const existing = new Set(s.customFilters.split(/\r?\n/).map((x) => x.trim()));
  return {
    boost: count(s.userBoost, l.boost),
    block: count(s.userBlock, l.block),
    paused: count(s.disabledSites, l.paused),
    filters: l.filters.split('\n').filter((x) => x && !x.startsWith('!') && !existing.has(x)).length,
  };
}

export type HumanJsonDraft = { ok: true; json: string; vouches: number } | { ok: false; reason: string };

/**
 * Build a human.json for the person's own website, vouching for the sites they boosted.
 * Vouching is a public statement, so the caller shows the result before it's published.
 */
export function buildHumanJson(siteUrl: string, boosted: readonly string[], today = new Date()): HumanJsonDraft {
  const input = siteUrl.trim();
  const url = normalizeHumanUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!url) return { ok: false, reason: 'Enter your public website address, for example https://example.com' };
  const date = today.toISOString().slice(0, 10);
  const own = new URL(url).hostname;
  const vouches = sanitizeDomainInput([...boosted])
    .filter((d) => d !== own && !own.endsWith(`.${d}`))
    .slice(0, 1000)
    .map((d) => ({ url: `https://${d}`, vouched_at: date }));
  return { ok: true, json: `${JSON.stringify({ version: '0.1.1', url, vouches }, null, 2)}\n`, vouches: vouches.length };
}
