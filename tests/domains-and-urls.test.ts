import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchDomain, normalizeDomain, parseDomainList, sanitizeDomainInput } from '../src/lib/domains';
import { isSafePublicHttpUrl, parseSafeUrl, safeFetch, SafeFetchError } from '../src/lib/url-safety';

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

  it.each([
    'https://example.com./x',
    'http://[2606:4700:4700::1111]/',
    'https://[2a00:1450:4001:0830::200e]/',
  ])('allows public trailing-dot and global IPv6 %s', (u) => expect(isSafePublicHttpUrl(u)).toBe(true));

  it.each([
    // A final dot names the same host (audit finding #2).
    'http://localhost./',
    'http://foo.localhost./',
    'http://nas.local./',
    'http://app.internal./',
    'http://router.lan./',
    'http://printer.home.arpa./',
    'http://intranet./',
    'http://127.0.0.1./',
    'http://example.com../',
    // Other spellings of loopback that the URL parser normalizes.
    'http://2130706433/',
    'http://0x7f.1/',
    'http://017700000001/',
    // Reserved and documentation IPv4.
    'http://192.0.2.1/',
    'http://198.51.100.7/',
    'http://203.0.113.5/',
    'http://192.88.99.1/',
    'http://255.255.255.255/',
    // IPv6 outside public unicast, or embedding IPv4 (audit finding #8).
    'http://[::]/',
    'http://[0:0:0:0:0:0:0:1]/',
    'http://[::7f00:1]/',
    'http://[::127.0.0.1]/',
    'http://[::ffff:0:7f00:1]/',
    'http://[64:ff9b::a00:1]/',
    'http://[64:ff9b:1::1]/',
    'http://[100::1]/',
    'http://[2002:c0a8:101::1]/',
    'http://[2001:0:4136:e378::1]/',
    'http://[2001:db8::1]/',
    'http://[fec0::1]/',
    'http://[ff02::1]/',
  ])('rejects %s', (u) => expect(isSafePublicHttpUrl(u)).toBe(false));
});

describe('safeFetch redirects', () => {
  const fakeResponse = (init: Partial<Response>): Response =>
    ({ type: 'basic', url: '', ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: new Response('{}').body, ...init }) as Response;

  afterEach(() => vi.unstubAllGlobals());

  it('follows by default, but refuses a redirect that ended at a private address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ url: 'http://192.168.0.1/reboot' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('https://example.com/a.jpg', { maxBytes: 100 })).rejects.toThrow(SafeFetchError);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'follow', credentials: 'omit' });
  });

  it("'refuse' never follows: the browser returns an opaque redirect and safeFetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ type: 'opaqueredirect', ok: false, status: 0, body: null }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('https://example.com/human.json', { maxBytes: 100, redirects: 'refuse' })).rejects.toThrow(
      'Redirects are not followed',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it("'refuse' still reads a direct answer", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ url: 'https://example.com/human.json' })));
    const { bytes } = await safeFetch('https://example.com/human.json', { maxBytes: 100, redirects: 'refuse' });
    expect(new TextDecoder().decode(bytes)).toBe('{}');
  });

  it('never fetches an unsafe address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('http://localhost./', { maxBytes: 100 })).rejects.toThrow(SafeFetchError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
