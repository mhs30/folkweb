import { describe, expect, it } from 'vitest';
import { shouldOpenWelcome } from '../src/lib/onboarding';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/lib/settings';
import { ALL_TOGGLES, togglesById } from '../src/lib/settings-toggles';

describe('welcome page', () => {
  it('opens on a fresh install only', () => {
    expect(shouldOpenWelcome({ reason: 'install' })).toBe(true);
    for (const reason of ['update', 'chrome_update', 'browser_update', 'shared_module_update', undefined, 5]) {
      expect(shouldOpenWelcome({ reason })).toBe(false);
    }
  });
});

describe('settings toggles', () => {
  it('have unique ids', () => {
    const ids = ALL_TOGGLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ALL_TOGGLES.map((t) => [t.id, t] as const))('%s flips exactly one setting and survives sanitizing', (_id, t) => {
    const before = DEFAULT_SETTINGS;
    const after = sanitizeSettings(t.set(before, !t.get(before)));
    expect(t.get(after)).toBe(!t.get(before));
    for (const other of ALL_TOGGLES) if (other !== t) expect(other.get(after)).toBe(other.get(before));
    expect({ ...after, calm: before.calm, declutter: before.declutter, search: before.search, blockPages: before.blockPages }).toEqual(before);
  });

  it('togglesById keeps order and skips unknown ids', () => {
    expect(togglesById(['noAutoplay', 'nope', 'aiSurfaces']).map((t) => t.id)).toEqual(['noAutoplay', 'aiSurfaces']);
  });
});
