import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/lib/settings';

const dir = join(__dirname, '..', 'src', 'themes');
const read = (name: string) => readFileSync(join(dir, name), 'utf8');
const base = read('base.css');
const used = [...new Set([...base.matchAll(/var\((--fw-t-[a-z-]+)\)/g)].map((m) => m[1]!))];

/** Split a selector list on top-level commas only (commas inside :is()/:not() don't count). */
function topLevelParts(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  return [...parts, current];
}

describe('page themes', () => {
  it('the base uses a known palette', () => {
    expect(used.length).toBeGreaterThan(10);
  });

  it.each(THEMES.filter((t) => t !== 'none'))('%s defines every palette property the base uses', (theme) => {
    const css = read(`${theme}.css`);
    const missing = used.filter((v) => !new RegExp(`${v}\\s*:`).test(css));
    expect(missing).toEqual([]);
  });

  it.each(['base.css', ...THEMES.filter((t) => t !== 'none').map((t) => `${t}.css`)])('%s is scoped, static and loads nothing', (file) => {
    const css = read(file);
    expect(css).not.toMatch(/url\s*\(|@import|@font-face|@keyframes|animation\s*:/i);
    // Every rule is scoped under html[data-folkweb-theme...].
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|})\s*([^{}]+)\{/g) ?? [];
    for (const s of selectors) {
      const sel = s.replace(/^}?\s*/, '').replace(/\{$/, '').trim();
      for (const part of topLevelParts(sel)) expect(part.trim().startsWith('html[data-folkweb-theme'), part.trim()).toBe(true);
    }
  });
});
