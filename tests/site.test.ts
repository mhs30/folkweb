// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "handleDisabledFileLoadingAsSuccess": true, "disableCSSFileLoading": true } }
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimCoversPage, parseHumanJsonText } from '../src/lib/human-json';

/**
 * folkweb.org (site/) is served as-is by Cloudflare Pages. These checks keep it
 * script-free, self-contained and consistent with the policies it states.
 */

const SITE = join(__dirname, '..', 'site');
const ORIGIN = 'https://folkweb.org';

function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

const htmlFiles = files(SITE, '.html');
const parse = (file: string) => new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html');

/** Map a site path like /privacy/ or /style.css to the file Pages would serve. */
function fileFor(pathname: string): string | null {
  const p = decodeURIComponent(pathname);
  const candidates = p.endsWith('/') ? [join(SITE, p, 'index.html')] : [join(SITE, p), join(SITE, p, 'index.html')];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

describe('site pages', () => {
  it('has the expected pages', () => {
    const pages = htmlFiles.map((f) => relative(SITE, f)).sort();
    expect(pages).toEqual(['404.html', 'ai/index.html', 'curation/index.html', 'index.html', 'news/index.html', 'privacy/index.html', 'security/index.html', 'support/index.html']);
  });

  it.each(htmlFiles.map((f) => [relative(SITE, f), f]))('%s is script-free and self-contained', (_name, file) => {
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toMatch(/<script\b/i);
    expect(raw).not.toMatch(/<style\b/i);
    expect(raw).not.toMatch(/\sstyle\s*=/i);
    expect(raw).not.toMatch(/\son[a-z]+\s*=/i);
    expect(raw).not.toMatch(/<(iframe|object|embed|form)\b/i);
    expect(raw).not.toMatch(/javascript:/i);

    const doc = parse(file);
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.title.length).toBeGreaterThan(3);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('/style.css');
    expect(doc.querySelector('link[rel="human-json"]')?.getAttribute('href')).toBe('/human.json');
    expect(doc.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.getAttribute('href')).toBe('/feed.xml');
    // Folkweb's own /ai discovery looks for a same-site link to /ai.
    expect([...doc.querySelectorAll('a[href]')].some((a) => /^\/ai\/?$/.test(a.getAttribute('href') ?? ''))).toBe(true);

    // Resources (stylesheets, icons, images) only from this site.
    for (const el of doc.querySelectorAll('link[href], img[src]')) {
      const ref = el.getAttribute('href') ?? el.getAttribute('src') ?? '';
      if (el.getAttribute('rel') === 'canonical') {
        expect(ref.startsWith(`${ORIGIN}/`)).toBe(true);
        continue;
      }
      expect(ref.startsWith('/') && !ref.startsWith('//')).toBe(true);
    }
  });

  it('every internal link points to a real file and fragment; external links use https', () => {
    const problems: string[] = [];
    for (const file of htmlFiles) {
      for (const a of parse(file).querySelectorAll('a[href]')) {
        const href = a.getAttribute('href')!;
        if (href.startsWith('mailto:')) {
          if (!/^mailto:(security|conduct|hello)@folkweb\.org$/.test(href)) problems.push(`${relative(SITE, file)}: unexpected ${href}`);
          continue;
        }
        if (href.startsWith('#')) continue;
        const url = new URL(href, `${ORIGIN}/`);
        if (url.origin !== ORIGIN) {
          if (url.protocol !== 'https:') problems.push(`${relative(SITE, file)}: insecure link ${href}`);
          continue;
        }
        const target = fileFor(url.pathname);
        if (!target) {
          problems.push(`${relative(SITE, file)}: broken link ${href}`);
          continue;
        }
        if (url.hash && target.endsWith('.html') && !parse(target).getElementById(url.hash.slice(1))) {
          problems.push(`${relative(SITE, file)}: missing anchor ${href}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('CSS loads nothing from anywhere', () => {
    const css = readFileSync(join(SITE, 'style.css'), 'utf8');
    expect(css).not.toMatch(/url\s*\(|@import|@font-face/i);
  });

  it('donation links on /support match .github/FUNDING.yml and use only the three platforms', () => {
    const funding = Object.fromEntries(
      readFileSync(join(SITE, '..', '.github', 'FUNDING.yml'), 'utf8')
        .split('\n')
        .map((l) => /^(\w+):\s*(\S+)\s*$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2]]),
    );
    expect(Object.keys(funding).sort()).toEqual(['github', 'ko_fi', 'liberapay']);
    const expected = [
      `https://github.com/sponsors/${funding.github}`,
      `https://ko-fi.com/${funding.ko_fi}`,
      `https://liberapay.com/${funding.liberapay}/`,
    ];
    const donate = parse(join(SITE, 'support', 'index.html')).getElementById('donate');
    const links = [...(donate?.querySelectorAll('a[href]') ?? [])].map((a) => a.getAttribute('href'));
    expect(links).toEqual(expected);
  });
});

describe('site data files', () => {
  it('human.json is valid for Folkweb and covers every page', () => {
    const parsed = parseHumanJsonText(readFileSync(join(SITE, 'human.json'), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.url).toBe(ORIGIN);
    for (const file of htmlFiles) {
      const path = `/${relative(SITE, file)}`.replace(/index\.html$/, '');
      expect(claimCoversPage(parsed.doc, `${ORIGIN}${path}`)).toBe(true);
    }
  });

  it('feed.xml is well-formed RSS', () => {
    const xml = new DOMParser().parseFromString(readFileSync(join(SITE, 'feed.xml'), 'utf8'), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelector('channel > title')?.textContent).toBeTruthy();
    const items = xml.querySelectorAll('item');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      for (const tag of ['title', 'link', 'guid', 'pubDate', 'description']) expect(item.querySelector(tag)?.textContent, tag).toBeTruthy();
      expect(Number.isNaN(Date.parse(item.querySelector('pubDate')!.textContent!))).toBe(false);
    }
  });

  it('security.txt follows RFC 9116', () => {
    const txt = readFileSync(join(SITE, '.well-known', 'security.txt'), 'utf8');
    expect(txt).toMatch(/^Contact: mailto:security@folkweb\.org$/m);
    expect(txt).toMatch(/^Canonical: https:\/\/folkweb\.org\/\.well-known\/security\.txt$/m);
    const expires = /^Expires: (.+)$/m.exec(txt)?.[1];
    expect(expires && !Number.isNaN(Date.parse(expires))).toBe(true);
  });

  it('headers lock the site down', () => {
    const headers = readFileSync(join(SITE, '_headers'), 'utf8');
    const csp = /^\s+Content-Security-Policy: (.+)$/m.exec(headers)?.[1] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/unsafe|https?:|\*/);
    expect(headers).toMatch(/Strict-Transport-Security: max-age=\d{8}/);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');
  });

  it('robots.txt keeps the site open to search but asks AI training crawlers to stay out', () => {
    const robots = readFileSync(join(SITE, 'robots.txt'), 'utf8');
    expect(robots).toMatch(/User-agent: GPTBot[\s\S]*?Disallow: \//);
    expect(robots).toMatch(/User-agent: \*\nAllow: \//);
  });
});
