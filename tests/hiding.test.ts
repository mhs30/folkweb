// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { HIDDEN_ATTR, hideElement, hideReasonOf, REVEALED_ATTR, revealElement, unhideElement } from '../src/content/dom';
import { collectHiddenItems } from '../src/content/report';
import { annotateSearch, FADE_ATTR, resetSearchState, showAll, type SearchContext } from '../src/content/search';
import { scanSponsored } from '../src/content/sponsored';
import { groupHidden } from '../src/lib/hidden-report';
import type { SearchAdapter } from '../src/lib/search';
import { h } from '../src/ui/dom';

beforeEach(() => {
  document.body.replaceChildren();
  resetSearchState();
});

describe('hide, unhide and reveal', () => {
  it('records the reason and restores the page’s own display value', () => {
    const el = h('div', { style: 'display: flex' }, 'Ask Copilot');
    document.body.append(el);
    expect(hideElement(el, { kind: 'ai', detail: '#copilot' })).toBe(true);
    expect(el.style.getPropertyValue('display')).toBe('none');
    expect(hideReasonOf(el)).toEqual({ kind: 'ai', detail: '#copilot' });
    expect(unhideElement(el)).toBe(true);
    expect(el.style.getPropertyValue('display')).toBe('flex');
    expect(el.hasAttribute(HIDDEN_ATTR)).toBe(false);
  });

  it('reveal shows the element with an outline and keeps it in the report', () => {
    const el = h('div', {}, 'Promoted thing');
    document.body.append(el);
    hideElement(el, { kind: 'sponsored', detail: '.promo' });
    expect(revealElement(el)).toBe(true);
    expect(el.hasAttribute(REVEALED_ATTR)).toBe(true);
    expect(el.style.getPropertyValue('outline')).toContain('dashed');
    expect(collectHiddenItems([])).toEqual([{ kind: 'sponsored', detail: '.promo', preview: 'Promoted thing' }]);
  });

  it('the page cannot forge a reason by setting the attribute itself', () => {
    const forged = h('div', { 'data-folkweb-hidden': '' }, 'I am fine, really');
    document.body.append(forged);
    expect(collectHiddenItems([])).toEqual([]);
  });

  it('a page-set attribute neither blocks hiding nor gets un-hidden by reveal', () => {
    const ad = h('article', { 'data-folkweb-hidden': '' }, h('span', {}, 'Sponsored'), h('p', {}, 'Buy'));
    const own = h('div', { 'data-folkweb-hidden': '', style: 'display: none' }, 'page’s own hidden menu');
    document.body.append(ad, own);
    expect(scanSponsored()).toBe(1);
    expect(ad.style.getPropertyValue('display')).toBe('none');
    expect(revealElement(own)).toBe(false);
    expect(own.style.getPropertyValue('display')).toBe('none');
  });

  it('previews keep words apart and skip script/style text', () => {
    const el = h('div', {}, h('span', {}, 'a.com'), h('span', {}, 'Title'), h('script', {}, 'var secret = 1'), h('style', {}, '.x{}'));
    document.body.append(el);
    hideElement(el, { kind: 'custom', detail: '.x' });
    expect(collectHiddenItems([])[0]?.preview).toBe('a.com Title');
  });
});

describe('collectHiddenItems', () => {
  it('lists stylesheet matches with their list and skips nested duplicates', () => {
    const panel = h('aside', { id: 'ai-panel' }, h('p', { class: 'ai-inner' }, 'AI summary'));
    const labelled = h('article', {}, h('span', {}, 'Sponsored'), h('p', {}, 'Buy now'));
    document.body.append(panel, labelled);
    scanSponsored();
    const items = collectHiddenItems([
      { selector: '#ai-panel', source: 'ai' },
      { selector: '.ai-inner', source: 'ai' },
      { selector: 'div[unclosed', source: 'custom' },
    ]);
    const groups = groupHidden(items);
    expect(groups.map((g) => [g.kind, g.count])).toEqual([
      ['ai', 1],
      ['sponsored-label', 1],
    ]);
    expect(groups[1]!.items[0]!.detail).toBe('Labelled “Sponsored”');
  });
});

describe('search: trusted sources', () => {
  const adapter: SearchAdapter = {
    id: 'test',
    matches: () => true,
    resultSelector: 'li.result',
    resultsContainerSelector: '#results',
    hostOf: (el) => el.getAttribute('data-host'),
  };
  const ctx = (over: Partial<SearchContext> = {}): SearchContext => ({
    adapter,
    block: new Set(['slop.example']),
    boost: new Set(['folk.example']),
    circle: new Set(['friend.example']),
    hideBlocked: true,
    annotate: true,
    trustedMode: 'off',
    ...over,
  });
  const page = () => {
    const results = ['folk.example', 'friend.example', 'big.example', 'slop.example'].map((host) =>
      h('li', { class: 'result', 'data-host': host }, h('h3', {}, `Result from ${host}`)),
    );
    document.body.append(h('ol', { id: 'results' }, ...results));
    return results;
  };

  it('off: hides blocked, badges boost and circle, leaves the rest alone', () => {
    const [folk, friend, big, slop] = page();
    expect(annotateSearch(ctx())).toBe(1);
    expect(slop!.hasAttribute(HIDDEN_ATTR)).toBe(true);
    expect(hideReasonOf(slop!)?.kind).toBe('blocked-result');
    const titles = [folk, friend].map((r) => r!.querySelector('[data-folkweb-badge]')?.getAttribute('title'));
    // Page scripts can read titles: the same text for both, so it doesn't reveal which sites are in the private trust circle.
    expect(titles[0]).toBeTruthy();
    expect(titles[0]).toBe(titles[1]);
    expect(big!.hasAttribute(HIDDEN_ATTR) || big!.hasAttribute(FADE_ATTR)).toBe(false);
    expect(document.querySelector('[data-folkweb-notice]')).toBeNull();
  });

  it('fade: other sources are faded, not hidden', () => {
    const [, , big] = page();
    annotateSearch(ctx({ trustedMode: 'fade' }));
    expect(big!.hasAttribute(FADE_ATTR)).toBe(true);
    expect(big!.hasAttribute(HIDDEN_ATTR)).toBe(false);
  });

  it('only: hides other sources with a reason and a notice, and "show all" brings them back', () => {
    const [folk, , big] = page();
    expect(annotateSearch(ctx({ trustedMode: 'only' }))).toBe(2);
    expect(hideReasonOf(big!)).toEqual({ kind: 'untrusted-result', detail: 'big.example' });
    expect(folk!.hasAttribute(HIDDEN_ATTR)).toBe(false);
    const notice = document.querySelector('#results > [data-folkweb-notice]');
    expect(notice?.textContent).toMatch(/1 other result hidden/);

    showAll(adapter);
    expect(big!.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(big!.hasAttribute(FADE_ATTR)).toBe(true);
    expect(notice?.textContent).toMatch(/Showing all results/);
  });

  it('trust circle hosts match exactly: subdomains are not trusted, www is the same site', () => {
    const hosts = ['spam.friend.example', 'www.friend.example'];
    const results = hosts.map((host) => h('li', { class: 'result', 'data-host': host }, h('h3', {}, host)));
    document.body.append(h('ol', { id: 'results' }, ...results));
    annotateSearch(ctx({ trustedMode: 'only' }));
    expect(hideReasonOf(results[0]!)).toEqual({ kind: 'untrusted-result', detail: 'spam.friend.example' });
    expect(results[1]!.hasAttribute(HIDDEN_ATTR)).toBe(false);
  });

  it('only: a synthetic (page-script) click on the notice does nothing', () => {
    const [, , big] = page();
    annotateSearch(ctx({ trustedMode: 'only' }));
    document.querySelector<HTMLButtonElement>('[data-folkweb-notice] button')!.click();
    expect(big!.hasAttribute(HIDDEN_ATTR)).toBe(true);
  });

  it('only: says so plainly when no result is from a trusted source', () => {
    document.body.append(h('ol', { id: 'results' }, h('li', { class: 'result', 'data-host': 'big.example' }, 'x')));
    annotateSearch(ctx({ trustedMode: 'only' }));
    expect(document.querySelector('[data-folkweb-notice]')?.textContent).toMatch(/None of these results come from sources you trust yet/);
  });
});
