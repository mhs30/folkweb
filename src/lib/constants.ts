export const APP_NAME = 'Folkweb';

export const LIMITS = {
  /** Max bytes accepted for a human.json document (spec suggests 1 MB; we are stricter). */
  humanJsonBytes: 256 * 1024,
  /** Max vouches read from one human.json document. */
  humanJsonVouches: 1000,
  /** Max bytes fetched for a C2PA media check. */
  mediaBytes: 50 * 1024 * 1024,
  /** Network timeout for any extension-initiated fetch. */
  fetchTimeoutMs: 15_000,
  /** Max rules accepted from a single filter list. */
  filterRules: 20_000,
  /** Max length of a single CSS selector in a filter rule. */
  selectorLength: 512,
  /** Max length of a :has-text() needle. */
  hasTextLength: 80,
  /** Max entries in a domain list. */
  domainEntries: 50_000,
  /** How long a "continue anyway" exception lasts on the blocked page. */
  allowOnceMs: 10 * 60 * 1000,
} as const;

/** Public project links shown in the UI. */
export const PROJECT_LINKS = {
  site: 'https://folkweb.org/',
  privacy: 'https://folkweb.org/privacy/',
  curationPolicy: 'https://folkweb.org/curation/',
  aiPolicy: 'https://folkweb.org/ai/',
  humanJson: 'https://codeberg.org/robida/human.json',
  contentCredentials: 'https://contentcredentials.org',
  source: 'https://github.com/mhs30/folkweb',
  reportFilter: 'https://github.com/mhs30/folkweb/issues/new?template=broken-filter.yml',
} as const;
