import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDomainList } from '../src/lib/domains';
import { parseFilterList } from '../src/lib/filters';

/**
 * List lint: enforces the curation policy in docs/LIST-FORMAT.md for every
 * bundled list. Run alone with `npm run lint:lists`.
 */

const LIST_DIR = join(__dirname, '..', 'lists');
const files = readdirSync(LIST_DIR).filter((f) => f.endsWith('.txt'));
const filterFiles = ['ai-surfaces.txt', 'sponsored.txt', 'calm.txt'];
const domainFiles = files.filter((f) => !filterFiles.includes(f));

describe('bundled lists', () => {
  it('has the expected files', () => {
    expect(files.sort()).toEqual(['ai-surfaces.txt', 'block-domains.txt', 'calm.txt', 'folk-boost.txt', 'sponsored.txt']);
  });

  describe.each(filterFiles)('%s', (file) => {
    const text = readFileSync(join(LIST_DIR, file), 'utf8');
    const parsed = parseFilterList(text);

    it('parses without errors', () => {
      expect(parsed.errors).toEqual([]);
      expect(parsed.ignoredNetworkRules).toBe(0);
    });

    it('has a title header', () => {
      expect(text).toMatch(/^! Title: Folkweb — /m);
    });

    it('scopes every rule to at least one site (no generic rules in bundled lists)', () => {
      expect(parsed.rules.filter((r) => r.include.length === 0)).toEqual([]);
    });

    it('marks every rule as verified (with date) or unverified', () => {
      const lines = text.split('\n');
      let marker: string | null = null;
      for (const line of lines) {
        if (/^! (verified: \d{4}-\d{2}-\d{2}|unverified)/.test(line)) marker = line;
        else if (/^!? *$/.test(line) || line.startsWith('! ---')) marker = null;
        else if (!line.startsWith('!') && line.includes('##')) {
          expect(marker, `rule without verification marker: ${line}`).not.toBeNull();
        }
      }
    });
  });

  describe.each(domainFiles)('%s', (file) => {
    const text = readFileSync(join(LIST_DIR, file), 'utf8');
    it('parses without errors and has a header', () => {
      expect(parseDomainList(text).errors).toEqual([]);
      expect(text).toMatch(/^# Title: Folkweb — /m);
    });
  });

  it('boosts no platform whose subdomains belong to other people (curation policy)', () => {
    // An entry covers every subdomain, so these would put ★ on anyone's site or on replays of any site.
    const PLATFORMS = [
      'neocities.org', 'github.io', 'gitlab.io', 'codeberg.page', 'pages.dev', 'netlify.app', 'vercel.app',
      'wordpress.com', 'blogspot.com', 'tumblr.com', 'substack.com', 'medium.com', 'bearblog.dev',
      'micro.blog', 'mataroa.blog', 'write.as', 'carrd.co', 'glitch.me', 'archive.org', 'archive.today', 'archive.ph',
    ];
    const boost = parseDomainList(readFileSync(join(LIST_DIR, 'folk-boost.txt'), 'utf8')).domains;
    for (const platform of PLATFORMS) {
      expect([...boost].filter((d) => d === platform || platform.endsWith(`.${d}`)), platform).toEqual([]);
    }
  });
});
