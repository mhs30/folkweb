#!/usr/bin/env node
// DCO check for pull requests (see CONTRIBUTING.md "Sign your commits off").
// Every non-merge commit in BASE..HEAD needs a "Signed-off-by: Name <email>" line from its
// author. The GitHub bots listed in BOTS sign off with another address, so for them any
// sign-off counts. Git author fields are free text: only these exact identities qualify.
//   node scripts/check-dco.mjs <base-sha> <head-sha>
// Exit codes: 0 all signed off, 1 some commits are not, 2 bad usage.
import { execFileSync } from 'node:child_process';

const [base = '', head = ''] = process.argv.slice(2);
// Only full or abbreviated hex object names: nothing that git could read as an option.
const OBJECT_NAME = /^[0-9a-f]{7,64}$/;
if (!OBJECT_NAME.test(base) || !OBJECT_NAME.test(head)) {
  console.error('usage: node scripts/check-dco.mjs <base-sha> <head-sha>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const SIGN_OFF = /^Signed-off-by:[ \t]*[^<>\n]*<([^<>\s]+)>[ \t]*$/gim;
const BOTS = new Set([
  '49699333+dependabot[bot]@users.noreply.github.com',
  '41898282+github-actions[bot]@users.noreply.github.com',
]);

const missing = [];
for (const sha of git('rev-list', '--no-merges', `${base}..${head}`).split('\n').filter(Boolean)) {
  const [email = '', subject = '', body = ''] = git('show', '-s', '--format=%ae%x00%s%x00%B', sha).split('\0');
  const signers = [...body.matchAll(SIGN_OFF)].map((m) => (m[1] ?? '').toLowerCase());
  const ok = BOTS.has(email.toLowerCase()) ? signers.length > 0 : signers.includes(email.toLowerCase());
  if (!ok) missing.push(`  ${sha.slice(0, 12)} ${subject.slice(0, 72)} (author <${email}>)`);
}

if (missing.length === 0) {
  console.log('✓ every commit is signed off (DCO)');
  process.exit(0);
}
console.error(`✗ ${missing.length} commit(s) without a Signed-off-by line from their author:`);
console.error(missing.join('\n'));
console.error(`
Sign them off and update the pull request:
  git rebase --signoff ${base.slice(0, 12)}
  git push --force-with-lease
The sign-off email must match the commit author email. See CONTRIBUTING.md.`);
process.exit(1);
