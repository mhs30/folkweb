// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { removeStyle, upsertStyle } from '../src/content/dom';
import { applyLook, clearLook } from '../src/content/look';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings';

// Vitest doesn't process CSS, so `?raw` theme files are empty here: count <style> elements instead.
const ourStyles = () => [...document.querySelectorAll('style')];

afterEach(() => {
  clearLook();
  removeStyle('test');
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-folkweb-calm');
});

describe('Folkweb style elements on hostile pages (audit finding #3)', () => {
  it('ignores a page element planted with a Folkweb id', () => {
    const planted = document.createElement('div');
    planted.id = 'folkweb-calm';
    document.body.append(planted);
    upsertStyle('folkweb-calm', '.x { color: red }');
    expect(planted.textContent).toBe('');
    expect([...document.querySelectorAll('style')].map((s) => s.textContent)).toContain('.x { color: red }');
  });

  it('puts its style back when the page removes it, and removes only its own', () => {
    upsertStyle('test', '.a { color: red }');
    const style = [...document.querySelectorAll('style')].find((s) => s.textContent === '.a { color: red }')!;
    style.remove();
    upsertStyle('test', '.a { color: red }');
    expect(style.isConnected).toBe(true);

    const pageStyle = document.createElement('style');
    pageStyle.id = 'test';
    document.head.append(pageStyle);
    removeStyle('test');
    expect(style.isConnected).toBe(false);
    expect(pageStyle.isConnected).toBe(true);
  });

  it('adds nothing for calm when every calm option is off', () => {
    const off: Settings = { ...DEFAULT_SETTINGS, theme: 'none', calm: { ...DEFAULT_SETTINGS.calm, noAnimations: false, grayscale: false } };
    applyLook(off);
    expect(ourStyles()).toHaveLength(0);
    expect(document.documentElement.hasAttribute('data-folkweb-calm')).toBe(false);
  });

  it('adds the calm layer when an option is on, and takes it away again', () => {
    applyLook({ ...DEFAULT_SETTINGS, theme: 'none', calm: { ...DEFAULT_SETTINGS.calm, noAnimations: true, grayscale: false } });
    expect(ourStyles()).toHaveLength(1);
    expect(document.documentElement.getAttribute('data-folkweb-calm')).toBe('still');

    applyLook({ ...DEFAULT_SETTINGS, theme: 'none', calm: { ...DEFAULT_SETTINGS.calm, noAnimations: false, grayscale: false } });
    expect(ourStyles()).toHaveLength(0);
  });
});
