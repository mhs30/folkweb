import { browser } from 'wxt/browser';
import { applyCosmetics, selectorSources } from '../content/cosmetics';
import { HIDDEN_ATTR, observeMutations, revealElement } from '../content/dom';
import { discoverAiPolicy, discoverFeeds, discoverHumanJson } from '../content/human';
import { applyLook, clearLook, installAutoplayGuard } from '../content/look';
import { collectHiddenItems } from '../content/report';
import { annotateSearch, removeTrustedNotice } from '../content/search';
import { scanSponsored } from '../content/sponsored';
import { matchDomain } from '../lib/domains';
import { ruleAppliesTo } from '../lib/filters';
import { groupHidden } from '../lib/hidden-report';
import { activeFilterRules, blockSet, boostSet } from '../lib/lists';
import {
  isFromThisExtension,
  isGetSignalsMessage,
  isRevealHiddenMessage,
  type HumanJsonStatus,
  type OpenBlockedMessage,
  type PageSignals,
} from '../lib/messages';
import { adapterFor, googleWebOnlyUrl } from '../lib/search';
import type { Settings } from '../lib/settings';
import { isAllowedOnce, loadSettings, loadTrust, onSettingsChanged, onTrustChanged } from '../lib/storage';
import { evaluateTrust, trustedHosts } from '../lib/trust';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_start',
  allFrames: false,
  async main() {
    const url = new URL(location.href);
    const host = url.hostname.toLowerCase();
    let [settings, trust] = await Promise.all([loadSettings(), loadTrust()]);
    let stopObserving: (() => void) | null = null;
    let humanJson: Promise<HumanJsonStatus> | null = null;

    const isDisabledHere = (s: Settings) => !s.enabled || matchDomain(host, new Set(s.disabledSites)) !== null;

    // 1. Calm routing that must happen before the page renders.
    if (!isDisabledHere(settings) && settings.search.googleWebOnly) {
      const next = googleWebOnlyUrl(url, document.referrer);
      if (next) {
        location.replace(next);
        return;
      }
    }

    // 2. Blocked domains → calm interstitial (top frame only).
    const blockedBy = matchDomain(host, blockSet(settings));
    if (!isDisabledHere(settings) && settings.blockPages && blockedBy && !(await isAllowedOnce(host))) {
      const msg: OpenBlockedMessage = { type: 'folkweb:open-blocked', url: location.href, matched: blockedBy };
      // Stop the page only once the stop page is on its way; if the background can't
      // answer, the site loads normally rather than being left half-loaded.
      const opened = await browser.runtime.sendMessage(msg).catch(() => false);
      if (opened === true) {
        window.stop();
        return;
      }
    }

    // Set when the person asks the popup to show what was hidden; lasts until reload.
    let revealed = false;
    const adapter = adapterFor(url);
    const hostRules = () => activeFilterRules(settings).filter((r) => ruleAppliesTo(r, host));

    const start = () => {
      stopObserving?.();
      stopObserving = null;
      if (isDisabledHere(settings)) {
        clearLook();
        return;
      }
      applyLook(settings);
      const rescanText = applyCosmetics(hostRules(), revealed);
      if (revealed) return;
      const block = blockSet(settings);
      const boost = boostSet(settings);
      // The trust circle is private; only use it on search pages when the person turned the feature on.
      const circle = settings.search.trustedMode === 'off' ? new Set<string>() : trustedHosts(trust);

      stopObserving = observeMutations(() => {
        rescanText();
        if (settings.declutter.sponsoredHeuristic) scanSponsored();
        if (adapter) {
          annotateSearch({
            adapter,
            block,
            boost,
            circle,
            hideBlocked: settings.search.hideBlocked,
            annotate: settings.search.annotate,
            trustedMode: settings.search.trustedMode,
          });
        }
      });
    };

    installAutoplayGuard(() => !isDisabledHere(settings) && settings.calm.noAutoplay);
    start();
    onSettingsChanged((next) => {
      settings = next;
      start();
    });
    onTrustChanged((next) => {
      trust = next;
      start();
    });

    const reveal = () => {
      revealed = true;
      start();
      for (const el of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) revealElement(el);
      removeTrustedNotice();
    };

    const signals = async (): Promise<PageSignals> => {
      if (document.readyState === 'loading') {
        await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
      }
      humanJson ??= discoverHumanJson();
      const hj = await humanJson;
      const groups = groupHidden(collectHiddenItems(selectorSources(hostRules())));
      return {
        url: location.href,
        host,
        disabled: isDisabledHere(settings),
        humanJson: hj,
        trust: evaluateTrust(location.href, trust, hj.status === 'found' ? hj.doc : null),
        curated: { boost: matchDomain(host, boostSet(settings)), block: matchDomain(host, blockSet(settings)) },
        feeds: discoverFeeds(),
        aiPolicy: discoverAiPolicy(),
        hidden: groups,
        hiddenTotal: groups.reduce((n, g) => n + g.count, 0),
        revealed,
        searchEngine: adapter?.id ?? null,
      };
    };

    browser.runtime.onMessage.addListener((msg, sender) => {
      if (!isFromThisExtension(sender, browser.runtime.id)) return undefined;
      if (isGetSignalsMessage(msg)) return signals();
      if (isRevealHiddenMessage(msg)) {
        reveal();
        return Promise.resolve(true);
      }
      return undefined;
    });
  },
});
