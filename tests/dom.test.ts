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
});
