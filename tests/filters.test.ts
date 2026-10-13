import { describe, expect, it } from 'vitest';
import { buildHidingCss, checkSelector, hostMatchesToken, parseFilterList, rulesForHost } from '../src/lib/filters';

describe('parseFilterList', () => {
  it('parses scoped, generic, excluded and entity rules', () => {
    const { rules, errors } = parseFilterList(
      ['! comment', '[Adblock Plus 2.0]', 'example.com##.ad', '##.generic', 'a.com,~b.a.com##div[data-x="1"]', 'google.*##a[href*="udm=50"]'].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(4);
    expect(rules[2]).toEqual({ include: ['a.com'], exclude: ['b.a.com'], selector: 'div[data-x="1"]' });
  });

  it('supports plain-text :has-text() only when scoped to a domain', () => {
    const ok = parseFilterList('x.com##article:has-text(Promoted)');
    expect(ok.rules[0]).toMatchObject({ selector: 'article', hasText: 'Promoted' });
    expect(parseFilterList('##article:has-text(Promoted)').errors[0]?.reason).toMatch(/scoped/);
    expect(parseFilterList('x.com##div:has-text(/regex/)').errors[0]?.reason).toMatch(/regular expressions/);
  });

  it.each([
    ['example.com##+js(set-constant, x, 1)', /scriptlets/],
    ['example.com#$#body { background: red }', /CSS injection/],
    ['example.com#?#div:-abp-has(.x)', /procedural/],
    ['example.com#%#alert(1)', /JavaScript/],
    ['example.com#@#.ad', /exception/],
    ['example.com$$script', /HTML filters/],
  ])('rejects unsafe rule %s', (line, reason) => {
    const { rules, errors } = parseFilterList(line);
    expect(rules).toHaveLength(0);
    expect(errors[0]?.reason).toMatch(reason);
  });

  it('ignores network rules without failing', () => {
    const r = parseFilterList('||ads.example.com^\n@@||ok.com^');
    expect(r.rules).toHaveLength(0);
    expect(r.ignoredNetworkRules).toBe(2);
  });

  it('rejects invalid domains', () => {
    expect(parseFilterList('exa mple.com##.x').errors[0]?.reason).toMatch(/invalid domain/);
  });
});

describe('checkSelector — CSS breakout protection', () => {
  it.each([
    '.a } body { background: url(https://evil.example/leak) } .b',
    '.a{}',
    '.a; color: red',
    '@import url(x)',
    'div[style*="url(https://x)"]',
    '.a /* comment */',
    '.a\\7d',
    'div<script>',
    '.a\nbody',
    'div[unclosed',
    'div:not(.a',
    "div[a='x]",
  ])('rejects %s', (sel) => {
    expect(checkSelector(sel)).not.toBeNull();
  });

  it.each(['.ad', '#tads', 'div[data-testid="x"]', 'section li:has([data-testid="a"])', 'a[href*="udm=50"]', 'ytd-ad-slot-renderer'])(
    'accepts %s',
    (sel) => expect(checkSelector(sel)).toBeNull(),
  );

  it('enforces max length', () => {
    expect(checkSelector('.a'.repeat(400))).toMatch(/too long/);
  });

  it('buildHidingCss emits one rule per valid selector only', () => {
    const css = buildHidingCss(['.a', '.b } body {', '#c'], (s) => s !== '#c');
    expect(css).toBe('.a { display: none !important; }');
  });
});

describe('host matching', () => {
  it('matches domains and subdomains but not lookalikes', () => {
    expect(hostMatchesToken('www.example.com', 'example.com')).toBe(true);
    expect(hostMatchesToken('example.com', 'example.com')).toBe(true);
    expect(hostMatchesToken('notexample.com', 'example.com')).toBe(false);
  });

  it('matches entity tokens on any TLD at a label boundary', () => {
    expect(hostMatchesToken('www.google.co.uk', 'google.*')).toBe(true);
    expect(hostMatchesToken('google.com', 'google.*')).toBe(true);
    expect(hostMatchesToken('notgoogle.com', 'google.*')).toBe(false);
    expect(hostMatchesToken('google.', 'google.*')).toBe(false);
  });

  it('entity tokens never match lookalike hosts (pre-launch audit N5)', () => {
    for (const ok of ['google.de', 'google.cat', 'www.google.com.au', 'google.co.jp', 'amazon.co.uk', 'amazon.com.mx', 'google.xn--p1ai']) {
      expect(hostMatchesToken(ok, ok.includes('amazon') ? 'amazon.*' : 'google.*'), ok).toBe(true);
    }
    for (const bad of ['google.evil.example', 'www.google.evil.example', 'google.com.evil.example', 'google.co.uk.attacker.net', 'google.evil-site.com']) {
      expect(hostMatchesToken(bad, 'google.*'), bad).toBe(false);
    }
  });

  it('rulesForHost applies include/exclude and splits text rules', () => {
    const { rules } = parseFilterList('a.com,~shop.a.com##.x\n##.generic\na.com##div:has-text(Ad)');
    expect(rulesForHost(rules, 'www.a.com')).toEqual({ selectors: ['.x', '.generic'], textRules: [{ selector: 'div', text: 'ad' }] });
    expect(rulesForHost(rules, 'shop.a.com').selectors).toEqual(['.generic']);
  });
});
