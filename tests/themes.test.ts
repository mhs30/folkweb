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

function rgb(hex: string): [number, number, number] {
  const value = hex.slice(1);
  const full = value.length === 3 ? [...value].map((c) => `${c}${c}`).join('') : value;
  const number = Number.parseInt(full, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function luminance(hex: string): number {
  return rgb(hex)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

describe('page themes', () => {
  it('the base uses a known palette', () => {
    expect(used.length).toBeGreaterThan(10);
  });

  it('does not reset site component surfaces or layout properties', () => {
    expect(base).not.toMatch(/background-color:\s*transparent\s*!important/i);
    expect(base).not.toMatch(/box-shadow:\s*none\s*!important/i);
    expect(base).not.toMatch(/\b(?:position|display|float|overflow|transform|margin|padding|width|height|flex|grid)\s*:/i);
  });

  it.each(THEMES.filter((t) => t !== 'none'))('%s defines every palette property the base uses', (theme) => {
    const css = read(`${theme}.css`);
    const missing = used.filter((v) => !new RegExp(`${v}\\s*:`).test(css));
    expect(missing).toEqual([]);
  });

  it.each(THEMES.filter((t) => t !== 'none'))('%s keeps palette text above WCAG AA contrast', (theme) => {
    const css = read(`${theme}.css`);
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector]) => selector?.includes(`html[data-folkweb-theme="${theme}"]`))
      .map(([, , declarations]) => declarations ?? '');
    const palettes = blocks.filter((declarations) => declarations.includes('--fw-t-ink:'));
    expect(palettes.length).toBeGreaterThanOrEqual(2);

    for (const declarations of palettes) {
      const value = (name: string) => declarations.match(new RegExp(`${name}:\\s*([^;]+)`))?.[1]?.trim();
      const foregrounds = ['--fw-t-ink', '--fw-t-heading-ink', '--fw-t-muted', '--fw-t-link', '--fw-t-visited']
        .map(value)
        .filter((color): color is string => !!color);
      const backgrounds = ['--fw-t-page', '--fw-t-bg', '--fw-t-surface']
        .flatMap((name) => (value(name)?.match(/#[\da-f]{3,6}\b/gi) ?? []));
      for (const foreground of foregrounds) {
        for (const background of backgrounds) {
          expect(contrast(foreground, background), `${theme}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(['base.css', ...THEMES.filter((t) => t !== 'none').map((t) => `${t}.css`)])('%s is scoped, static and loads nothing', (file) => {
    const css = read(file).replace(/@media[^{]+\{/g, '');
    expect(css).not.toMatch(/url\s*\(|@import|@font-face|@keyframes|animation\s*:/i);
    // Every rule is scoped under html[data-folkweb-theme...].
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|})\s*([^{}]+)\{/g) ?? [];
    for (const s of selectors) {
      const sel = s.replace(/^}?\s*/, '').replace(/\{$/, '').trim();
      for (const part of topLevelParts(sel)) expect(part.trim().startsWith('html[data-folkweb-theme'), part.trim()).toBe(true);
    }
  });
});
