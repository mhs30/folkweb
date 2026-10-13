import { describe, expect, it } from 'vitest';
import { parseHumanJsonText } from '../src/lib/human-json';
import { buildHumanJson, exportLists, keepSafeFilterLines, mergeLists, mergeSummary, parseListFile } from '../src/lib/list-transfer';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../src/lib/settings';

const mine: Settings = {
  ...DEFAULT_SETTINGS,
  userBoost: ['indieweb.org', 'jvns.ca'],
  userBlock: ['spam.example'],
  disabledSites: ['bank.example'],
  customFilters: 'example.com##.newsletter',
};

describe('list files: export and import round trip', () => {
  it('exports a versioned file that imports back unchanged', () => {
    const file = exportLists(mine, new Date('2026-10-12T10:00:00Z'));
    expect(JSON.parse(file)).toMatchObject({ format: 'folkweb-lists', version: 1, exportedAt: '2026-10-12T10:00:00.000Z' });
    const r = parseListFile(file);
    expect(r).toEqual({ ok: true, dropped: 0, lists: { boost: ['indieweb.org', 'jvns.ca'], block: ['spam.example'], paused: ['bank.example'], filters: 'example.com##.newsletter' } });
  });

  it('merges without removing anything and reports only what is new', () => {
    const incoming = { boost: ['jvns.ca', 'ooh.directory'], block: [], paused: [], filters: 'example.com##.newsletter\nnews.example##.promo' };
    expect(mergeSummary(mine, incoming)).toEqual({ boost: 1, block: 0, paused: 0, filters: 1 });
    const merged = sanitizeSettings(mergeLists(mine, incoming));
    expect(merged.userBoost).toEqual(['indieweb.org', 'jvns.ca', 'ooh.directory']);
    expect(merged.userBlock).toEqual(['spam.example']);
    expect(merged.customFilters).toBe('example.com##.newsletter\nnews.example##.promo');
  });
});

describe('list files are untrusted', () => {
  it.each([
    ['not JSON', 'boost: everything'],
    ['an array', '[]'],
    ['another format', JSON.stringify({ format: 'ublock', version: 1 })],
    ['a missing version', JSON.stringify({ format: 'folkweb-lists' })],
    ['a newer version', JSON.stringify({ format: 'folkweb-lists', version: 99 })],
    ['an oversized file', JSON.stringify({ format: 'folkweb-lists', version: 1, filters: 'x'.repeat(1_100_000) })],
  ])('rejects %s', (_name, text) => {
    expect(parseListFile(text).ok).toBe(false);
  });

  it('drops invalid domains and wrong types, and ignores prototype pollution', () => {
    const text = '{"format":"folkweb-lists","version":1,"boost":["Good.Example","javascript:alert(1)","not a domain",5],"block":"spam.example","__proto__":{"polluted":true}}';
    const r = parseListFile(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lists.boost).toEqual(['good.example']);
    expect(r.lists.block).toEqual([]);
    expect(r.dropped).toBe(4);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps only safe filter rules (no scriptlets, CSS injection or breakout)', () => {
    const { text, dropped } = keepSafeFilterLines(
      [
        '! my rules',
        'example.com##.ad',
        'example.com##+js(set-constant, x, 1)',
        'example.com#$#body { background: url(https://evil.example/leak) }',
        'example.com##.a } body { background: red } .b',
        '||tracker.example^',
        'x.com##article:has-text(Promoted)',
      ].join('\n'),
    );
    expect(text).toBe('! my rules\nexample.com##.ad\nx.com##article:has-text(Promoted)');
    expect(dropped).toBe(4);
  });
});

describe('human.json for your own site', () => {
  it('vouches for boosted sites and is valid for Folkweb itself', () => {
    const draft = buildHumanJson('example.com/', ['jvns.ca', 'example.com', 'blog.example.com', 'not a domain'], new Date('2026-10-12T00:00:00Z'));
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const parsed = parseHumanJsonText(draft.json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.url).toBe('https://example.com');
    expect(parsed.doc.vouches).toEqual([
      { url: 'https://jvns.ca', vouchedAt: '2026-10-12' },
      { url: 'https://blog.example.com', vouchedAt: '2026-10-12' },
    ]);
  });

  it.each(['', 'javascript:alert(1)', 'http://localhost:3000', 'http://192.168.1.10', 'not a site'])('refuses %s as a website', (url) => {
    expect(buildHumanJson(url, ['jvns.ca']).ok).toBe(false);
  });
});
