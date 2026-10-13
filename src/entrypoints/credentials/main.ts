import initC2pa, { WasmReader } from '@contentauth/c2pa-wasm';
import { browser } from 'wxt/browser';
import { C2PA_READER_CONTEXT, headlineFor, isRemoteManifestError, summarizeManifestStore, type C2paSummary } from '../../lib/c2pa-summary';
import { LIMITS } from '../../lib/constants';
import { parseSafeUrl, safeFetch } from '../../lib/url-safety';
import { extLink, h, mount } from '../../ui/dom';

const app = document.getElementById('app')!;
// The WASM is copied in by the build hook in wxt.config.ts, so WXT's typed paths don't list it.
const WASM_URL = (browser.runtime.getURL as (p: string) => string)('/c2pa/c2pa_bg.wasm');
const src = parseSafeUrl(new URLSearchParams(location.search).get('src'));

const VALIDATION_TEXT: Record<C2paSummary['validation'], string> = {
  trusted: 'Signature valid, signer on the trust list',
  valid: 'Signature valid (signer not checked against a trust list)',
  'untrusted-signer': 'Signature intact, but the signer couldn’t be confirmed',
  invalid: 'Credentials failed validation — the file may have been altered',
  unknown: 'Validation status not reported',
};

/** WASM bindings may throw strings or plain objects instead of Error instances. */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'unknown error';
}

function panel(...children: Array<Node | string | null>): HTMLElement {
  return h('section', { class: 'fw-panel' }, ...children);
}

function showError(text: string): void {
  mount(app, panel(h('p', { class: 'fw-warn' }, text)));
}

function renderSummary(summary: C2paSummary, previewUrl: string | null): void {
  const v = headlineFor(summary);
  const preview = previewUrl ? h('img', { class: 'fw-preview', alt: '' }) : null;
  if (preview && previewUrl) preview.src = previewUrl;

  const rows: Array<[string, string | null]> = [
    ['Validation', summary.verdict === 'none' ? null : VALIDATION_TEXT[summary.validation]],
    [v.signerLabel, summary.signer],
    ['Made with', summary.generator],
    ['Signed at', summary.signedAt],
    ['Declared source type', summary.sourceTypes.join(', ') || null],
    ['Actions', summary.actions.join(', ') || null],
    ['Ingredients', summary.ingredientCount ? String(summary.ingredientCount) : null],
  ];
  mount(
    app,
    panel(
      preview,
      h('p', { class: 'fw-verdict' }, `${v.icon} ${v.title}`),
      h('p', {}, v.detail),
      h('dl', {}, ...rows.filter(([, val]) => val).flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val!)])),
    ),
    panel(
      h('p', { class: 'fw-muted' }, 'Source: ', src ? src.hostname : ''),
      h('p', { class: 'fw-muted' }, 'Learn more: ', extLink('https://contentcredentials.org/', 'contentcredentials.org')),
    ),
  );
}

async function check(url: URL): Promise<void> {
  mount(app, panel(h('p', { class: 'fw-muted' }, `Reading ${url.hostname}…`)));
  let previewUrl: string | null = null;
  try {
    const { bytes, contentType } = await safeFetch(url.href, {
      maxBytes: LIMITS.mediaBytes,
      contentTypes: ['image/', 'video/', 'audio/', 'application/octet-stream'],
    });
    const blob = new Blob([bytes], { type: contentType.split(';')[0] || 'application/octet-stream' });
    if (blob.type.startsWith('image/')) previewUrl = URL.createObjectURL(blob);

    // Runs on this extension page's main thread: no worker, so no blob:/remote worker CSP exceptions.
    await initC2pa({ module_or_path: WASM_URL });
    let reader: WasmReader;
    try {
      reader = await WasmReader.fromBytes(blob.type, bytes, C2PA_READER_CONTEXT);
    } catch (err) {
      if (/JumbfNotFound|ManifestNotFound/.test(errorText(err))) {
        renderSummary(summarizeManifestStore(null), previewUrl);
        return;
      }
      if (isRemoteManifestError(errorText(err))) {
        mount(
          app,
          panel(
            h('p', { class: 'fw-verdict' }, 'ⓘ Credentials stored elsewhere'),
            h('p', {}, 'This file says its Content Credentials are kept at another address. Folkweb only reads what is inside the file and never contacts other addresses, so it did not fetch them. This does not mean the file is AI-generated.'),
          ),
        );
        return;
      }
      throw err;
    }
    try {
      // json() yields plain JSON (no Maps/class instances) — parsed, never evaluated.
      renderSummary(summarizeManifestStore(JSON.parse(reader.json())), previewUrl);
    } finally {
      reader.free();
    }
  } catch (err) {
    showError(`Could not read this file: ${errorText(err).slice(0, 200)}`);
  }
}

async function start(): Promise<void> {
  if (!src) {
    showError('This media address can’t be checked (only public http/https files are supported).');
    return;
  }
  const origins = [`${src.origin}/*`];
  if (await browser.permissions.contains({ origins })) {
    await check(src);
    return;
  }
  mount(
    app,
    panel(
      h('p', {}, 'To read this file’s Content Credentials, Folkweb needs permission to download files from:'),
      h('p', {}, h('strong', {}, src.origin)),
      h('p', { class: 'fw-muted' }, 'Only this site is added, only when you click. Files are fetched without cookies and never sent anywhere.'),
      h(
        'div',
        { class: 'fw-actions' },
        h('button', {
          class: 'fw-primary',
          on: {
            click: async () => {
              if (await browser.permissions.request({ origins })) await check(src);
              else showError('Permission was not granted, so the file could not be read.');
            },
          },
        }, `Allow ${src.hostname}`),
      ),
    ),
  );
}

void start();
