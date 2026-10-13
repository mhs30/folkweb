import { describe, expect, it } from 'vitest';
import { matchDomain, normalizeDomain, parseDomainList, sanitizeDomainInput } from '../src/lib/domains';
import { isSafePublicHttpUrl, parseSafeUrl } from '../src/lib/url-safety';

describe('domains', () => {
  it('normalizes common spellings', () => {
    expect(normalizeDomain('||Ads.Example.com^')).toBe('ads.example.com');
    expect(normalizeDomain('*.example.com')).toBe('example.com');
    expect(normalizeDomain('www.example.com.')).toBe('example.com');
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('exa mple.com')).toBeNull();
    expect(normalizeDomain('-bad.com')).toBeNull();
    expect(normalizeDomain('https://example.com')).toBeNull();
  });

  it('parses lists with comments and reports bad lines', () => {
    const { domains, errors } = parseDomainList('# header\nexample.com   # trailing note\n! also comment\nnot a domain\nfoo.org');
    expect([...domains]).toEqual(['example.com', 'foo.org']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(4);
  });

  it('matches subdomains but never a bare TLD or lookalike', () => {
    const set = new Set(['example.com', 'co.uk']);
    expect(matchDomain('a.b.example.com', set)).toBe('example.com');
    expect(matchDomain('www.example.com', set)).toBe('example.com');
    expect(matchDomain('badexample.com', set)).toBeNull();
    expect(matchDomain('com', new Set(['com']))).toBeNull();
  });

  it('sanitizes untrusted input arrays', () => {
    expect(sanitizeDomainInput(['A.com', 'a.com', 42, null, 'bad domain'])).toEqual(['a.com']);
  });
});

describe('url safety', () => {
  it.each([
    'https://example.com/x',
    'http://example.org',
    'https://8.8.8.8/',
  ])('allows public %s', (u) => expect(isSafePublicHttpUrl(u)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd',
    'chrome://settings',
    'https://user:pass@example.com',
    'http://localhost:8080',
    'http://127.0.0.1',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.20.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://printer.local',
    'http://intranet',
    'http://router.lan',
    'http://app.internal',
  ])('rejects %s', (u) => expect(isSafePublicHttpUrl(u)).toBe(false));

  it('parseSafeUrl resolves relative URLs against a base and rejects junk', () => {
    expect(parseSafeUrl('/human.json', 'https://example.com/blog/')?.href).toBe('https://example.com/human.json');
    expect(parseSafeUrl(42)).toBeNull();
    expect(parseSafeUrl('x'.repeat(5000))).toBeNull();
  });
});
