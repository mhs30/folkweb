import { sanitizeDomainInput } from './domains';

export const THEMES = ['none', 'newsprint', 'y2k'] as const;
export type ThemeId = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  none: 'Off — site’s own look',
  newsprint: 'Calm reading (warm paper)',
  y2k: '2000s Web 2.0 (glossy)',
};

/** How search treats results that are not from a trusted source (boost lists + trust circle). */
export const TRUSTED_MODES = ['off', 'fade', 'only'] as const;
export type TrustedMode = (typeof TRUSTED_MODES)[number];

export const TRUSTED_MODE_LABELS: Record<TrustedMode, string> = {
  off: 'Show all results',
  fade: 'Fade results from other sources',
  only: 'Show only trusted sources',
};

export interface Settings {
  enabled: boolean;
  theme: ThemeId;
  calm: { noAnimations: boolean; noAutoplay: boolean; demetricate: boolean; grayscale: boolean };
  declutter: { aiSurfaces: boolean; sponsored: boolean; sponsoredHeuristic: boolean };
  search: { googleWebOnly: boolean; annotate: boolean; hideBlocked: boolean; trustedMode: TrustedMode };
  blockPages: boolean;
  disabledSites: string[];
  userBlock: string[];
  userBoost: string[];
  /** User-authored cosmetic rules, same safe syntax as bundled lists. */
  customFilters: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  theme: 'none',
  calm: { noAnimations: true, noAutoplay: true, demetricate: false, grayscale: false },
  declutter: { aiSurfaces: true, sponsored: true, sponsoredHeuristic: true },
  search: { googleWebOnly: false, annotate: true, hideBlocked: true, trustedMode: 'off' },
  blockPages: true,
  disabledSites: [],
  userBlock: [],
  userBoost: [],
  customFilters: '',
};

const MAX_CUSTOM_FILTERS = 64 * 1024;

function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Storage is treated as untrusted input: always validate before use. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const calm = obj(r.calm);
  const dec = obj(r.declutter);
  const search = obj(r.search);
  return {
    enabled: bool(r.enabled, d.enabled),
    theme: THEMES.includes(r.theme as ThemeId) ? (r.theme as ThemeId) : d.theme,
    calm: {
      noAnimations: bool(calm.noAnimations, d.calm.noAnimations),
      noAutoplay: bool(calm.noAutoplay, d.calm.noAutoplay),
      demetricate: bool(calm.demetricate, d.calm.demetricate),
      grayscale: bool(calm.grayscale, d.calm.grayscale),
    },
    declutter: {
      aiSurfaces: bool(dec.aiSurfaces, d.declutter.aiSurfaces),
      sponsored: bool(dec.sponsored, d.declutter.sponsored),
      sponsoredHeuristic: bool(dec.sponsoredHeuristic, d.declutter.sponsoredHeuristic),
    },
    search: {
      googleWebOnly: bool(search.googleWebOnly, d.search.googleWebOnly),
      annotate: bool(search.annotate, d.search.annotate),
      hideBlocked: bool(search.hideBlocked, d.search.hideBlocked),
      trustedMode: TRUSTED_MODES.includes(search.trustedMode as TrustedMode) ? (search.trustedMode as TrustedMode) : d.search.trustedMode,
    },
    blockPages: bool(r.blockPages, d.blockPages),
    disabledSites: Array.isArray(r.disabledSites) ? sanitizeDomainInput(r.disabledSites) : [],
    userBlock: Array.isArray(r.userBlock) ? sanitizeDomainInput(r.userBlock) : [],
    userBoost: Array.isArray(r.userBoost) ? sanitizeDomainInput(r.userBoost) : [],
    customFilters: typeof r.customFilters === 'string' ? r.customFilters.slice(0, MAX_CUSTOM_FILTERS) : '',
  };
}
