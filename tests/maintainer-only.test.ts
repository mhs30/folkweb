import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCAN = join(__dirname, '..', 'scripts', 'maintainer-only.mjs');
const MARKER = 'folkweb-ops:' + 'maintainer-only';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Runs the check on a throwaway folder and returns what it reported ('' when clean).
function scan(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), 'folkweb-scan-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const r = spawnSync(process.execPath, [SCAN, dir], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(r.stderr ? 1 : 0);
  return r.stderr;
}

describe('security scan: maintainer-only material stays out of the public repository', () => {
  it('refuses a document with the ops marker, whatever its name', () => {
    expect(scan({ 'docs/notes.md': `<!-- ${MARKER} -->\n# Plan` })).toContain('docs/notes.md');
  });

  it.each(['ops/README.md', 'LAUNCH.md', 'docs/PRE-FLIP.md', 'RELEASE-CHECKLIST.md', 'scripts/go-public.sh', 'FUNDING-PLAN.md', 'docs/AUDIT-2026-10.md'])(
    'refuses %s',
    (path) => expect(scan({ [path]: 'x' })).not.toBe(''),
  );

  it('accepts ordinary public files', () => {
    expect(scan({ 'README.md': '# Folkweb', 'docs/RELEASING.md': 'How releases are built', 'SECURITY.md': 'maintainer review' })).toBe('');
  });

  it('does not follow symlinked files or directories', () => {
    dir = mkdtempSync(join(tmpdir(), 'folkweb-scan-'));
    const root = join(dir, 'root');
    const outside = join(dir, 'outside');
    mkdirSync(join(root, 'docs'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(outside, 'private.md'), `<!-- ${MARKER} -->`);
    symlinkSync(join(outside, 'private.md'), join(root, 'docs', 'linked.md'));
    symlinkSync(outside, join(root, 'linked-directory'));
    const r = spawnSync(process.execPath, [SCAN, root], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('✓ no maintainer-only material');
  });
});
