#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version, plus how to verify the downloads.
//   node scripts/release-notes.mjs v0.2.0
import { readFileSync } from 'node:fs';

const tag = process.argv[2] ?? '';
const version = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: node scripts/release-notes.mjs vX.Y.Z');
  process.exit(1);
}
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const lines = changelog.split('\n');
const heading = `## [${version}]`;
const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const next = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
const section = lines.slice(start, next < 0 ? lines.length : next).join('\n').trim();

console.log(`${section}

## Verify these files

Each zip was built from tag \`${tag}\` by GitHub Actions, with signed build provenance:

\`\`\`bash
gh attestation verify folkweb-${version}-chrome.zip --repo mhs30/folkweb
shasum -a 256 -c SHA256SUMS.txt
\`\`\`

Builds are reproducible: \`npm ci && npm run zip && npm run zip:firefox\` on this tag produces the same files.
`);
