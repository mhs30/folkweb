#!/usr/bin/env node
// PreToolUse guard for AI agents working on Folkweb (see AGENTS.md "Safety boundaries").
// Reads the hook payload (JSON) on stdin and answers with a permission decision:
//   deny — never allowed for agents (publishing, secrets, piping remote scripts, force-push…)
//   ask  — needs explicit human approval (guardrails, permissions/CSP, dependencies, lists)
//   (no output) — allowed
// Keep this file small and auditable. Agents must not edit it without human approval.
import { readFileSync } from 'node:fs';

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

const payload = readPayload();
const toolName = String(payload.tool_name ?? payload.toolName ?? payload.tool ?? '');
const toolInput = payload.tool_input ?? payload.toolInput ?? payload.input ?? {};
const text = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
const norm = text.replace(/\\\\/g, '/').replace(/\\/g, '/');
// Shell rules match the raw command line, not its JSON encoding.
const command = typeof toolInput?.command === 'string' ? toolInput.command : typeof toolInput?.cmd === 'string' ? toolInput.cmd : norm;

const isShell = /bash|shell|terminal|exec|run_?command|command/i.test(toolName);
const isWrite = /edit|write|create|replace|patch|insert|delete|move|rename|multi/i.test(toolName);

const DENY_COMMANDS = [
  [/\bnpm\s+publish\b|\byarn\s+publish\b|\bpnpm\s+publish\b/, 'Publishing packages is done by maintainers only.'],
  [/\bweb-ext\s+sign\b|wxt-publish-extension|\bwxt\s+submit\b|chrome-webstore-upload|addons\.mozilla\.org\/api\/v5\/addons\/upload/, 'Publishing to extension stores is done by maintainers only.'],
  [/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/, 'Piping remote scripts into a shell is forbidden.'],
  [/\bgit\s+push\b[^;&|]*(--force\b|\s-f\b|--force-with-lease\b)/, 'Force-pushing is forbidden for agents.'],
  [/\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\.\.?\/?)(\s|$)/, 'Recursive delete of root/home/project is forbidden.'],
  [/\bsudo\b/, 'sudo is forbidden.'],
  [/ignore-scripts\s*(=|\s)\s*false|--no-ignore-scripts|npm\s+config\s+set\s+ignore-scripts/, 'Install scripts must stay disabled (.npmrc).'],
  [/\b(cat|less|more|head|tail|type|bat)\b[^;&|]*(\.env\b|id_rsa|id_ed25519|\.pem\b|\.key\b)/, 'Reading secrets is forbidden.'],
  [/\b(printenv|env)\s*($|[;&|>])/, 'Dumping environment variables is forbidden.'],
];

const ASK_COMMANDS = [
  [/\bnpm\s+(?:i|install|add)(?:\s+-{1,2}[\w=-]+)*\s+[^-\s;&|]/, 'Adding dependencies needs human approval (supply chain).'],
  [/\b(pnpm|yarn)\s+add\b/, 'Adding dependencies needs human approval (supply chain).'],
  [/\bgit\s+push\b/, 'Pushing needs human approval.'],
  [/\bnpm\s+audit\s+fix\b/, 'Dependency changes need human approval.'],
];

// Paths may appear after "/", whitespace, quotes or "=" (JSON payloads and shell commands).
const B = String.raw`(?:^|[\/\s'"=:])`;
const E = String.raw`(?:$|[\s'"])`;
const P = (body) => new RegExp(B + body);

const DENY_PATHS = [[P(String.raw`\.env(\.[\w-]+)?${E}|\.(pem|key)${E}`), 'Agents must not write secret files.']];

const ASK_PATHS = [
  [P(String.raw`\.github\/(hooks|agents|instructions|skills|workflows)\/`), 'Changing agent guardrails or CI needs human approval.'],
  [P(String.raw`(AGENTS\.md|SECURITY\.md)${E}`), 'Changing agent rules or the security policy needs human approval.'],
  [P(String.raw`scripts\/(agent-guard|security-scan)\.mjs`), 'Changing security tooling needs human approval.'],
  [P(String.raw`(eslint\.config\.js|\.npmrc)${E}`), 'Changing security lint or npm config needs human approval.'],
  [P(String.raw`wxt\.config\.ts${E}`), 'Manifest, permissions and CSP changes need human approval.'],
  [P(String.raw`package(-lock)?\.json${E}`), 'Dependency changes need human approval.'],
  [P(String.raw`lists\/`), 'Curator list changes need human approval (docs/LIST-FORMAT.md).'],
];

function decide() {
  if (isShell || !isWrite) {
    for (const [re, reason] of DENY_COMMANDS) if (re.test(command)) return ['deny', reason];
    for (const [re, reason] of ASK_COMMANDS) if (re.test(command)) return ['ask', reason];
  }
  if (isWrite) {
    for (const [re, reason] of DENY_PATHS) if (re.test(norm)) return ['deny', reason];
    for (const [re, reason] of ASK_PATHS) if (re.test(norm)) return ['ask', reason];
  }
  // Shell commands that modify guarded files (redirects, sed -i, tee, mv, cp, rm, git checkout/restore).
  if (isShell && /(>|\btee\b|\bsed\s+-i|\bperl\s+-pi|\b(mv|cp|rm|truncate)\b|\bgit\s+(checkout|restore|rm)\b)/.test(command)) {
    for (const [re, reason] of ASK_PATHS) if (re.test(command)) return ['ask', reason];
  }
  return null;
}

const decision = decide();
if (decision) {
  const [permissionDecision, permissionDecisionReason] = decision;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: `Folkweb guard: ${permissionDecisionReason}` },
    }),
  );
}
process.exit(0);
