import { browser } from 'wxt/browser';
import { PROJECT_LINKS } from '../../lib/constants';
import { THEME_LABELS, THEMES, TRUSTED_MODE_LABELS, TRUSTED_MODES, type Settings, type ThemeId, type TrustedMode } from '../../lib/settings';
import { togglesById } from '../../lib/settings-toggles';
import { loadSettings, saveSettings } from '../../lib/storage';
import { extLink, h, mount } from '../../ui/dom';
import { pickWanderUrl } from '../../ui/wander';

const app = document.getElementById('app')!;
const footer = document.getElementById('footer')!;

const SETUP_TOGGLES = togglesById([
  'aiSurfaces',
  'sponsored',
  'sponsoredHeuristic',
  'googleWebOnly',
  'annotate',
  'hideBlocked',
  'noAutoplay',
  'noAnimations',
  'demetricate',
]);

let settings: Settings;

async function save(next: Settings): Promise<void> {
  settings = next;
  await saveSettings(next);
  const status = document.getElementById('fw-status');
  if (status) status.textContent = 'Saved. Changes apply to pages as you open or reload them.';
}

const item = (icon: string, ...text: Array<Node | string>) => h('li', {}, h('span', { class: 'fw-icon', 'aria-hidden': 'true' }, icon), h('span', {}, ...text));

function intro(): HTMLElement {
  return h(
    'section',
    { class: 'fw-panel' },
    h(
      'p',
      { class: 'fw-lead' },
      'Folkweb helps you find and enjoy the parts of the web that people make. It isn’t against AI; it’s for people: you choose which AI you see. It shows evidence instead of guessing, lets you choose whose judgement to trust, and quiets the noise in between. ',
      h('strong', {}, 'It’s already set up.'),
      ' Change anything below, or later in Settings.',
    ),
  );
}

function doesAndDoesnt(): HTMLElement {
  return h(
    'div',
    { class: 'fw-two' },
    h(
      'section',
      { class: 'fw-panel' },
      h('h2', {}, 'What Folkweb does'),
      h(
        'ul',
        { class: 'fw-list' },
        item('🧹', 'Hides the AI panels, AI summaries and sponsored modules you didn’t ask for, each one your choice. The toolbar button shows ', h('em', {}, 'what'), ' it hid on each page and ', h('em', {}, 'why'), '.'),
        item('★', 'Marks results from human-made sites on lists you follow, and hides known content farms in Google, DuckDuckGo and Bing.'),
        item('🟢', 'Reads ', extLink(PROJECT_LINKS.humanJson, 'human.json'), ': sites saying a person runs them, and vouching for others you can choose to trust.'),
        item('📷', 'Right-click an image → “Check Content Credentials” shows who signed it and how it was made, when that information exists.'),
        item('🌿', 'No autoplay, still pages, and optional retro looks for every site.'),
      ),
    ),
    h(
      'section',
      { class: 'fw-panel' },
      h('h2', {}, 'What it deliberately doesn’t do'),
      h(
        'ul',
        { class: 'fw-list' },
        item('🚫', 'It doesn’t guess whether something is “AI”. No tool can do that honestly. Missing signals mean “unknown”, never “fake”.'),
        item('🔒', 'It doesn’t track you. No account, no servers, no analytics. Your settings and lists stay in this browser.'),
        item('🍪', 'It doesn’t block trackers or cookie banners. Keep your browser’s tracking protection or uBlock Origin; Folkweb works alongside them.'),
        item('👀', 'It never hides things silently. Open the toolbar button on any page to see the list and show it all again.'),
      ),
    ),
  );
}

function setup(): HTMLElement {
  const rows = SETUP_TOGGLES.map((t) => {
    const id = `setup-${t.id}`;
    return h(
      'div',
      { class: 'fw-row' },
      h('input', { type: 'checkbox', id, checked: t.get(settings), on: { change: (e) => void save(t.set(settings, (e.target as HTMLInputElement).checked)) } }),
      h('label', { for: id }, t.label),
    );
  });

  const mode = h('select', {
    id: 'setup-trusted',
    on: {
      change: (e) => {
        const v = (e.target as HTMLSelectElement).value as TrustedMode;
        if (TRUSTED_MODES.includes(v)) void save({ ...settings, search: { ...settings.search, trustedMode: v } });
      },
    },
  });
  for (const m of TRUSTED_MODES) mode.append(h('option', { value: m, selected: m === settings.search.trustedMode }, TRUSTED_MODE_LABELS[m]));

  const theme = h('select', {
    id: 'setup-theme',
    on: {
      change: (e) => {
        const v = (e.target as HTMLSelectElement).value as ThemeId;
        if (THEMES.includes(v)) void save({ ...settings, theme: v });
      },
    },
  });
  for (const t of THEMES) theme.append(h('option', { value: t, selected: t === settings.theme }, THEME_LABELS[t]));

  return h(
    'section',
    { class: 'fw-panel fw-step' },
    h('h2', {}, 'Choose your setup'),
    ...rows,
    h('div', { class: 'fw-row' }, h('label', { for: 'setup-trusted' }, 'Search results from sources you haven’t chosen'), mode),
    h('div', { class: 'fw-row' }, h('label', { for: 'setup-theme' }, 'Look for every site'), theme),
    h('p', { id: 'fw-status', class: 'fw-muted', role: 'status' }),
  );
}

function permissions(): HTMLElement {
  return h(
    'section',
    { class: 'fw-panel fw-step' },
    h('h2', {}, 'Permissions, in plain words'),
    h(
      'ul',
      { class: 'fw-list' },
      item(
        '📄',
        h('strong', {}, 'Read and change pages you visit. '),
        'Your browser may call this “read and change all your data on all websites”. Folkweb needs it to hide clutter, mark search results and apply themes. It all happens inside your browser; nothing is sent anywhere.',
      ),
      item('💾', h('strong', {}, 'Storage. '), 'Your settings, lists and trust circle, kept in this browser only.'),
      item('🖱️', h('strong', {}, 'Right-click menu. '), 'Adds “Check Content Credentials” to images, video and audio.'),
      item(
        '🌐',
        h('strong', {}, 'Site access, only when you ask. '),
        'To check an image’s Content Credentials, Folkweb asks for access to that one site at that moment. You can say no.',
      ),
    ),
  );
}

function tryIt(): HTMLElement {
  return h(
    'section',
    { class: 'fw-panel fw-step' },
    h('h2', {}, 'Try it'),
    h(
      'p',
      {},
      h('strong', {}, 'Pin Folkweb'),
      ' so it’s one click away: open your browser’s extensions menu (the puzzle piece) and pin Folkweb. Then search for something, or wander somewhere new.',
    ),
    h(
      'div',
      { class: 'fw-actions' },
      h('button', { class: 'fw-primary', title: 'Open a random human-made site', on: { click: () => void wander() } }, '🎲 Wander to a human-made site'),
      h('button', { on: { click: () => void browser.runtime.openOptionsPage() } }, 'All settings'),
    ),
  );
}

async function wander(): Promise<void> {
  const url = await pickWanderUrl();
  if (url) await browser.tabs.create({ url });
}

async function render(): Promise<void> {
  settings = await loadSettings();
  mount(app, intro(), doesAndDoesnt(), setup(), permissions(), tryIt());
  mount(
    footer,
    h(
      'span',
      {},
      'No tracking. Your lists and trust stay in your browser. · ',
      extLink(PROJECT_LINKS.privacy, 'Privacy'),
      ' · ',
      extLink(PROJECT_LINKS.curationPolicy, 'How lists are curated'),
      ' · ',
      extLink(PROJECT_LINKS.aiPolicy, 'How we use AI'),
    ),
  );
}

void render();
