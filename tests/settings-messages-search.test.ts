import { describe, expect, it } from 'vitest';
import { isFromThisExtension, isGetSignalsMessage, isOpenBlockedMessage } from '../src/lib/messages';
import { googleWebOnlyUrl, hostFromCite } from '../src/lib/search';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/lib/settings';

describe('settings', () => {
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
  });

  it('extracts hosts from Bing cite text', () => {
    expect(hostFromCite('https://en.wikipedia.org › wiki › Content_Credentials')).toBe('en.wikipedia.org');
    expect(hostFromCite('example.com › blog')).toBe('example.com');
    expect(hostFromCite('javascript:alert(1)')).toBeNull();
    expect(hostFromCite('')).toBeNull();
  });
});
