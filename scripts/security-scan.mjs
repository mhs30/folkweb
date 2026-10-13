#!/usr/bin/env node
// Folkweb security gate. Deterministic checks that back up SECURITY.md:
//   1. Manifest: permission allowlist, CSP, no web-accessible resources, no external messaging.
//   2. Source: no eval/HTML-string sinks, all network access through safeFetch, no telemetry.
//   3. Lists: data only (no scriptlets / CSS injection).
//   4. Secrets: no credentials committed.
//   5. Dependencies: exact versions; optional `--audit` runs npm audit.
//   6. CI workflows: actions pinned to commit SHAs, explicit permissions, no pull_request_target.
//   7. Website: no scripts or inline styles, nothing loaded from elsewhere, strict CSP, fresh security.txt.
// Usage: node scripts/security-scan.mjs [--audit]
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const findings = [];
const fail = (where, msg) => findings.push(`${where}: ${msg}`);

// --- 1. Manifest -----------------------------------------------------------
const ALLOWED_PERMISSIONS = new Set(['storage', 'contextMenus']);
const ALLOWED_OPTIONAL_HOSTS = new Set(['https://*/*', 'http://*/*']);
const ALLOWED_CONTENT_MATCHES = new Set(['http://*/*', 'https://*/*']);

function checkManifest(file, m) {
  for (const p of m.permissions ?? []) if (!ALLOWED_PERMISSIONS.has(p)) fail(file, `permission "${p}" is not in the allowlist (see SECURITY.md#permissions)`);
  if (m.host_permissions?.length) fail(file, 'host_permissions must stay empty; use optional_host_permissions requested at runtime');
  for (const p of m.optional_host_permissions ?? []) if (!ALLOWED_OPTIONAL_HOSTS.has(p)) fail(file, `optional host permission "${p}" not allowed`);
  if (m.web_accessible_resources?.length) fail(file, 'web_accessible_resources are not allowed (fingerprinting / clickjacking surface)');
  if (m.externally_connectable) fail(file, 'externally_connectable is not allowed');
  const csp = typeof m.content_security_policy === 'string' ? m.content_security_policy : m.content_security_policy?.extension_pages ?? '';
  // 'wasm-unsafe-eval' is allowed (needed for the bundled C2PA WASM); plain unsafe-eval/inline are not.
  if (/'unsafe-eval'|'unsafe-inline'/.test(csp)) fail(file, 'CSP must not allow unsafe-eval or unsafe-inline scripts');
  if (/https?:\/\/(?!localhost)/.test(csp)) fail(file, 'CSP must not allow remote script hosts');
  for (const cs of m.content_scripts ?? []) {
    for (const match of cs.matches ?? []) if (!ALLOWED_CONTENT_MATCHES.has(match)) fail(file, `content script match "${match}" not allowed`);
    if (cs.world === 'MAIN') fail(file, 'content scripts must run in the isolated world');
  }
}

for (const dir of ['chrome-mv3', 'firefox-mv3', 'firefox-mv2']) {
  const f = join(ROOT, '.output', dir, 'manifest.json');
  if (existsSync(f)) checkManifest(relative(ROOT, f), JSON.parse(readFileSync(f, 'utf8')));
}
const config = readFileSync(join(ROOT, 'wxt.config.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const permMatch = /permissions:\s*\[([^\]]*)\]/.exec(config);
if (!permMatch) fail('wxt.config.ts', 'could not find permissions array');
else for (const p of permMatch[1].match(/'([^']+)'/g) ?? []) if (!ALLOWED_PERMISSIONS.has(p.slice(1, -1))) fail('wxt.config.ts', `permission ${p} not in allowlist`);
if (/\bhost_permissions\s*:/.test(config.replace(/optional_host_permissions/g, ''))) fail('wxt.config.ts', 'host_permissions must not be declared');
if (/web_accessible_resources/.test(config)) fail('wxt.config.ts', 'web_accessible_resources must not be declared');

// --- 2. Source --------------------------------------------------------------
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.output', '.wxt', '.git', 'coverage'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const SOURCE_RULES = [
  [/\beval\s*\(/, 'eval() is forbidden'],
  [/new\s+Function\s*\(/, 'new Function() is forbidden'],
  [/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/, 'HTML string sinks are forbidden — use textContent / h()'],
  [/set(Timeout|Interval)\s*\(\s*['"`]/, 'string timers are forbidden'],
  [/importScripts\s*\(/, 'importScripts is forbidden'],
  [/scripting\.executeScript|tabs\.executeScript/, 'dynamic script injection is forbidden'],
  [/\bXMLHttpRequest\b|\bWebSocket\b|sendBeacon|EventSource/, 'use safeFetch() for network access'],
  [/\blocalStorage\b|\bsessionStorage\b/, 'use browser.storage (validated) instead of web storage'],
  [/google-analytics|googletagmanager|segment\.io|mixpanel|sentry\.io|posthog|amplitude/i, 'telemetry/analytics is forbidden'],
  [/\.postMessage\s*\(/, 'window.postMessage is forbidden (pages can spoof it); use runtime messaging'],
];
const FETCH_ALLOWED = new Set([join('src', 'lib', 'url-safety.ts')]);

for (const file of walk(join(ROOT, 'src'), ['.ts', '.js', '.html'])) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  for (const [re, msg] of SOURCE_RULES) if (re.test(text)) fail(rel, msg);
  if (/\bfetch\s*\(/.test(text) && !FETCH_ALLOWED.has(rel)) fail(rel, 'raw fetch() outside src/lib/url-safety.ts — use safeFetch()');
  if (rel.endsWith('.html') && /<script[^>]+src=["']https?:/i.test(text)) fail(rel, 'remote scripts are forbidden');
  if (rel.endsWith('.css') || rel.endsWith('.html')) {
    if (/@import\s+(url\()?["']?https?:/i.test(text)) fail(rel, 'remote CSS imports are forbidden');
  }
}
for (const file of walk(join(ROOT, 'src'), ['.css'])) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  if (/url\s*\(|@import|@font-face/i.test(text)) fail(rel, 'themes must not load resources (url(), @import, @font-face)');
}

// --- 3. Lists ---------------------------------------------------------------
for (const file of walk(join(ROOT, 'lists'), ['.txt'])) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*[!#]/.test(l));
  for (const l of lines) {
    if (/##\+js|#\$#|#%#|#\?#|\$\$|##\^/.test(l)) fail(rel, `executable or injection rule: ${l.slice(0, 80)}`);
  }
}

// --- 4. Secrets -------------------------------------------------------------
const SECRET_PATTERNS = [
  /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
];
for (const file of walk(ROOT, ['.ts', '.js', '.mjs', '.json', '.md', '.txt', '.yml', '.yaml', '.html', '.css', '.env'])) {
  const rel = relative(ROOT, file);
  if (rel === 'package-lock.json') continue;
  const text = readFileSync(file, 'utf8');
  for (const re of SECRET_PATTERNS) if (re.test(text)) fail(rel, `possible secret matching ${re}`);
}

// --- 5. Dependencies --------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (!/^\d+\.\d+\.\d+/.test(version)) fail('package.json', `${name}@${version} must be pinned to an exact version`);
}
if (pkg.scripts?.postinstall || pkg.scripts?.preinstall || pkg.scripts?.install) fail('package.json', 'install lifecycle scripts are not allowed');
if (!/ignore-scripts\s*=\s*true/.test(existsSync(join(ROOT, '.npmrc')) ? readFileSync(join(ROOT, '.npmrc'), 'utf8') : '')) {
  fail('.npmrc', 'ignore-scripts=true is required');
}
if (process.argv.includes('--audit')) {
  try {
    execSync('npm audit --audit-level=moderate', { stdio: 'inherit' });
  } catch {
    fail('npm audit', 'vulnerabilities at moderate level or above');
  }
}

// --- 6. CI workflows --------------------------------------------------------
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');
for (const file of walk(WORKFLOW_DIR, ['.yml', '.yaml'])) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  if (/^\s*pull_request_target\s*:/m.test(text) || /\[[^\]]*pull_request_target/.test(text)) fail(rel, 'pull_request_target is not allowed (runs untrusted PR code with secrets)');
  if (!/^permissions:/m.test(text)) fail(rel, 'top-level `permissions:` is required (default the token to read-only)');
  if (/permissions:\s*write-all/.test(text)) fail(rel, 'write-all permissions are not allowed');
  for (const m of text.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
    const ref = m[1];
    if (ref.startsWith('./')) continue;
    if (!/@[0-9a-f]{40}$/.test(ref)) fail(rel, `action "${ref}" must be pinned to a full commit SHA`);
  }
  for (const m of text.matchAll(/^\s*-?\s*uses:\s*actions\/checkout@[^\n]*\n(?:(?!\s*-\s)[^\n]*\n)*/gm)) {
    if (!/persist-credentials:\s*false/.test(m[0])) fail(rel, 'actions/checkout must set persist-credentials: false');
  }
}

// --- 7. Website (site/, served as-is by Cloudflare Pages) ---------------------
const SITE_DIR = join(ROOT, 'site');
if (existsSync(SITE_DIR)) {
  for (const file of walk(SITE_DIR, ['.html'])) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    if (/<script\b/i.test(text)) fail(rel, 'the website must not contain scripts');
    if (/\son[a-z]+\s*=/i.test(text)) fail(rel, 'inline event handlers are not allowed');
    if (/\sstyle\s*=|<style\b/i.test(text)) fail(rel, 'inline styles are blocked by the site CSP; use /style.css');
    if (/<(iframe|object|embed)\b/i.test(text)) fail(rel, 'embeds are not allowed on the website');
    if (/<(link|img)\b[^>]*\s(href|src)=["']https?:/i.test(text.replace(/<link rel="canonical"[^>]*>/g, ''))) fail(rel, 'resources must be served from folkweb.org itself');
  }
  for (const file of walk(SITE_DIR, ['.css'])) {
    if (/url\s*\(|@import|@font-face/i.test(readFileSync(file, 'utf8'))) fail(relative(ROOT, file), 'website CSS must not load anything');
  }
  // Cloudflare turns these into server-side code or deploy config. The site stays static.
  for (const p of ['site/_worker.js', 'site/_routes.json', 'functions', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc']) {
    if (existsSync(join(ROOT, p))) fail(p, 'the website is static: no Pages Functions, Workers or Wrangler config without human review');
  }
  const headersFile = join(SITE_DIR, '_headers');
  const headers = existsSync(headersFile) ? readFileSync(headersFile, 'utf8') : '';
  if (!/Content-Security-Policy: default-src 'none'/.test(headers)) fail('site/_headers', "a Content-Security-Policy starting with default-src 'none' is required");
  if (/unsafe-(inline|eval)/.test(headers)) fail('site/_headers', 'unsafe-inline / unsafe-eval are not allowed');
  const securityTxt = join(SITE_DIR, '.well-known', 'security.txt');
  if (existsSync(securityTxt)) {
    const expires = Date.parse(/^Expires: (.+)$/m.exec(readFileSync(securityTxt, 'utf8'))?.[1] ?? '');
    const days = (expires - Date.now()) / 86_400_000;
    if (Number.isNaN(expires)) fail('site/.well-known/security.txt', 'Expires is missing or invalid');
    else if (days < 30) fail('site/.well-known/security.txt', `Expires is ${Math.floor(days)} days away: renew it (keep it under a year ahead)`);
    else if (days > 366) fail('site/.well-known/security.txt', 'Expires must be less than a year ahead (RFC 9116)');
  }
}

if (findings.length) {
  console.error(`✗ security scan found ${findings.length} problem(s):`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ security scan passed');
