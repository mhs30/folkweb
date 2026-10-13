import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  noUnsanitized.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, defineBackground: 'readonly', defineContentScript: 'readonly' },
    },
    rules: {
      // Security baseline — see SECURITY.md. Do not relax without a reviewed exception.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent or the h() builder (src/ui/dom.ts).' },
        { property: 'outerHTML', message: 'Use DOM APIs instead.' },
        { property: 'insertAdjacentHTML', message: 'Use DOM APIs instead.' },
        { object: 'document', property: 'write', message: 'Never use document.write.' },
        { property: 'srcdoc', message: 'Never build iframes from strings.' },
      ],
      'no-restricted-globals': ['error', { name: 'eval', message: 'Never evaluate strings.' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.ts', '*.config.js', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests contain javascript: URLs on purpose, as attack fixtures.
    files: ['tests/**/*.ts'],
    rules: { 'no-script-url': 'off' },
  },
);
