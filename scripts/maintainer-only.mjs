#!/usr/bin/env node
// Maintainer-only material (launch plans, accounts, budget, funding) never enters this public
// repository (AGENTS.md); it lives in the maintainers' private repository. Every document there
// carries a marker line, and its known file names are refused here too, whatever their content.
//   node scripts/maintainer-only.mjs [dir]   # exit 1 and list the files when something is found
// Also run by scripts/security-scan.mjs.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'folkweb-ops:' + 'maintainer-only';
const NAMES = new Set(['launch.md', 'pre-flip.md', 'release-checklist.md', 'go-public.sh', 'funding-plan.md', 'launch-readiness.md']);
const SKIP_DIRS = new Set(['node_modules', '.output', '.wxt', '.git', 'coverage', 'test-results', 'playwright-report']);
const BINARY = /\.(png|jpe?g|gif|ico|webp|wasm|zip|woff2?)$/i;

/** Problems as "path: reason", relative to `root`. */
export function findMaintainerOnly(root) {
  const found = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const path = join(dir, name);
      const rel = relative(root, path);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (rel === 'ops') found.push('ops/: maintainer-only folder');
        visit(path);
        continue;
      }
      const lower = name.toLowerCase();
      if (NAMES.has(lower) || /^audit-.*\.md$/.test(lower)) found.push(`${rel}: maintainer-only file name`);
      else if (!BINARY.test(lower) && stat.size < 2_000_000 && readFileSync(path, 'utf8').includes(MARKER)) {
        found.push(`${rel}: marked maintainer-only`);
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
