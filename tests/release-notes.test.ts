import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(__dirname, '..', 'scripts', 'release-notes.mjs');
let dir = '';

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function run(version: string) {
  dir = mkdtempSync(join(tmpdir(), 'folkweb-release-notes-'));
  writeFileSync(
    join(dir, 'CHANGELOG.md'),
    ['## [1.2.3] - 2026-10-01', 'Release three', '', '## [1.2.30] - 2026-10-02', 'Release thirty', ''].join('\n'),
  );
  return spawnSync(process.execPath, [SCRIPT, version], { cwd: dir, encoding: 'utf8' });
}

describe('release notes version parsing', () => {
  it('selects only the exact requested version section', () => {
    const result = run('v1.2.3');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release three');
    expect(result.stdout).not.toContain('Release thirty');
  });

  it('rejects malformed version arguments before reading changelog headings', () => {
    const result = run('v1.2.3.*');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('usage:');
  });

  it('does not match a numeric prefix as a complete version', () => {
    const result = run('v1.2.4');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no section for 1.2.4');
  });
});
