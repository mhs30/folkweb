import { describe, expect, it } from 'vitest';
import { isFromThisExtension, isGetSignalsMessage, isOpenBlockedMessage } from '../src/lib/messages';
import { adapterFor, googleWebOnlyUrl, hostFromCite, isGoogleSearchHost } from '../src/lib/search';
import { DEFAULT_SETTINGS, sanitizeSettings, THEMES } from '../src/lib/settings';

describe('settings', () => {
  it('offers only the two supported looks and the off option', () => {
    expect(THEMES).toEqual(['none', 'newsprint', 'y2k']);
  });

  it('falls back to defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops invalid ones', () => {
    const s = sanitizeSettings({
      enabled: false,
      theme: 'y2k',
      calm: { grayscale: true, noAutoplay: 'yes' },
      userBlock: ['Spam.example', 'not a domain', 5],
      customFilters: 'a'.repeat(100_000),
    });
    expect(s.enabled).toBe(false);
    expect(s.theme).toBe('y2k');
    expect(s.calm.grayscale).toBe(true);
    expect(s.calm.noAutoplay).toBe(DEFAULT_SETTINGS.calm.noAutoplay);
    expect(s.userBlock).toEqual(['spam.example']);
    expect(s.customFilters.length).toBe(64 * 1024);
    expect(sanitizeSettings({ theme: '<script>' }).theme).toBe('none');
  });
});

describe('messages', () => {
  it('validates shapes strictly', () => {
    expect(isOpenBlockedMessage({ type: 'folkweb:open-blocked', url: 'https://a.com', matched: 'a.com' })).toBe(true);
    expect(isOpenBlockedMessage({ type: 'folkweb:open-blocked', url: 5, matched: 'a.com' })).toBe(false);
    expect(isOpenBlockedMessage({ type: 'folkweb:open-blocked', url: 'x'.repeat(5000), matched: 'a.com' })).toBe(false);
    expect(isGetSignalsMessage({ type: 'folkweb:get-signals' })).toBe(true);
    expect(isGetSignalsMessage(null)).toBe(false);
  });

  it('only trusts this extension as sender', () => {
    expect(isFromThisExtension({ id: 'abc' }, 'abc')).toBe(true);
    expect(isFromThisExtension({ id: 'other' }, 'abc')).toBe(false);
    expect(isFromThisExtension({}, 'abc')).toBe(false);
  });
});

describe('search helpers', () => {
  it('routes plain Google searches to Web results only', () => {
    expect(googleWebOnlyUrl(new URL('https://www.google.com/search?q=c2pa'))).toBe('https://www.google.com/search?q=c2pa&udm=14');
    expect(googleWebOnlyUrl(new URL('https://www.google.co.uk/search?q=c2pa'))).toContain('udm=14');
    expect(googleWebOnlyUrl(new URL('https://www.google.com/search?q=c2pa&udm=14'))).toBeNull();
    expect(googleWebOnlyUrl(new URL('https://www.google.com/search?q=cats&tbm=isch'))).toBeNull();
    expect(googleWebOnlyUrl(new URL('https://www.google.com/maps?q=x'))).toBeNull();
    expect(googleWebOnlyUrl(new URL('https://notgoogle.com/search?q=x'))).toBeNull();
    expect(googleWebOnlyUrl(new URL('https://google.evil.example/search?q=x'))).toBeNull();
  });

  it('keeps the "All" tab when you came from a Google results page', () => {
    const all = new URL('https://www.google.com/search?q=weather');
    expect(googleWebOnlyUrl(all, 'https://www.google.com/search?q=weather&udm=14')).toBeNull();
    expect(googleWebOnlyUrl(all, 'https://www.google.de/search?q=wetter')).toBeNull();
    expect(googleWebOnlyUrl(all, 'https://www.google.com/')).toContain('udm=14');
    expect(googleWebOnlyUrl(all, 'https://example.com/search?q=x')).toContain('udm=14');
    expect(googleWebOnlyUrl(all, 'not a url')).toContain('udm=14');
  });

  it('matches only Google’s own search hosts, never lookalikes (audit finding #1)', () => {
    for (const ok of ['https://www.google.com/search?q=x', 'https://google.de/search?q=x', 'https://www.google.com.au/search?q=x', 'https://www.google.co.uk./search?q=x', 'https://www.google.cat/search?q=x']) {
      expect(adapterFor(new URL(ok))?.id, ok).toBe('google');
    }
    for (const bad of [
      'https://google.evil.example/search?q=x',
      'https://www.google.evil.example/search?q=x',
      'https://google.com.evil.example/search?q=x',
      'https://google.com.de/search?q=x',
      'https://google.co.tv/search?q=x',
      'https://evil.www.google.com.attacker.net/search?q=x',
      'https://mail.google.com/search?q=x',
      'https://notgoogle.com/search?q=x',
      'https://www.google.com/webhp?q=x',
    ]) {
      expect(adapterFor(new URL(bad)), bad).toBeNull();
    }
    expect(isGoogleSearchHost('WWW.GOOGLE.COM')).toBe(true);
    expect(isGoogleSearchHost('www.www.google.com')).toBe(false);
  });

  it('extracts hosts from Bing cite text', () => {
    expect(hostFromCite('https://en.wikipedia.org › wiki › Content_Credentials')).toBe('en.wikipedia.org');
    expect(hostFromCite('example.com › blog')).toBe('example.com');
    expect(hostFromCite('javascript:alert(1)')).toBeNull();
    expect(hostFromCite('')).toBeNull();
  });
});
