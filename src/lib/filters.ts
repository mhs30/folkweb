import { LIMITS } from './constants';

/**
 * Cosmetic filter lists — a deliberately SAFE SUBSET of uBlock Origin / AdGuard syntax.
 *
 *   ##selector                     hide everywhere (generic)
 *   example.com,~shop.example.com##selector
 *   google.*##selector             any TLD of an entity
 *   example.com##selector:has-text(Sponsored)   plain-text match, no regex
 *
 * Everything that could execute code or inject arbitrary CSS is rejected:
 * scriptlets (##+js), CSS injection (#$#), procedural (#?#), JS (#%#),
 * HTML filters ($$) and exceptions (#@#). Lists are data, never code.
 */

export interface CosmeticRule {
  include: string[];
  exclude: string[];
  selector: string;
  hasText?: string;
}

export interface FilterError {
  line: number;
  text: string;
  reason: string;
}

export interface ParsedFilters {
  rules: CosmeticRule[];
  errors: FilterError[];
  ignoredNetworkRules: number;
}

const UNSUPPORTED_MARKERS: Array<[string, string]> = [
  ['##+js(', 'scriptlets are never supported'],
  ['#@#', 'exception rules are not supported'],
  ['#$#', 'CSS injection is not supported'],
  ['#?#', 'procedural filters are not supported'],
  ['#%#', 'JavaScript rules are never supported'],
  ['$$', 'HTML filters are not supported'],
  ['##^', 'HTML filters are not supported'],
];

const DOMAIN_TOKEN_RE = /^~?(?:[a-z0-9-]+\.)*[a-z0-9-]+(?:\.\*)?$/;

/** Static selector checks that do not need a DOM. The content script additionally validates with CSS.supports(). */
export function checkSelector(selector: string): string | null {
  if (!selector) return 'empty selector';
  if (selector.length > LIMITS.selectorLength) return 'selector too long';
  if (/[{};@<\\\n\r]/.test(selector)) return 'selector contains forbidden characters';
  if (selector.includes('/*')) return 'comments are not allowed in selectors';
  if (/url\s*\(|expression\s*\(|image-set\s*\(/i.test(selector)) return 'functions that can load resources are not allowed';
  let depthParen = 0;
  let depthBracket = 0;
  let quote: string | null = null;
  for (const ch of selector) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    if (depthParen < 0 || depthBracket < 0) return 'unbalanced brackets';
  }
  if (quote || depthParen || depthBracket) return 'unbalanced brackets or quotes';
  return null;
}

function splitHasText(selectorPart: string): { selector: string; hasText?: string } | { error: string } {
  const marker = ':has-text(';
  const idx = selectorPart.lastIndexOf(marker);
  if (idx < 0) return { selector: selectorPart };
  if (!selectorPart.endsWith(')')) return { error: ':has-text() must be the last part of the rule' };
  const text = selectorPart.slice(idx + marker.length, -1).trim();
  if (!text) return { error: 'empty :has-text()' };
  if (text.length > LIMITS.hasTextLength) return { error: ':has-text() text too long' };
  if (text.startsWith('/')) return { error: 'regular expressions are not supported in :has-text()' };
  if (/[()\\]/.test(text)) return { error: ':has-text() must be plain text' };
  return { selector: selectorPart.slice(0, idx).trim(), hasText: text };
}

export function parseFilterList(text: string): ParsedFilters {
  const rules: CosmeticRule[] = [];
  const errors: FilterError[] = [];
  let ignoredNetworkRules = 0;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    const err = (reason: string) => errors.push({ line: i + 1, text: line.slice(0, 160), reason });

    const unsupported = UNSUPPORTED_MARKERS.find(([m]) => line.includes(m));
    if (unsupported) {
      err(unsupported[1]);
      continue;
    }
    const sep = line.indexOf('##');
    if (sep < 0) {
      ignoredNetworkRules++;
      continue;
    }
    if (rules.length >= LIMITS.filterRules) {
      err('list exceeds the maximum number of rules');
      break;
    }

    const domainPart = line.slice(0, sep).trim().toLowerCase();
    const split = splitHasText(line.slice(sep + 2).trim());
    if ('error' in split) {
      err(split.error);
      continue;
    }
    const problem = checkSelector(split.selector);
    if (problem) {
      err(problem);
      continue;
    }

    const include: string[] = [];
    const exclude: string[] = [];
    let badDomain = false;
    if (domainPart) {
      for (const token of domainPart.split(',').map((t) => t.trim())) {
        if (!DOMAIN_TOKEN_RE.test(token)) {
          badDomain = true;
          break;
        }
        if (token.startsWith('~')) exclude.push(token.slice(1));
        else include.push(token);
      }
    }
    if (badDomain) {
      err('invalid domain in rule');
      continue;
    }
    if (split.hasText && include.length === 0) {
      err(':has-text() rules must be scoped to at least one domain');
      continue;
    }
    rules.push({ include, exclude, selector: split.selector, ...(split.hasText ? { hasText: split.hasText } : {}) });
  }
  return { rules, errors, ignoredNetworkRules };
}

/** Does `host` fall under the domain token (`example.com` or entity `google.*`)? */
export function hostMatchesToken(host: string, token: string): boolean {
  const h = host.toLowerCase();
  if (token.endsWith('.*')) {
    const entity = token.slice(0, -2) + '.';
    // Match at a label boundary: "google." at start or after a dot, followed by a TLD-ish suffix.
    let idx = h.indexOf(entity);
    while (idx >= 0) {
      if ((idx === 0 || h[idx - 1] === '.') && h.length > idx + entity.length) return true;
      idx = h.indexOf(entity, idx + 1);
    }
    return false;
  }
  return h === token || h.endsWith('.' + token);
}

export function ruleAppliesTo(rule: CosmeticRule, host: string): boolean {
  if (rule.exclude.some((t) => hostMatchesToken(host, t))) return false;
  if (rule.include.length === 0) return true;
  return rule.include.some((t) => hostMatchesToken(host, t));
}

export interface HostRules {
  /** Plain selectors to hide via a generated stylesheet. */
  selectors: string[];
  /** Selectors that hide only when their text contains `text` (case-insensitive). */
  textRules: Array<{ selector: string; text: string }>;
}

export function rulesForHost(rules: readonly CosmeticRule[], host: string): HostRules {
  const selectors = new Set<string>();
  const textRules: HostRules['textRules'] = [];
  for (const r of rules) {
    if (!ruleAppliesTo(r, host)) continue;
    if (r.hasText) textRules.push({ selector: r.selector, text: r.hasText.toLowerCase() });
    else selectors.add(r.selector);
  }
  return { selectors: [...selectors], textRules };
}

/**
 * Build the hiding stylesheet. Each selector gets its own rule so one invalid
 * selector cannot disable the others. `isValid` lets the caller plug in the
 * browser's own selector parser (CSS.supports) as a second line of defence.
 */
export function buildHidingCss(selectors: readonly string[], isValid: (s: string) => boolean = () => true): string {
  return cssForSelectors(selectors, isValid, 'display: none !important;');
}

/** Same selectors, but outlined instead of hidden: used when people ask to see what was hidden. */
export function buildRevealCss(selectors: readonly string[], isValid: (s: string) => boolean = () => true): string {
  return cssForSelectors(selectors, isValid, REVEAL_DECLARATION);
}

export const REVEAL_DECLARATION = 'outline: 2px dashed #9a7a12 !important; outline-offset: 2px !important;';

function cssForSelectors(selectors: readonly string[], isValid: (s: string) => boolean, declaration: string): string {
  return selectors
    .filter((s) => checkSelector(s) === null && isValid(s))
    .map((s) => `${s} { ${declaration} }`)
    .join('\n');
}
