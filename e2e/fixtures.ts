import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The service worker's own API, used only to set up and read test state.
declare const chrome: { storage: { local: { set(items: object): Promise<void>; get(key: string): Promise<Record<string, unknown>> } } };

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..', '.output', 'chrome-mv3');
const PAGES = join(HERE, 'pages');

/** Fixture routes by host + path. Everything is local; no request leaves the machine. */
function route(host: string, path: string): { type: string; body: string } | null {
  const page = (name: string) => ({ type: 'text/html; charset=utf-8', body: readFileSync(join(PAGES, name), 'utf8') });
  if (host === 'blog.e2e.test') {
    if (path === '/') return page('article.html');
    if (path === '/theme') return page('theme.html');
    if (path === '/human.json') return { type: 'application/json', body: JSON.stringify({ version: '0.1.1', url: 'https://blog.e2e.test', vouches: [] }) };
    if (path === '/feed.xml') return { type: 'application/rss+xml', body: '<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title></channel></rss>' };
    if (path === '/ai/') return page('plain.html');
  }
  if (host === 'www.bing.com' && path === '/search') return page('search.html');
  if (host.endsWith('.e2e.test')) return page('plain.html');
  return null;
}

async function startServer(dir: string): Promise<Server> {
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  // A throwaway self-signed certificate; the test browser ignores certificate errors.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=e2e.test'], { stdio: 'ignore' });
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const url = new URL(req.url ?? '/', 'https://x');
    const r = route(String(req.headers.host ?? '').split(':')[0]!, url.pathname);
    res.writeHead(r ? 200 : 404, { 'Content-Type': r?.type ?? 'text/plain' }).end(r?.body ?? 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

export interface Folkweb {
  context: BrowserContext;
  worker: Worker;
  id: string;
  /** Errors from Folkweb's own code: extension pages, the content script and uncaught errors. */
  errors: string[];
  setSettings(settings: Record<string, unknown>): Promise<void>;
  storedSettings(): Promise<Record<string, unknown>>;
  /** Open the toolbar popup as it would appear for `tab`. */
  popupFor(tab: Page): Promise<Page>;
  /** Text of Chrome's own Errors page for Folkweb (what people see in chrome://extensions). */
  chromeErrors(): Promise<string>;
}

export const test = base.extend<object, { folkweb: Folkweb }>({
  folkweb: [
    // Playwright requires the (empty) fixtures argument to be destructured.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), 'folkweb-e2e-'));
      const server = await startServer(dir);
      const port = (server.address() as AddressInfo).port;
      const profile = join(dir, 'profile');
      // Developer mode makes Chrome record extension errors, like it does for you in chrome://extensions.
      mkdirSync(join(profile, 'Default'), { recursive: true });
      writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }));

      const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        viewport: { width: 1100, height: 800 },
        args: [
          `--disable-extensions-except=${EXT}`,
          `--load-extension=${EXT}`,
          `--host-resolver-rules=MAP *.e2e.test 127.0.0.1:${port}, MAP www.bing.com 127.0.0.1:${port}, EXCLUDE localhost`,
          '--ignore-certificate-errors',
        ],
      });
      const errors: string[] = [];
      context.on('weberror', (e) => errors.push(`uncaught: ${e.error().message}`));
      const watch = (page: Page) =>
        page.on('console', (msg) => {
          const from = msg.location().url;
          if (msg.type() === 'error' && (from.startsWith('chrome-extension://') || page.url().startsWith('chrome-extension://'))) {
            errors.push(`${page.url()}: ${msg.text()}`);
          }
        });
      context.pages().forEach(watch);
      context.on('page', watch);

      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const id = new URL(worker.url()).host;

      const folkweb: Folkweb = {
        context,
        worker,
        id,
        errors,
        setSettings: (settings) => worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings),
        storedSettings: () => worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings as Record<string, unknown>),
        async popupFor(tab) {
          const popup = await context.newPage();
          await popup.goto(`chrome-extension://${id}/popup.html`);
          // The popup asks for the active tab: make the page under test active, then load the popup.
          await tab.bringToFront();
          await popup.reload();
          await expect(popup.locator('#app')).not.toContainText('Looking around');
          return popup;
        },
        async chromeErrors() {
          const page = await context.newPage();
          await page.goto(`chrome://extensions/?errors=${id}`);
          await page.waitForTimeout(800);
          const text = await page.evaluate(() => {
            const parts: string[] = [];
            const walk = (root: Document | ShadowRoot) => {
              for (const el of root.querySelectorAll('*')) {
                if (el.tagName === 'EXTENSIONS-ERROR-PAGE' && el.shadowRoot) parts.push(el.shadowRoot.textContent ?? '');
                if (el.shadowRoot) walk(el.shadowRoot);
              }
            };
            walk(document);
            return parts.join(' ');
          });
          await page.close();
          return text.replace(/\s+/g, ' ').replace(/\b(Errors|Clear all)\b/g, '').trim();
        },
      };
      await use(folkweb);
      await context.close();
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
});

export { expect };
