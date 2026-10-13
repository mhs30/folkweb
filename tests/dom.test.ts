// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { HIDDEN_ATTR } from '../src/content/dom';
import { isSponsoredLabel, scanSponsored } from '../src/content/sponsored';
import { h } from '../src/ui/dom';

describe('h() safe DOM builder', () => {
  it('renders strings as text, never markup', () => {
    const el = h('p', {}, '<img src=x onerror=alert(1)>');
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('refuses inline event handler attributes', () => {
    expect(() => h('div', { onclick: 'alert(1)' })).toThrow(/not allowed/);
  });

  it('drops dangerous URL schemes in href/src', () => {
    expect(h('a', { href: 'javascript:alert(1)' }).hasAttribute('href')).toBe(false);
    expect(h('a', { href: 'https://example.com' }).getAttribute('href')).toBe('https://example.com');
  });
});

describe('sponsored heuristic', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('recognises short labels only', () => {
    expect(isSponsoredLabel(' Sponsored ')).toBe(true);
    expect(isSponsoredLabel('Patrocinado')).toBe(true);
    expect(isSponsoredLabel('· Promoted')).toBe(true);
    expect(isSponsoredLabel('This post is sponsored by nobody')).toBe(false);
    expect(isSponsoredLabel('Admin')).toBe(false);
  });

  it('hides labelled feed items and leaves others alone', () => {
    const ad = h('article', {}, h('span', {}, 'Sponsored'), h('p', {}, 'Buy things'));
    const post = h('article', {}, h('p', {}, 'A post about sponsored content and ads'));
    const aria = h('div', { role: 'article' }, h('span', { 'aria-label': 'Promoted' }));
    document.body.append(ad, post, aria);
    expect(scanSponsored()).toBe(2);
    expect(ad.hasAttribute(HIDDEN_ATTR)).toBe(true);
    expect(aria.hasAttribute(HIDDEN_ATTR)).toBe(true);
    expect(post.hasAttribute(HIDDEN_ATTR)).toBe(false);
  });

  it('skips page-sized containers', () => {
    const big = h('article', {}, h('span', {}, 'Ad'), h('p', {}, 'x'.repeat(7000)));
    document.body.append(big);
    expect(scanSponsored()).toBe(0);
  });

  describe('other people can’t hide your posts (audit finding #6)', () => {
    it('a comment that just says "Sponsored" hides at most that comment, never the post', () => {
      const comment = h('div', { role: 'article' }, h('span', {}, 'Mallory'), h('span', {}, 'Sponsored'));
      const post = h('div', { 'data-pagelet': 'FeedUnit_1' }, h('span', {}, 'Alice'), h('p', {}, 'My holiday photos'), comment);
      document.body.append(post);
      scanSponsored();
      expect(post.hasAttribute(HIDDEN_ATTR)).toBe(false);
    });

    it('a quoted post labelled "Ad" doesn’t hide the post that quotes it', () => {
      const quoted = h('article', {}, h('span', { 'aria-label': 'Ad' }), h('p', {}, 'Buy now'));
      const post = h('article', {}, h('span', {}, 'Bob'), h('p', {}, 'Look at this ad, ha'), quoted);
      document.body.append(post);
      scanSponsored();
      expect(post.hasAttribute(HIDDEN_ATTR)).toBe(false);
      expect(quoted.hasAttribute(HIDDEN_ATTR)).toBe(true);
    });

    it('a label far below the header (a reply in a thread) doesn’t count', () => {
      const lines = Array.from({ length: 30 }, (_, i) => h('p', {}, `Reply ${i}`));
      const post = h('article', {}, h('span', {}, 'Carol'), ...lines, h('p', {}, 'Ad'));
      document.body.append(post);
      expect(scanSponsored()).toBe(0);
    });

    it('a real header label on a post still hides it (X: cell > article)', () => {
      const tweet = h('article', {}, h('span', {}, 'Brand'), h('span', {}, '@brand'), h('span', {}, 'Ad'), h('p', {}, 'Buy'));
      const cell = h('div', { 'data-testid': 'cellInnerDiv' }, tweet);
      document.body.append(cell);
      expect(scanSponsored()).toBe(1);
      expect(tweet.hasAttribute(HIDDEN_ATTR)).toBe(true);
    });

    it('"Annonce" (French for listing as well as ad) is not a label', () => {
      const listing = h('article', {}, h('span', {}, 'Annonce'), h('p', {}, 'Vélo, 120 €'));
      document.body.append(listing);
      expect(scanSponsored()).toBe(0);
      expect(isSponsoredLabel('Sponsorisé')).toBe(true);
    });
  });
});
