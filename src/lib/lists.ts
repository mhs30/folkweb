import aiSurfaces from '../../lists/ai-surfaces.txt?raw';
import blockDomains from '../../lists/block-domains.txt?raw';
import calm from '../../lists/calm.txt?raw';
import folkBoost from '../../lists/folk-boost.txt?raw';
import sponsored from '../../lists/sponsored.txt?raw';
import { parseDomainList } from './domains';
import { parseFilterList, type CosmeticRule } from './filters';
import type { Settings } from './settings';

/** Lists bundled at build time. Remote subscriptions arrive in a later milestone (signed lists). */

export const BUNDLED_FILTERS = {
  aiSurfaces: parseFilterList(aiSurfaces).rules,
  sponsored: parseFilterList(sponsored).rules,
  calm: parseFilterList(calm).rules,
};

export const BUNDLED_BLOCK = parseDomainList(blockDomains).domains;
export const BUNDLED_BOOST = parseDomainList(folkBoost).domains;

/** Which list a rule came from, so the popup can say why something was hidden. */
export type RuleSource = 'ai' | 'sponsored' | 'calm' | 'custom';
export type SourcedRule = CosmeticRule & { source: RuleSource };

const tag = (rules: readonly CosmeticRule[], source: RuleSource): SourcedRule[] => rules.map((r) => ({ ...r, source }));

export function activeFilterRules(settings: Settings): SourcedRule[] {
  const rules: SourcedRule[] = [];
  if (settings.declutter.aiSurfaces) rules.push(...tag(BUNDLED_FILTERS.aiSurfaces, 'ai'));
  if (settings.declutter.sponsored) rules.push(...tag(BUNDLED_FILTERS.sponsored, 'sponsored'));
  if (settings.calm.demetricate) rules.push(...tag(BUNDLED_FILTERS.calm, 'calm'));
  if (settings.customFilters) rules.push(...tag(parseFilterList(settings.customFilters).rules, 'custom'));
  return rules;
}

export function blockSet(settings: Settings): Set<string> {
  return new Set([...BUNDLED_BLOCK, ...settings.userBlock]);
}

export function boostSet(settings: Settings): Set<string> {
  const s = new Set([...BUNDLED_BOOST, ...settings.userBoost]);
  settings.userBlock.forEach((d) => s.delete(d));
  return s;
}
