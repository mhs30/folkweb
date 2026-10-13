import { describe, expect, it } from 'vitest';
import { sanitizePageSignals } from '../src/lib/messages';

const current = {
  url: 'https://example.com/post',
  host: 'example.com',
  disabled: false,
  humanJson: { status: 'none' },
  trust: { level: 'unknown' },
  curated: { boost: null, block: null },
  feeds: [{ title: 'Blog', href: 'https://example.com/feed.xml' }],
  aiPolicy: 'https://example.com/ai',
  hidden: [{ kind: 'ai', title: 'x', why: 'x', count: 2, items: [{ kind: 'ai', detail: '#panel', preview: 'AI summary' }] }],
  hiddenTotal: 2,
  revealed: false,
  searchEngine: null,
};

describe('sanitizePageSignals — content script replies are untrusted', () => {
  it('accepts a current reply and keeps exact counts', () => {
    const r = sanitizePageSignals(current)!;
    expect(r.outdated).toBe(false);
    expect(r.signals.hiddenTotal).toBe(2);
    expect(r.signals.hidden[0]).toMatchObject({ kind: 'ai', count: 2, items: [{ detail: '#panel', preview: 'AI summary' }] });
    expect(r.signals.feeds).toEqual([{ title: 'Blog', href: 'https://example.com/feed.xml' }]);
  });

  it('handles a reply from an older content script (the "reading filter of undefined" crash)', () => {
    // What the content script sent before the hidden-report feature existed.
    const old = {
      url: current.url,
      host: current.host,
      disabled: false,
      humanJson: current.humanJson,
      trust: current.trust,
      curated: current.curated,
      feeds: current.feeds,
      aiPolicy: current.aiPolicy,
      hiddenCount: 3,
    };
    const r = sanitizePageSignals(old)!;
    expect(r.outdated).toBe(true);
    expect(r.signals.hidden).toEqual([]);
    expect(r.signals.hiddenTotal).toBe(0);
    expect(r.signals.revealed).toBe(false);
    expect(r.signals.searchEngine).toBeNull();
  });

  it('rejects unusable replies', () => {
    expect(sanitizePageSignals(undefined)).toBeNull();
    expect(sanitizePageSignals('signals')).toBeNull();
    expect(sanitizePageSignals({ ...current, url: 'javascript:alert(1)' })).toBeNull();
    expect(sanitizePageSignals({ ...current, url: 'https://user:pw@example.com/' })).toBeNull();
    expect(sanitizePageSignals({ ...current, host: 5 })).toBeNull();
  });

  it('allows local pages but never local or script links', () => {
    const r = sanitizePageSignals({
      ...current,
      url: 'http://localhost:3000/',
      feeds: [
        { title: 'x', href: 'javascript:alert(1)' },
        { title: 'y', href: 'http://192.168.1.1/feed' },
        { title: 'z', href: 'https://ok.example/feed' },
      ],
      aiPolicy: 'data:text/html,hi',
    })!;
    expect(r.signals.url).toBe('http://localhost:3000/');
    expect(r.signals.feeds.map((f) => f.href)).toEqual(['https://ok.example/feed']);
    expect(r.signals.aiPolicy).toBeNull();
  });

  it('drops unknown kinds, caps text and bounds counts', () => {
    const r = sanitizePageSignals({
      ...current,
      hidden: [
        { kind: 'evil', count: 5, items: [] },
        { kind: 'custom', count: 1e12, items: [{ detail: 'd'.repeat(1500), preview: 'p\u202E'.repeat(500) }] },
        { kind: 'sponsored', count: -4, items: 'nope' },
      ],
    })!;
    expect(r.signals.hidden.map((g) => g.kind)).toEqual(['custom']);
    expect(r.signals.hidden[0]!.count).toBe(100_000);
    expect(r.signals.hidden[0]!.items[0]!.detail.length).toBeLessThanOrEqual(120);
    expect(r.signals.hidden[0]!.items[0]!.preview).not.toContain('\u202E');
  });

  it('validates trust levels and human.json status', () => {
    const r = sanitizePageSignals({
      ...current,
      trust: { level: 'seed', seed: 'javascript:alert(1)' },
      humanJson: { status: 'found', href: 'https://example.com/human.json', doc: { version: '0.1', url: 'not a url', vouches: [] } },
    })!;
    expect(r.signals.trust).toEqual({ level: 'unknown' });
    expect(r.signals.humanJson).toEqual({ status: 'none' });

    const ok = sanitizePageSignals({
      ...current,
      trust: { level: 'vouched', by: ['https://alice.example', 42] },
      humanJson: {
        status: 'found',
        href: 'https://example.com/human.json',
        doc: { version: '0.1', url: 'https://example.com', vouches: [{ url: 'https://bob.example', vouchedAt: '2026-01-01' }, { url: 'ftp://x' }] },
      },
    })!;
    expect(ok.signals.trust).toEqual({ level: 'vouched', by: ['https://alice.example'] });
    expect(ok.signals.humanJson).toMatchObject({ status: 'found', doc: { url: 'https://example.com', vouches: [{ url: 'https://bob.example', vouchedAt: '2026-01-01' }] } });
  });
});
