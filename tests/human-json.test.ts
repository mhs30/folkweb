import { describe, expect, it } from 'vitest';
import { claimCoversPage, claimFitsSpace, isUnderScope, normalizeHumanUrl, parseHumanJson, parseHumanJsonText } from '../src/lib/human-json';
import { addSeed, EMPTY_TRUST, evaluateTrust, removeSeed, sanitizeTrust, wanderPool } from '../src/lib/trust';

const alice = {
  version: '0.1.1',
  url: 'https://alice.example.com/',
  vouches: [
    { url: 'https://example.com/~bob', vouched_at: '2026-01-15' },
    { url: 'javascript:alert(1)', vouched_at: '2026-01-15' },
    { url: 'http://192.168.0.1', vouched_at: '2026-01-15' },
    { url: 'https://alice.example.com', vouched_at: '2026-01-15' },
    'not-an-object',
  ],
};

describe('human.json parsing', () => {
  it('normalizes per spec', () => {
    expect(normalizeHumanUrl('HTTPS://Example.COM:443/~alice/')).toBe('https://example.com/~alice');
    expect(normalizeHumanUrl('http://example.com:80')).toBe('http://example.com');
    expect(normalizeHumanUrl('https://example.com:8443/x?q=1#h')).toBe('https://example.com:8443/x');
    expect(normalizeHumanUrl('ftp://example.com')).toBeNull();
  });

  it('accepts valid documents and drops unsafe or self vouches', () => {
    const r = parseHumanJson(alice);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.url).toBe('https://alice.example.com');
    expect(r.doc.vouches).toEqual([{ url: 'https://example.com/~bob', vouchedAt: '2026-01-15' }]);
  });

  it.each([
    [null, /object/],
    [[], /object/],
    [{ url: 'https://a.com' }, /version/],
    [{ version: '9.9', url: 'https://a.com' }, /version/],
    [{ version: '0.1.1', url: 'javascript:x' }, /url/],
    [{ version: '0.1.1', url: 'https://a.com', vouches: 'x' }, /array/],
  ])('rejects %j', (doc, reason) => {
    const r = parseHumanJson(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });

  it('rejects oversize and invalid JSON text', () => {
    expect(parseHumanJsonText('{').ok).toBe(false);
    expect(parseHumanJsonText(' '.repeat(300 * 1024)).ok).toBe(false);
  });

  it('scopes identity by URL prefix on path-segment boundaries', () => {
    expect(isUnderScope('https://example.com/~alice/blog/post', 'https://example.com/~alice')).toBe(true);
    expect(isUnderScope('https://example.com/~alicex', 'https://example.com/~alice')).toBe(false);
    expect(isUnderScope('https://example.com/', 'https://example.com/~alice')).toBe(false);
    expect(isUnderScope('http://example.com/~alice', 'https://example.com/~alice')).toBe(false);
  });

  it('a claim only covers pages inside its own scope (anti-impersonation)', () => {
    const r = parseHumanJson({ version: '0.1.1', url: 'https://victim.example' });
    if (!r.ok) throw new Error('expected ok');
    expect(claimCoversPage(r.doc, 'https://attacker.example/page')).toBe(false);
    expect(claimCoversPage(r.doc, 'https://victim.example/page')).toBe(true);
  });

  it('on shared hosts a ~name space can only claim itself (audit finding #9)', () => {
    const claim = (url: string) => {
      const r = parseHumanJson({ version: '0.1.1', url });
      if (!r.ok) throw new Error('expected ok');
      return r.doc;
    };
    const host = 'https://uni.example';
    // Mallory's page and file claim the whole host: refused.
    expect(claimFitsSpace(claim(host), `${host}/~mallory/`, `${host}/~mallory/human.json`)).toBe(false);
    // Same claim with the file outside the space but read on Mallory's page: refused.
    expect(claimFitsSpace(claim(host), `${host}/~mallory/post`, `${host}/human.json`)).toBe(false);
    // Encoded tilde is still a tilde space, also with a malformed escape after it.
    expect(claimFitsSpace(claim(host), `${host}/%7Emallory/`, `${host}/%7Emallory/human.json`)).toBe(false);
    expect(claimFitsSpace(claim(host), `${host}/~mallory%ZZ/`, `${host}/human.json`)).toBe(false);
    expect(claimFitsSpace(claim(host), `${host}/%7Emallory%E0/`, `${host}/human.json`)).toBe(false);
    // Another person's space: refused.
    expect(claimFitsSpace(claim(`${host}/~alice`), `${host}/~mallory/`, `${host}/~mallory/human.json`)).toBe(false);
    // Alice claims her own space, or a part of it: fine.
    expect(claimFitsSpace(claim(`${host}/~alice`), `${host}/~alice/blog`, `${host}/~alice/human.json`)).toBe(true);
    expect(claimFitsSpace(claim(`${host}/~alice/blog`), `${host}/~alice/blog/post`, `${host}/~alice/human.json`)).toBe(true);
    // Ordinary sites may keep the file anywhere (the spec allows it) and claim the whole site.
    expect(claimFitsSpace(claim('https://example.com'), 'https://example.com/post', 'https://example.com/assets/human.json')).toBe(true);
    // A bare "~" is not a person's space.
    expect(claimFitsSpace(claim('https://example.com'), 'https://example.com/~/x', 'https://example.com/human.json')).toBe(true);
    // Empty or "." segments reach the same folder on most servers (pre-launch audit N1).
    expect(claimFitsSpace(claim(host), `${host}//~mallory/`, `${host}//~mallory/human.json`)).toBe(false);
    expect(claimFitsSpace(claim(host), `${host}/`, `${host}//~mallory/human.json`)).toBe(false); // page faked with history.replaceState
    expect(claimFitsSpace(claim(host), `${host}/./~mallory/`, `${host}/.//~mallory/human.json`)).toBe(false);
    expect(claimFitsSpace(claim(host), `${host}///%7Emallory/x`, `${host}/human.json`)).toBe(false);
  });
});

describe('trust graph', () => {
  const doc = (() => {
    const r = parseHumanJson(alice);
    if (!r.ok) throw new Error('fixture');
    return r.doc;
  })();

  it('evaluates seed, vouched, declared, unknown and distrusted levels', () => {
    const trust = addSeed(EMPTY_TRUST, doc, 1);
    expect(evaluateTrust('https://alice.example.com/now', trust, null)).toEqual({ level: 'seed', seed: 'https://alice.example.com' });
    expect(evaluateTrust('https://example.com/~bob/post', trust, null)).toEqual({ level: 'vouched', by: ['https://alice.example.com'] });
    expect(evaluateTrust('https://example.com/~carol', trust, null)).toEqual({ level: 'unknown' });
    expect(evaluateTrust('https://example.com/~carol', trust, doc).level).toBe('declared');
    const distrusted = { ...trust, distrusted: ['https://example.com/~bob'] };
    expect(evaluateTrust('https://example.com/~bob', distrusted, null)).toEqual({ level: 'distrusted' });
  });

  it('add/remove seeds and builds a wander pool without distrusted sites', () => {
    let t = addSeed(EMPTY_TRUST, doc, 1);
    t = addSeed(t, doc, 2);
    expect(t.seeds).toHaveLength(1);
    expect(wanderPool({ ...t, distrusted: ['https://example.com/~bob'] })).toEqual(['https://alice.example.com']);
    expect(removeSeed(t, doc.url).seeds).toHaveLength(0);
  });

  it('sanitizes tampered storage', () => {
    const t = sanitizeTrust({ seeds: [{ url: 'javascript:1', vouches: [] }, { url: 'https://ok.example', vouches: ['https://v.example', 7], addedAt: 'x' }], distrusted: 'nope' });
    expect(t).toEqual({ seeds: [{ url: 'https://ok.example', vouches: ['https://v.example'], addedAt: 0, refreshedAt: 0 }], distrusted: [] });
    expect(sanitizeTrust(null)).toEqual(EMPTY_TRUST);
  });
});
