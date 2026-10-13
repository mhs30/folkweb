/**
 * "What did Folkweb hide here, and why?" — the transparency report shown in
 * the popup. Pure helpers: the content script collects raw items, these turn
 * them into a small, capped, plain-text report.
 */

export const HIDE_KINDS = ['ai', 'sponsored', 'sponsored-label', 'calm', 'custom', 'blocked-result', 'untrusted-result'] as const;
export type HideKind = (typeof HIDE_KINDS)[number];

export interface HideReason {
  kind: HideKind;
  /** Which rule, label or domain caused it. Plain text. */
  detail: string;
}

export interface HiddenItem extends HideReason {
  /** A short excerpt of the hidden element's own text, so people can recognise it. */
  preview: string;
}

export interface HiddenGroup {
  kind: HideKind;
  title: string;
  why: string;
  count: number;
  items: HiddenItem[];
}

export const HIDE_KIND_INFO: Record<HideKind, { icon: string; title: string; why: string }> = {
  ai: {
    icon: '🤖',
    title: 'AI features',
    why: 'AI panels, AI summaries or AI upsells. You chose “Hide AI panels and AI summaries I didn’t ask for”.',
  },
  sponsored: {
    icon: '💸',
    title: 'Sponsored placements',
    why: 'Matched a rule in Folkweb’s sponsored list. You chose “Hide sponsored modules”.',
  },
  'sponsored-label': {
    icon: '🏷️',
    title: 'Posts labelled as ads',
    why: 'The post itself carried an ad label. You chose “Hide feed items labelled Sponsored / Promoted”.',
  },
  calm: {
    icon: '🌿',
    title: 'Counters and attention traps',
    why: 'Likes, views or endless short-video shelves. You chose “Hide counts and attention traps”.',
  },
  custom: {
    icon: '✏️',
    title: 'Your own filters',
    why: 'Matched a rule you wrote in Settings → Your own filters.',
  },
  'blocked-result': {
    icon: '⛔',
    title: 'Results from blocked sites',
    why: 'The result links to a domain on your block list or Folkweb’s.',
  },
  'untrusted-result': {
    icon: '🔎',
    title: 'Results outside your trusted sources',
    why: 'You chose to show only trusted sources in search: sites on your boost lists or in your trust circle.',
  },
};

export const REPORT_LIMITS = { previewChars: 80, detailChars: 120, itemsPerGroup: 8, scanItems: 500 } as const;

/** Collapse whitespace, drop control and bidi-override characters, and cap the length. */
export function cleanText(raw: string | null | undefined, max: number): string {
  if (!raw) return '';
  // eslint-disable-next-line no-control-regex
  const text = raw.slice(0, max * 8).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function isHideKind(x: unknown): x is HideKind {
  return typeof x === 'string' && (HIDE_KINDS as readonly string[]).includes(x);
}

/** Group items by reason in a fixed, predictable order. Counts stay exact; listed items are capped. */
export function groupHidden(items: readonly HiddenItem[], perGroup: number = REPORT_LIMITS.itemsPerGroup): HiddenGroup[] {
  const groups = new Map<HideKind, HiddenGroup>();
  for (const raw of items) {
    if (!isHideKind(raw.kind)) continue;
    let g = groups.get(raw.kind);
    if (!g) {
      g = { kind: raw.kind, title: HIDE_KIND_INFO[raw.kind].title, why: HIDE_KIND_INFO[raw.kind].why, count: 0, items: [] };
      groups.set(raw.kind, g);
    }
    g.count++;
    if (g.items.length < perGroup) {
      g.items.push({
        kind: raw.kind,
        detail: cleanText(raw.detail, REPORT_LIMITS.detailChars),
        preview: cleanText(raw.preview, REPORT_LIMITS.previewChars),
      });
    }
  }
  return HIDE_KINDS.map((k) => groups.get(k)).filter((g): g is HiddenGroup => g !== undefined);
}
