import { describe, expect, it } from 'vitest';
import { buildRevealCss } from '../src/lib/filters';
import { cleanText, groupHidden, HIDE_KIND_INFO, HIDE_KINDS, type HiddenItem } from '../src/lib/hidden-report';
import { activeFilterRules } from '../src/lib/lists';
import { isRevealHiddenMessage } from '../src/lib/messages';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/lib/settings';
import { EMPTY_TRUST, trustedHosts } from '../src/lib/trust';

describe('cleanText — page text shown in the popup', () => {
  it('collapses whitespace and caps length', () => {
    expect(cleanText('  AI   Overview\n\n Generated  ', 80)).toBe('AI Overview Generated');
    const long = cleanText('x'.repeat(500), 10);
    expect(long).toHaveLength(10);
    expect(long.endsWith('…')).toBe(true);
  });

  it('strips control and bidi-override characters used for spoofing', () => {
    expect(cleanText('safe\u202Etxt.exe', 80)).toBe('safe txt.exe');
    expect(cleanText('a\u0000b\u0007c\u200Bd', 80)).toBe('a b c d');
  });

  it('keeps markup as inert text and handles empty input', () => {
    expect(cleanText('<img src=x onerror=alert(1)>', 80)).toBe('<img src=x onerror=alert(1)>');
    expect(cleanText(null, 80)).toBe('');
    expect(cleanText(undefined, 80)).toBe('');
  });
});

describe('groupHidden', () => {
  const item = (kind: HiddenItem['kind'], n: number): HiddenItem => ({ kind, detail: `rule ${n}`, preview: `text ${n}` });

  it('groups by reason in a fixed order with exact counts and capped items', () => {
    const items = [item('sponsored', 1), item('ai', 2), ...Array.from({ length: 12 }, (_, i) => item('sponsored', i + 3))];
    const groups = groupHidden(items, 8);
    expect(groups.map((g) => g.kind)).toEqual(['ai', 'sponsored']);
    expect(groups[1]!.count).toBe(13);
    expect(groups[1]!.items).toHaveLength(8);
    expect(groups[0]!.why).toBe(HIDE_KIND_INFO.ai.why);
  });

  it('drops unknown kinds and caps detail and preview text', () => {
    const groups = groupHidden([
      { kind: 'evil' as HiddenItem['kind'], detail: 'x', preview: 'y' },
      { kind: 'custom', detail: 'd'.repeat(1000), preview: 'p'.repeat(1000) },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items[0]!.detail.length).toBeLessThanOrEqual(120);
    expect(groups[0]!.items[0]!.preview.length).toBeLessThanOrEqual(80);
  });

  it('has plain-language copy for every kind and never calls content "AI-generated"', () => {
    for (const k of HIDE_KINDS) {
      expect(HIDE_KIND_INFO[k].title).toBeTruthy();
      expect(HIDE_KIND_INFO[k].why).toMatch(/You|your/);
      expect(HIDE_KIND_INFO[k].why).not.toMatch(/AI-generated|written by AI|made by AI/i);
    }
  });
});

describe('rule sources', () => {
  it('tags every active rule with the list it came from', () => {
    const rules = activeFilterRules({ ...DEFAULT_SETTINGS, calm: { ...DEFAULT_SETTINGS.calm, demetricate: true }, customFilters: 'example.com##.promo' });
    const sources = new Set(rules.map((r) => r.source));
    expect(sources).toEqual(new Set(['ai', 'sponsored', 'calm', 'custom']));
    expect(rules.find((r) => r.selector === '.promo')?.source).toBe('custom');
  });

  it('turning a list off removes its rules', () => {
    const rules = activeFilterRules({ ...DEFAULT_SETTINGS, declutter: { ...DEFAULT_SETTINGS.declutter, aiSurfaces: false } });
    expect(rules.some((r) => r.source === 'ai')).toBe(false);
  });

  it('reveal CSS outlines instead of hiding and still rejects breakout selectors', () => {
    const css = buildRevealCss(['.a', '.b } body { background: url(https://evil.example) } .c']);
    expect(css).toMatch(/^\.a \{ outline: 2px dashed/);
    expect(css).not.toContain('display');
    expect(css).not.toContain('evil');
  });
});

describe('trusted sources', () => {
  it('only whole-site seeds and vouches count as trusted hosts', () => {
    const trust = {
      seeds: [
        { url: 'https://alice.example', vouches: ['https://bob.example', 'https://medium.com/@carol', 'https://dave.example:8443', 'https://www.gina.example'], addedAt: 0, refreshedAt: 0 },
        { url: 'https://example.org/~erin', vouches: ['https://frank.example', 'https://hank.example'], addedAt: 0, refreshedAt: 0 },
      ],
      distrusted: ['https://frank.example', 'https://hank.example/~spam'],
    };
    // medium.com is path-scoped, dave has a port, frank is distrusted, hank has a distrusted path → all excluded.
    expect(trustedHosts(trust)).toEqual(new Set(['alice.example', 'bob.example', 'gina.example']));
    expect(trustedHosts(EMPTY_TRUST).size).toBe(0);
  });

  it('settings accept only known trusted modes', () => {
    expect(DEFAULT_SETTINGS.search.trustedMode).toBe('off');
    expect(sanitizeSettings({ search: { trustedMode: 'only' } }).search.trustedMode).toBe('only');
    expect(sanitizeSettings({ search: { trustedMode: 'everything' } }).search.trustedMode).toBe('off');
    expect(sanitizeSettings({ search: { trustedMode: 1 } }).search.trustedMode).toBe('off');
  });

  it('reveal message is validated strictly', () => {
    expect(isRevealHiddenMessage({ type: 'folkweb:reveal-hidden' })).toBe(true);
    expect(isRevealHiddenMessage({ type: 'folkweb:get-signals' })).toBe(false);
    expect(isRevealHiddenMessage('folkweb:reveal-hidden')).toBe(false);
    expect(isRevealHiddenMessage(null)).toBe(false);
  });
});
