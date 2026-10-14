import { browser } from 'wxt/browser';
import { parseDomainList } from '../../lib/domains';
import { parseFilterList } from '../../lib/filters';
import { buildHumanJson, exportLists, mergeLists, mergeSummary, parseListFile, MAX_LIST_FILE_BYTES } from '../../lib/list-transfer';
import { THEME_LABELS, THEMES, TRUSTED_MODE_LABELS, TRUSTED_MODES, type Settings, type ThemeId, type TrustedMode } from '../../lib/settings';
import { TOGGLE_GROUPS } from '../../lib/settings-toggles';
import { loadSettings, loadTrust, saveSettings, saveTrust } from '../../lib/storage';
import { removeSeed } from '../../lib/trust';
import { extLink, h, mount } from '../../ui/dom';
import { downloadText } from '../../ui/download';

const app = document.getElementById('app')!;

let settings: Settings;

async function save(next: Settings): Promise<void> {
  settings = next;
  await saveSettings(next);
  status('Saved.');
}

function status(text: string): void {
  const el = document.getElementById('fw-status');
  if (el) el.textContent = text;
}

function togglePanel(group: (typeof TOGGLE_GROUPS)[number]): HTMLElement {
  return h(
    'section',
    { class: 'fw-panel' },
    h('h2', {}, group.title),
    ...group.items.map((t, i) => {
      const id = `${group.title}-${i}`;
      return h(
        'div',
        { class: 'fw-row' },
        h('input', {
          type: 'checkbox',
          id,
          checked: t.get(settings),
          on: { change: (e) => void save(t.set(settings, (e.target as HTMLInputElement).checked)) },
        }),
        h('label', { for: id }, t.label),
      );
    }),
  );
}

function listEditor(title: string, help: string, key: 'userBlock' | 'userBoost' | 'disabledSites'): HTMLElement {
  const area = h('textarea', { spellcheck: 'false', 'aria-label': title });
  area.value = settings[key].join('\n');
  const errors = h('ul', { class: 'fw-errors' });
  const button = h('button', {
    on: {
      click: () => {
        const parsed = parseDomainList(area.value);
        errors.replaceChildren(...parsed.errors.slice(0, 10).map((e) => h('li', {}, `Line ${e.line}: “${e.text}” — ${e.reason}`)));
        void save({ ...settings, [key]: [...parsed.domains] });
        area.value = [...parsed.domains].join('\n');
      },
    },
  }, 'Save list');
  return h('section', { class: 'fw-panel' }, h('h2', {}, title), h('p', { class: 'fw-muted' }, help), area, errors, h('div', { class: 'fw-actions' }, button));
}

function filtersEditor(): HTMLElement {
  const area = h('textarea', { spellcheck: 'false', 'aria-label': 'Custom filters' });
  area.value = settings.customFilters;
  const errors = h('ul', { class: 'fw-errors' });
  const button = h('button', {
    on: {
      click: () => {
        const parsed = parseFilterList(area.value);
        errors.replaceChildren(...parsed.errors.slice(0, 10).map((e) => h('li', {}, `Line ${e.line}: ${e.reason}`)));
        void save({ ...settings, customFilters: area.value });
      },
    },
  }, 'Save filters');
  return h(
    'section',
    { class: 'fw-panel' },
    h('h2', {}, 'Your own filters'),
    h('p', { class: 'fw-muted' }, 'uBlock-style cosmetic rules, e.g. example.com##.newsletter-popup or example.com##div.card:has-text(Sponsored). Scriptlets and CSS injection are never supported.'),
    area,
    errors,
    h('div', { class: 'fw-actions' }, button),
  );
}

async function seedsPanel(): Promise<HTMLElement> {
  const trust = await loadTrust();
  const rows = trust.seeds.map((seed) =>
    h(
      'div',
      { class: 'fw-seed' },
      h('span', {}, `${seed.url} — vouches for ${seed.vouches.length}`),
      h('button', {
        on: {
          click: async () => {
            await saveTrust(removeSeed(await loadTrust(), seed.url));
            await render();
          },
        },
      }, 'Remove'),
    ),
  );
  return h(
    'section',
    { class: 'fw-panel' },
    h('h2', {}, 'Your trust circle (human.json seeds)'),
    h('p', { class: 'fw-muted' }, 'Sites you trust personally. Sites they vouch for are marked as human-vouched. Add seeds from the toolbar popup on a site that publishes a human.json. ', extLink('https://codeberg.org/robida/human.json', 'About human.json')),
    ...(rows.length ? rows : [h('p', { class: 'fw-muted' }, 'No seeds yet.')]),
  );
}

function sharePanel(): HTMLElement {
  const today = new Date().toISOString().slice(0, 10);
  const preview = h('div', { role: 'status' });

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Choose a Folkweb list file', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_LIST_FILE_BYTES) {
      preview.replaceChildren(h('p', { class: 'fw-warn' }, 'The file is too large (over 1 MB).'));
      return;
    }
    const result = parseListFile(await file.text());
    if (!result.ok) {
      preview.replaceChildren(h('p', { class: 'fw-warn' }, result.reason));
      return;
    }
    const n = mergeSummary(settings, result.lists);
    const total = n.boost + n.block + n.paused + n.filters;
    const parts: Array<Node | null> = [
      h('p', {}, total ? `“${file.name.slice(0, 80)}” would add:` : `“${file.name.slice(0, 80)}” has nothing new for your lists.`),
      total
        ? h(
            'ul',
            {},
            h('li', {}, `${n.boost} boosted domain(s)`),
            h('li', {}, `${n.block} blocked domain(s)`),
            h('li', {}, `${n.paused} paused site(s)`),
            h('li', {}, `${n.filters} filter rule(s)`),
          )
        : null,
      result.dropped ? h('p', { class: 'fw-muted' }, `${result.dropped} entr${result.dropped === 1 ? 'y was' : 'ies were'} skipped because they weren’t valid or safe.`) : null,
      total
        ? h(
            'div',
            { class: 'fw-actions' },
            h('button', { class: 'fw-primary', on: { click: async () => { await save(mergeLists(settings, result.lists)); await render(); status('Lists imported.'); } } }, 'Add to my lists'),
            h('button', { on: { click: () => preview.replaceChildren() } }, 'Cancel'),
          )
        : null,
    ];
    preview.replaceChildren(...parts.filter((x): x is Node => x !== null));
  });

  const site = h('input', { type: 'text', id: 'own-site', placeholder: 'https://your-site.example', autocomplete: 'url', spellcheck: 'false' });
  const humanOut = h('div', { role: 'status' });

  return h(
    'section',
    { class: 'fw-panel' },
    h('h2', {}, 'Share and back up'),
    h('p', { class: 'fw-muted' }, 'Save your boosted, blocked and paused sites and your own filters as a file, or add someone else’s. Imported files are checked like anything you type here: invalid domains and unsafe filter rules are skipped, and nothing is removed from your lists.'),
    h(
      'div',
      { class: 'fw-actions' },
      h('button', { on: { click: () => downloadText(`folkweb-lists-${today}.json`, exportLists(settings)) } }, 'Export my lists'),
      h('button', { on: { click: () => fileInput.click() } }, 'Import a list file…'),
      fileInput,
    ),
    preview,
    h('h2', { style: 'margin-top: 14px' }, 'Vouch for sites on your own website'),
    h(
      'p',
      { class: 'fw-muted' },
      'Have a website? Create a human.json that vouches for the sites you boosted, so people who trust you can find them too. Vouching is public: only include sites you know are made by people. ',
      extLink('https://codeberg.org/robida/human.json', 'About human.json'),
    ),
    h('div', { class: 'fw-row' }, h('label', { for: 'own-site' }, 'Your website'), site),
    h(
      'div',
      { class: 'fw-actions' },
      h('button', {
        on: {
          click: () => {
            const draft = buildHumanJson(site.value, settings.userBoost);
            if (!draft.ok) {
              humanOut.replaceChildren(h('p', { class: 'fw-warn' }, draft.reason));
              return;
            }
            downloadText('human.json', draft.json);
            humanOut.replaceChildren(
              h('p', {}, `Saved human.json with ${draft.vouches} vouch(es). Upload it to your site, then add this to every page’s <head>:`),
              h('pre', {}, h('code', {}, '<link rel="human-json" href="/human.json">')),
            );
          },
        },
      }, 'Create human.json'),
    ),
    humanOut,
  );
}

function themePanel(): HTMLElement {
  const select = h('select', { id: 'theme', on: { change: (e) => void save({ ...settings, theme: (e.target as HTMLSelectElement).value as ThemeId }) } });
  for (const t of THEMES) select.append(h('option', { value: t, selected: t === settings.theme }, THEME_LABELS[t]));
  return h('section', { class: 'fw-panel' }, h('h2', {}, 'Look'), h('div', { class: 'fw-row' }, h('label', { for: 'theme' }, 'Retro theme for every site'), select));
}

function trustedModePanel(): HTMLElement {
  const select = h('select', {
    id: 'trusted-mode',
    on: {
      change: (e) => {
        const v = (e.target as HTMLSelectElement).value as TrustedMode;
        if (TRUSTED_MODES.includes(v)) void save({ ...settings, search: { ...settings.search, trustedMode: v } });
      },
    },
  });
  for (const m of TRUSTED_MODES) select.append(h('option', { value: m, selected: m === settings.search.trustedMode }, TRUSTED_MODE_LABELS[m]));
  return h(
    'section',
    { class: 'fw-panel' },
    h('h2', {}, 'Trusted sources in search'),
    h('div', { class: 'fw-row' }, h('label', { for: 'trusted-mode' }, 'Results from other sources'), select),
    h(
      'p',
      { class: 'fw-muted' },
      'Trusted sources are sites on your boost lists (Folkweb’s and yours) and whole sites in your trust circle. “Only” mode puts a note above the results with a button to show everything, so you are never stuck with an empty page. Folkweb never judges a site as AI; it only follows the lists and people you chose. Note: Folkweb’s marks are part of the results page, so Google, DuckDuckGo and Bing can see which results it marked with ★, faded or hid. Folkweb only marks results on those search engines’ own sites.',
    ),
  );
}

async function render(): Promise<void> {
  settings = await loadSettings();
  mount(
    app,
    h(
      'p',
      { class: 'fw-muted', style: 'margin: 10px' },
      'New here? ',
      h('a', { href: browser.runtime.getURL('/welcome.html') }, 'Show the welcome page again'),
      '.',
    ),
    h('p', { id: 'fw-status', class: 'fw-muted', role: 'status', style: 'margin: 10px' }),
    themePanel(),
    ...TOGGLE_GROUPS.map(togglePanel),
    trustedModePanel(),
    await seedsPanel(),
    listEditor('Boosted domains', 'One domain per line. Marked with a ★ folk badge in search results and added to Wander.', 'userBoost'),
    listEditor('Blocked domains', 'One domain per line. Hidden from search results and shown behind a calm stop page.', 'userBlock'),
    listEditor('Paused sites', 'Folkweb does nothing on these domains.', 'disabledSites'),
    filtersEditor(),
    sharePanel(),
    h(
      'section',
      { class: 'fw-panel' },
      h('h2', {}, 'Privacy'),
      h('p', {}, 'Folkweb has no servers, no accounts and no analytics. Settings, lists and your trust circle live only in this browser. When you open the toolbar popup on a page that links a human.json on the same site, Folkweb fetches it without cookies. Content Credentials checks fetch the media file directly, without cookies, only when you ask. Folkweb does not block trackers or cookie banners; use your browser’s tracking protection or uBlock Origin alongside it.'),
    ),
    h(
      'section',
      { class: 'fw-panel' },
      h('h2', {}, 'Support Folkweb'),
      h(
        'p',
        {},
        'Folkweb is free and complete, with no ads or paid features, and it stays that way. If it’s useful to you, you can help keep it going: ',
        extLink('https://folkweb.org/support/', 'folkweb.org/support'),
        '.',
      ),
    ),
  );
}

void render();
