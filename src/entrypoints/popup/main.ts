import { browser } from 'wxt/browser';
import { normalizeDomain } from '../../lib/domains';
import { claimCoversPage, claimFitsSpace, parseHumanJson } from '../../lib/human-json';
import { HIDE_KIND_INFO, isHideKind } from '../../lib/hidden-report';
import { sanitizePageSignals, type GetSignalsMessage, type PageSignals, type RevealHiddenMessage } from '../../lib/messages';
import { THEME_LABELS, THEMES, TRUSTED_MODE_LABELS, TRUSTED_MODES, type Settings, type ThemeId, type TrustedMode } from '../../lib/settings';
import { loadSettings, loadTrust, saveTrust, updateSettings } from '../../lib/storage';
import { addSeed, removeSeed } from '../../lib/trust';
import { extLink, h, mount } from '../../ui/dom';
import { pickWanderUrl } from '../../ui/wander';

const app = document.getElementById('app')!;

async function getSignals(): Promise<{ tabId: number; signals: PageSignals; outdated: boolean } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const msg: GetSignalsMessage = { type: 'folkweb:get-signals' };
    // The reply is untrusted (content scripts read hostile pages) and may come from an older version.
    const result = sanitizePageSignals(await browser.tabs.sendMessage(tab.id, msg));
    return result ? { tabId: tab.id, ...result } : null;
  } catch {
    return null;
  }
}

function signal(icon: string, text: Node | string, cls = ''): HTMLLIElement {
  return h('li', { class: cls }, h('span', { class: 'fw-icon' }, icon), h('span', {}, text));
}

function trustSignals(s: PageSignals): HTMLLIElement[] {
  const out: HTMLLIElement[] = [];
  switch (s.trust.level) {
    case 'seed':
      out.push(signal('🟢', 'You trust this site (it’s one of your seeds).', 'fw-good'));
      break;
    case 'vouched':
      out.push(signal('🟢', `Vouched for by ${s.trust.by.length} site(s) you trust: ${s.trust.by.join(', ')}`, 'fw-good'));
      break;
    case 'declared':
      out.push(signal('🔵', 'Declares human authorship (human.json). Not in your circle yet.'));
      break;
    case 'distrusted':
      out.push(signal('⚪', 'You marked this site as not trusted.'));
      break;
    default:
      out.push(signal('⚪', 'No human signals found. That alone says nothing bad about it.'));
  }
  const hj = s.humanJson;
  if (hj.status === 'out-of-scope') out.push(signal('⚠️', `human.json claims a scope that doesn’t fit this page (${hj.declared}); ignored.`, 'fw-warn'));
  if (hj.status === 'invalid') out.push(signal('⚠️', `human.json could not be read: ${hj.reason}`, 'fw-warn'));
  if (hj.status === 'cross-origin') out.push(signal('ℹ️', 'human.json is hosted on another site (support coming soon).'));
  return out;
}

function hiddenPanel(tabId: number, s: PageSignals): HTMLElement | null {
  if (s.disabled || s.hiddenTotal === 0) return null;
  const groups = s.hidden
    .filter((g) => isHideKind(g.kind))
    .map((g) => {
      const info = HIDE_KIND_INFO[g.kind];
      const more = g.count - g.items.length;
      return h(
        'details',
        { class: 'fw-hidden-group' },
        h('summary', {}, `${info.icon} ${info.title} — ${g.count}`),
        h('p', { class: 'fw-muted' }, info.why),
        h(
          'ul',
          { class: 'fw-hidden-items' },
          ...g.items.map((i) => h('li', {}, h('span', {}, i.preview || '(no visible text)'), h('code', {}, i.detail))),
        ),
        more > 0 ? h('p', { class: 'fw-muted' }, `…and ${more} more.`) : null,
      );
    });
  const action = s.revealed
    ? h('p', { class: 'fw-muted' }, 'Shown on the page with a dashed outline until you reload.')
    : h('button', { title: 'Show hidden elements on this page until you reload', on: { click: () => revealHidden(tabId) } }, 'Show them on the page');
  return h(
    'section',
    { class: 'fw-panel' },
    h('h2', {}, `🧹 Hidden on this page (${s.hiddenTotal})`),
    ...groups,
    h('div', { class: 'fw-actions' }, action),
  );
}

function searchPanel(tabId: number, s: PageSignals, settings: Settings): HTMLElement | null {
  if (!s.searchEngine || s.disabled) return null;
  const select = h('select', { id: 'trusted-mode', on: { change: (e) => setTrustedMode((e.target as HTMLSelectElement).value, tabId) } });
  for (const m of TRUSTED_MODES) select.append(h('option', { value: m, selected: m === settings.search.trustedMode }, TRUSTED_MODE_LABELS[m]));
  return h(
    'section',
    { class: 'fw-panel' },
    h('div', { class: 'fw-row' }, h('label', { for: 'trusted-mode' }, 'Sources'), select),
    h('p', { class: 'fw-muted' }, 'Trusted sources are sites on your boost lists and whole sites in your trust circle.'),
  );
}

function render(tabId: number, s: PageSignals, settings: Settings, outdated: boolean): void {
  const theme = settings.theme;
  const items: HTMLLIElement[] = [...trustSignals(s)];
  if (s.curated.boost) items.push(signal('★', `On Folkweb’s boost list or yours (${s.curated.boost}).`, 'fw-good'));
  if (s.curated.block) items.push(signal('⛔', `On your block list (${s.curated.block}).`, 'fw-warn'));
  for (const f of s.feeds) items.push(signal('📰', extLink(f.href, `Has a feed — ${f.title}`)));
  if (s.aiPolicy) items.push(signal('📄', extLink(s.aiPolicy, 'Publishes an /ai policy')));

  const domain = normalizeDomain(s.host);
  const actions = h('div', { class: 'fw-actions' });

  if (s.humanJson.status === 'found' && s.trust.level !== 'seed') {
    const { doc, href } = s.humanJson;
    const scope = doc.url.replace(/^https?:\/\//, '');
    actions.append(
      h('button', { class: 'fw-primary', title: `Add ${scope} as a seed of your trust circle`, on: { click: () => trustSite(doc, href) } }, `Trust ${scope}`),
    );
  }
  if (s.trust.level === 'seed') {
    const seed = s.trust.seed;
    actions.append(h('button', { on: { click: () => untrust(seed) } }, 'Stop trusting'));
  }
  if (domain && !s.curated.boost) actions.append(h('button', { on: { click: () => addDomain('userBoost', domain) } }, '★ Boost'));
  if (domain && !s.curated.block) actions.append(h('button', { on: { click: () => addDomain('userBlock', domain) } }, '⛔ Block'));
  if (domain) {
    actions.append(
      h('button', { on: { click: () => togglePause(domain, tabId) } }, s.disabled ? 'Resume here' : 'Pause here'),
    );
  }

  const themeSelect = h('select', { id: 'theme', on: { change: (e) => setTheme((e.target as HTMLSelectElement).value) } });
  for (const t of THEMES) themeSelect.append(h('option', { value: t, selected: t === theme }, THEME_LABELS[t]));

  const update = outdated
    ? h(
        'section',
        { class: 'fw-panel fw-notice' },
        'Folkweb was updated. ',
        h('button', { on: { click: () => reloadTab(tabId) } }, 'Reload this tab'),
        ' to use the new version here.',
      )
    : null;

  mount(
    app,
    ...(update ? [update] : []),
    h('section', { class: 'fw-panel' }, h('div', { class: 'fw-host' }, s.host), h('ul', { class: 'fw-signals' }, ...items), actions),
    ...[hiddenPanel(tabId, s), searchPanel(tabId, s, settings)].filter((x): x is HTMLElement => x !== null),
    h('section', { class: 'fw-panel' }, h('div', { class: 'fw-row' }, h('label', { for: 'theme' }, 'Look'), themeSelect)),
    h(
      'section',
      { class: 'fw-actions', style: 'margin: 0 10px 6px' },
      h('button', { class: 'fw-primary', title: 'Jump to a random human-made site', on: { click: wander } }, '🎲 Wander'),
      h('button', { on: { click: () => browser.runtime.openOptionsPage() } }, 'Settings'),
    ),
  );
}

async function trustSite(doc: { version: string; url: string; vouches: Array<{ url: string; vouchedAt?: string }> }, documentUrl: string): Promise<void> {
  // Re-validate: data crossed from a content script that read it from a web page.
  const parsed = parseHumanJson({ version: doc.version, url: doc.url, vouches: doc.vouches.map((v) => ({ url: v.url, vouched_at: v.vouchedAt })) });
  const current = await getSignals();
  if (!parsed.ok || !current || !claimCoversPage(parsed.doc, current.signals.url)) return;
  if (!claimFitsSpace(parsed.doc, current.signals.url, documentUrl)) return;
  await saveTrust(addSeed(await loadTrust(), parsed.doc));
  await refresh();
}

async function untrust(url: string): Promise<void> {
  await saveTrust(removeSeed(await loadTrust(), url));
  await refresh();
}

async function addDomain(key: 'userBlock' | 'userBoost', domain: string): Promise<void> {
  await updateSettings((s) => ({ ...s, [key]: [...s[key], domain] }));
  await refresh();
}

async function togglePause(domain: string, tabId: number): Promise<void> {
  await updateSettings((s) => ({
    ...s,
    disabledSites: s.disabledSites.includes(domain) ? s.disabledSites.filter((d) => d !== domain) : [...s.disabledSites, domain],
  }));
  await browser.tabs.reload(tabId);
  window.close();
}

async function reloadTab(tabId: number): Promise<void> {
  await browser.tabs.reload(tabId);
  window.close();
}

async function revealHidden(tabId: number): Promise<void> {
  const msg: RevealHiddenMessage = { type: 'folkweb:reveal-hidden' };
  try {
    await browser.tabs.sendMessage(tabId, msg);
  } catch {
    return;
  }
  await refresh();
}

async function setTrustedMode(value: string, tabId: number): Promise<void> {
  if (!TRUSTED_MODES.includes(value as TrustedMode)) return;
  await updateSettings((s) => ({ ...s, search: { ...s.search, trustedMode: value as TrustedMode } }));
  await browser.tabs.reload(tabId);
  window.close();
}

async function setTheme(value: string): Promise<void> {
  if (!THEMES.includes(value as ThemeId)) return;
  await updateSettings((s) => ({ ...s, theme: value as ThemeId }));
}

async function wander(): Promise<void> {
  const url = await pickWanderUrl();
  if (!url) return;
  await browser.tabs.create({ url });
  window.close();
}

async function refresh(): Promise<void> {
  const [result, settings] = await Promise.all([getSignals(), loadSettings()]);
  if (!result) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    mount(
      app,
      h(
        'section',
        { class: 'fw-panel' },
        h('p', {}, 'Folkweb isn’t running on this page yet. If the page was open before you installed Folkweb, reload it. Browser pages, extension stores and files are always off-limits.'),
      ),
      h(
        'section',
        { class: 'fw-actions', style: 'margin: 0 10px 6px' },
        tabId === undefined ? null : h('button', { class: 'fw-primary', on: { click: () => void reloadTab(tabId) } }, '↻ Reload this page'),
        h('button', { on: { click: wander } }, '🎲 Wander'),
        h('button', { on: { click: () => browser.runtime.openOptionsPage() } }, 'Settings'),
      ),
    );
    return;
  }
  render(result.tabId, result.signals, settings, result.outdated);
}

refresh().catch(() => {
  mount(app, h('section', { class: 'fw-panel' }, h('p', {}, 'Folkweb couldn’t read this page. Try reloading the tab.')));
});
