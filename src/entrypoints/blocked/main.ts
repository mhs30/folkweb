import { browser } from 'wxt/browser';
import { normalizeDomain } from '../../lib/domains';
import { allowOnce, loadSettings, updateSettings } from '../../lib/storage';
import { parseSafeUrl } from '../../lib/url-safety';
import { h, mount } from '../../ui/dom';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
// The target URL arrives via the query string: treat it as untrusted and only ever navigate to public http(s).
const target = parseSafeUrl(params.get('u'));
const matched = normalizeDomain(params.get('m') ?? '');

async function closeTab(): Promise<void> {
  const tab = await browser.tabs.getCurrent();
  if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
}

async function render(): Promise<void> {
  if (!target) {
    mount(app, h('section', { class: 'fw-panel' }, h('h1', {}, 'Nothing to show'), h('p', {}, 'This page was opened without a valid address.')));
    return;
  }
  const host = target.hostname;
  const onMyList = !!matched && (await loadSettings()).userBlock.includes(matched);

  const unblock = onMyList
    ? h('button', {
        on: {
          click: async () => {
            await updateSettings((s) => ({ ...s, userBlock: s.userBlock.filter((d) => d !== matched) }));
            location.href = target.href;
          },
        },
      }, 'Unblock (remove from my list)')
    : null;

  mount(
    app,
    h(
      'section',
      { class: 'fw-panel' },
      h('img', { class: 'fw-logo', src: '/icon/logo.svg', alt: '', width: '56', height: '56' }),
      h('h1', {}, 'Let’s take a different path'),
      h('p', {}, h('strong', {}, host), ' is on a block list you use', matched && matched !== host ? ` (as ${matched})` : '', '.'),
      h('p', { class: 'fw-muted' }, 'Folkweb pauses sites that you or curators you follow put on a block list, such as content farms. You are always free to continue.'),
      h(
        'div',
        { class: 'fw-actions' },
        h('button', { class: 'fw-primary', on: { click: () => (history.length > 2 ? history.go(-2) : void closeTab()) } }, 'Go back'),
        h('button', {
          on: {
            click: async () => {
              await allowOnce(host);
              location.href = target.href;
            },
          },
        }, 'Continue for 10 minutes'),
        unblock,
      ),
    ),
  );
}

void render();
