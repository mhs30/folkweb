#!/usr/bin/env node
// Maintainer-only material (launch plans, accounts, budget, funding) never enters this public
// repository (AGENTS.md); it lives in the maintainers' private repository. Every document there
// carries a marker line, and its known file names are refused here too, whatever their content.
//   node scripts/maintainer-only.mjs [dir]   # exit 1 and list the files when something is found
// Also run by scripts/security-scan.mjs.
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'folkweb-ops:' + 'maintainer-only';
const NAMES = new Set(['launch.md', 'pre-flip.md', 'release-checklist.md', 'go-public.sh', 'funding-plan.md', 'launch-readiness.md']);
const SKIP_DIRS = new Set(['node_modules', '.output', '.wxt', '.git', 'coverage', 'test-results', 'playwright-report']);
const BINARY = /\.(png|jpe?g|gif|ico|webp|wasm|zip|woff2?)$/i;
const MAX_TEXT_BYTES = 2_000_000;

function readSmallRegularFile(path, expectedStat) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ELOOP') return null;
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.dev !== expectedStat.dev ||
      stat.ino !== expectedStat.ino ||
      stat.size !== expectedStat.size ||
      stat.size >= MAX_TEXT_BYTES
    ) return null;
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_TEXT_BYTES));
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(fd, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead === buffer.length && bytesRead > stat.size) return null;
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

/** Problems as "path: reason", relative to `root`. */
export function findMaintainerOnly(root) {
  const found = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const path = join(dir, name);
      const rel = relative(root, path);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        if (rel === 'ops') found.push('ops/: maintainer-only folder');
        visit(path);
        continue;
      }
      const lower = name.toLowerCase();
      if (NAMES.has(lower) || /^audit-.*\.md$/.test(lower)) found.push(`${rel}: maintainer-only file name`);
      else if (stat.isFile() && !BINARY.test(lower) && stat.size < MAX_TEXT_BYTES) {
        const text = readSmallRegularFile(path, stat);
        if (text?.includes(MARKER)) found.push(`${rel}: marked maintainer-only`);
      }
    }
  };
  if (existsSync(root)) visit(root);
  return found;
}

// Run directly (also through a symlinked path such as macOS /tmp → /private/tmp)?
const realPath = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) {
  const found = findMaintainerOnly(process.argv[2] ?? process.cwd());
  if (found.length) {
    console.error('✗ maintainer-only material belongs in the private ops repository:');
    for (const f of found) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('✓ no maintainer-only material');
}
