import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// Security notes (see SECURITY.md before changing anything here):
// - Required permissions are kept minimal. Any new permission needs a written
//   justification in SECURITY.md and human review.
// - Cross-origin fetches (human.json on other origins, C2PA media) use
//   *optional* host permissions requested at runtime, per origin, by user action.
// - No web_accessible_resources: pages cannot fingerprint or frame our UI.
// - The C2PA WASM is bundled locally; we never load remote code.
const C2PA_WASM = resolve('node_modules/@contentauth/c2pa-wasm/pkg/c2pa_bg.wasm');

export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: 'Folkweb',
    description:
      'The web, by folks. Human signals you can see, curators you choose, and a calmer, retro web.',
    permissions: ['storage', 'contextMenus'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; base-uri 'none'; form-action 'none'",
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'extension@folkweb.org',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {}),
  }),
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      files.push({ absoluteSrc: C2PA_WASM, relativeDest: 'c2pa/c2pa_bg.wasm' });
    },
  },
  // The sources zip goes to Mozilla's reviewers with each Firefox release (see docs/RELEASING.md).
  // Keep .npmrc so a rebuild also runs with install scripts disabled; leave out local test output.
  zip: {
    includeSources: ['**/*', '.npmrc'],
    excludeSources: ['test-results/**', 'playwright-report/**', 'site/**', 'coverage/**'],
  },
});
