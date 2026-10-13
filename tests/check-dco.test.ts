import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(__dirname, '..', 'scripts', 'check-dco.mjs');

const ALICE = { name: 'Alice Folk', email: 'alice@example.org' };
const BOT = { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' };

let repo = '';
let counter = 0;

// An isolated git: no global or system config (signing, hooks, templates) leaks into the tests.
function git(args: string[], author = ALICE): string {
  const r = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: repo,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function commit(message: string, author = ALICE): string {
  counter += 1;
  writeFileSync(join(repo, `file-${counter}.txt`), String(counter));
  git(['add', '.'], author);
  git(['commit', '-q', '-m', message], author);
  return git(['rev-parse', 'HEAD']);
}

function check(...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'folkweb-dco-'));
  git(['init', '-q', '-b', 'main']);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('DCO check', () => {
  it('passes when every commit is signed off by its author', () => {
    const base = commit('base, not checked');
    commit(`Fix a selector\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    const head = commit(`Add a test\n\nSigned-off-by: ${ALICE.name} <ALICE@Example.org>`);
    const r = check(base, head);
    expect(r.out).toContain('signed off');
    expect(r.status).toBe(0);
  });

  it('passes on an empty range', () => {
    const head = commit('only commit');
    expect(check(head, head).status).toBe(0);
  });

  it('fails a commit without a sign-off and names it', () => {
    const base = commit('base');
    commit(`Signed off\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    const head = commit('Forgot to sign off');
    const r = check(base, head);
    expect(r.status).toBe(1);
    expect(r.out).toContain(head.slice(0, 12));
    expect(r.out).toContain('Forgot to sign off');
    expect(r.out).toContain('git rebase --signoff');
  });

  it("fails a sign-off by someone other than the author", () => {
    const base = commit('base');
    const head = commit('Impersonated\n\nSigned-off-by: Mallory <mallory@example.org>');
    expect(check(base, head).status).toBe(1);
  });

  it('only counts a sign-off at the start of a line, with an email', () => {
    const base = commit('base');
    commit(`Quoted\n\n> Signed-off-by: ${ALICE.name} <${ALICE.email}>`);
    const head = commit(`No email\n\nSigned-off-by: ${ALICE.name}`);
    const r = check(base, head);
    expect(r.status).toBe(1);
    expect(r.out).toContain('2 commit(s)');
  });

  it('accepts a bot that signs off with another address, but not a bot without a sign-off', () => {
    const base = commit('base');
    const bump = commit('deps: bump x\n\nSigned-off-by: dependabot[bot] <support@github.com>', BOT);
    expect(check(base, bump).status).toBe(0);
    const unsigned = commit('deps: bump y', BOT);
    expect(check(base, unsigned).status).toBe(1);
  });

  it('a non-bot author cannot use the bot rule', () => {
    const base = commit('base');
    const fake = { name: 'Alice', email: 'alice[bot]@example.org' };
    const head = commit('Looks like a bot\n\nSigned-off-by: Someone <someone@example.org>', fake);
    expect(check(base, head).status).toBe(1);
  });

  it('a forged GitHub bot address is not on the allowlist', () => {
    const base = commit('base');
    const forged = { name: 'evil[bot]', email: 'evil[bot]@users.noreply.github.com' };
    const head = commit('Forged bot\n\nSigned-off-by: Someone <someone@example.org>', forged);
    expect(check(base, head).status).toBe(1);
  });

  it('ignores merge commits', () => {
    const base = commit('base');
    git(['checkout', '-q', '-b', 'feature']);
    commit(`Feature\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    git(['checkout', '-q', 'main']);
    commit(`Main moved\n\nSigned-off-by: ${ALICE.name} <${ALICE.email}>`);
    git(['checkout', '-q', 'feature']);
    git(['merge', '-q', '--no-edit', 'main']);
    expect(check(base, git(['rev-parse', 'HEAD'])).status).toBe(0);
  });

  it.each([
    [[]],
    [['abc1234']],
    [['main', 'feature']],
    [['--output=/tmp/x', 'abc1234']],
    [['abc1234', '--upload-pack=touch /tmp/pwned']],
    [['abc1234;rm -rf /', 'abc1234']],
    [['ABC1234', 'abc1234']],
  ])('rejects bad arguments without running git: %j', (args) => {
    const r = check(...args);
    expect(r.status).toBe(2);
    expect(r.out).toContain('usage');
  });
});
