import type { Settings } from './settings';

/** On/off settings shown in Settings and on the welcome page. One definition, so the two never drift. */
export interface Toggle {
  id: string;
  label: string;
  get: (s: Settings) => boolean;
  set: (s: Settings, v: boolean) => Settings;
}

export const TOGGLE_GROUPS: Array<{ title: string; items: Toggle[] }> = [
  {
    title: 'Calm',
    items: [
      { id: 'noAnimations', label: 'Still pages — stop animations and transitions', get: (s) => s.calm.noAnimations, set: (s, v) => ({ ...s, calm: { ...s.calm, noAnimations: v } }) },
      { id: 'noAutoplay', label: 'No autoplay — media waits for your click', get: (s) => s.calm.noAutoplay, set: (s, v) => ({ ...s, calm: { ...s.calm, noAutoplay: v } }) },
      { id: 'demetricate', label: 'Hide counts and attention traps (likes, views, Shorts shelves)', get: (s) => s.calm.demetricate, set: (s, v) => ({ ...s, calm: { ...s.calm, demetricate: v } }) },
      { id: 'grayscale', label: 'Grayscale everything', get: (s) => s.calm.grayscale, set: (s, v) => ({ ...s, calm: { ...s.calm, grayscale: v } }) },
    ],
  },
  {
    title: 'Declutter',
    items: [
      { id: 'aiSurfaces', label: 'Hide AI panels and AI summaries I didn’t ask for', get: (s) => s.declutter.aiSurfaces, set: (s, v) => ({ ...s, declutter: { ...s.declutter, aiSurfaces: v } }) },
      { id: 'sponsored', label: 'Hide sponsored modules', get: (s) => s.declutter.sponsored, set: (s, v) => ({ ...s, declutter: { ...s.declutter, sponsored: v } }) },
      { id: 'sponsoredHeuristic', label: 'Hide feed items labelled “Sponsored” / “Promoted”', get: (s) => s.declutter.sponsoredHeuristic, set: (s, v) => ({ ...s, declutter: { ...s.declutter, sponsoredHeuristic: v } }) },
    ],
  },
  {
    title: 'Search',
    items: [
      { id: 'googleWebOnly', label: 'Google: open plain “Web” results (no AI Overviews)', get: (s) => s.search.googleWebOnly, set: (s, v) => ({ ...s, search: { ...s.search, googleWebOnly: v } }) },
      { id: 'annotate', label: 'Mark results from sites you trust with a ★ folk badge', get: (s) => s.search.annotate, set: (s, v) => ({ ...s, search: { ...s.search, annotate: v } }) },
      { id: 'hideBlocked', label: 'Hide results from blocked domains', get: (s) => s.search.hideBlocked, set: (s, v) => ({ ...s, search: { ...s.search, hideBlocked: v } }) },
      { id: 'blockPages', label: 'Show a calm stop page before blocked domains', get: (s) => s.blockPages, set: (s, v) => ({ ...s, blockPages: v }) },
    ],
  },
];

export const ALL_TOGGLES: readonly Toggle[] = TOGGLE_GROUPS.flatMap((g) => g.items);

export function togglesById(ids: readonly string[]): Toggle[] {
  return ids.map((id) => ALL_TOGGLES.find((t) => t.id === id)).filter((t): t is Toggle => t !== undefined);
}
