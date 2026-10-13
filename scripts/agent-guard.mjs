#!/usr/bin/env node
// PreToolUse guard for AI agents working on Folkweb (see AGENTS.md "Safety boundaries").
// Reads the hook payload (JSON) on stdin and answers with a permission decision:
//   deny — never allowed for agents (publishing, secrets, piping remote scripts, force-push…)
//   ask  — needs explicit human approval (guardrails, permissions/CSP, dependencies, lists)
//   (no output) — allowed
// It is a backstop for honest mistakes, not a sandbox. When it can't read the tool call it
// asks (fails closed). Keep this file small and auditable. Agents must not edit it without
// human approval.
import { readFileSync } from 'node:fs';

function readPayload() {
  try {
    const p = JSON.parse(readFileSync(0, 'utf8'));
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

function answer(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: `Folkweb guard: ${reason}` },
    }),
  );
  process.exit(0);
}

const payload = readPayload();
const toolName = String(payload?.tool_name ?? payload?.toolName ?? payload?.tool ?? '');
if (!payload || !toolName) answer('ask', 'could not read this tool call; a human should check it.');

const toolInput = payload.tool_input ?? payload.toolInput ?? payload.input ?? {};
const text = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
// Paths are matched lower-case: macOS and Windows file systems ignore case (Wxt.config.ts is wxt.config.ts).
const norm = text.replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase();
// Shell rules match the raw command line, not its JSON encoding.
const rawCommand = typeof toolInput?.command === 'string' ? toolInput.command : typeof toolInput?.cmd === 'string' ? toolInput.cmd : text;
const command = rawCommand.toLowerCase();
// Path arguments (view, grep, edit, create…): not file contents or search patterns.
const pathArgs = ['path', 'file_path', 'filePath', 'paths', 'filePaths', 'directory', 'source', 'destination']
  .flatMap((k) => [toolInput?.[k]].flat())
  .filter((v) => typeof v === 'string')
  .join(' ')
  .replace(/\\/g, '/')
  .toLowerCase();

const isShell = /bash|shell|terminal|exec|run_?command|command/i.test(toolName);
const isWrite = /edit|write|create|replace|patch|insert|delete|move|rename|multi/i.test(toolName);

// Paths may appear after "/", whitespace, quotes or "=" (JSON payloads and shell commands).
const B = String.raw`(?:^|[\/\s'"=:<>])`;
const E = String.raw`(?:$|[\s'";|&)>])`;
const P = (body) => new RegExp(B + body);
const SECRET_PATH = P(String.raw`(\.env(\.[\w-]+)?|id_rsa|id_ed25519|id_ecdsa|[\w-][\w.-]*\.(pem|key|p12|pfx))${E}`);

const DENY_COMMANDS = [
  [/\bnpm\s+publish\b|\byarn\s+publish\b|\bpnpm\s+publish\b/, 'Publishing packages is done by maintainers only.'],
  [/\bweb-ext\s+sign\b|wxt-publish-extension|\bwxt\s+submit\b|chrome-webstore-upload|addons\.mozilla\.org\/api\/v5\/addons\/upload/, 'Publishing to extension stores is done by maintainers only.'],
  [/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/, 'Piping remote scripts into a shell is forbidden.'],
  [/\bgit\s+push\b[^;&|]*(\s--force(-with-lease|-if-includes)?\b|\s-[a-z]*f[a-z]*\b|\s\+[^\s]+)/, 'Force-pushing is forbidden for agents.'],
  [/\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$home|\.\.?\/?)(\s|$)/, 'Recursive delete of root/home/project is forbidden.'],
  [/\bsudo\b/, 'sudo is forbidden.'],
  [/ignore-scripts\s*(=|\s)\s*false|--no-ignore-scripts|npm\s+config\s+set\s+ignore-scripts/, 'Install scripts must stay disabled (.npmrc).'],
  [SECRET_PATH, 'Reading or copying secrets is forbidden.'],
  [/\b(printenv|env|export\s+-p|declare\s+-p|set|compgen\s+-v)\s*($|[;&|>])|\b(node|deno|bun)\b[^;&|]*\s(-e|-p|--eval|--print)\b[^;&|]*process\.env(?![.[\w])/, 'Dumping environment variables is forbidden.'],
];

const ASK_COMMANDS = [
  [/\bnpm\s+(?:i|install|add)(?:\s+-{1,2}[\w=-]+)*\s+[^-\s;&|]/, 'Adding dependencies needs human approval (supply chain).'],
  [/\bnpm\s+(?:uninstall|remove|rm|un|update|up|upgrade|exec|x)\b|\bnpm\s+pkg\s+(?:set|delete)\b/, 'Dependency changes and running packages need human approval (supply chain).'],
  [/\bnpx\s+(?:[^;&|]*\s)?(?:-y|--yes|-p|--package)\b|\bnpx\s+(?:-{1,2}[\w=-]+\s+)*@?[\w.-]+(?:\/[\w.-]+)?@[\w.^~<>=*-]+/, 'Downloading and running a package needs human approval (supply chain).'],
  [/\b(pnpm|yarn)\s+(add|dlx)\b|\bbunx\b/, 'Adding or running packages needs human approval (supply chain).'],
  [/\bgit\s+push\b/, 'Pushing needs human approval.'],
  [/\bnpm\s+audit\s+fix\b/, 'Dependency changes need human approval.'],
];

const DENY_PATHS = [[P(String.raw`\.env(\.[\w-]+)?${E}|\.(pem|key)${E}`), 'Agents must not write secret files.']];

const ASK_PATHS = [
  [P(String.raw`\.github\/`), 'Changing agent guardrails, CI or repository settings needs human approval.'],
  [P(String.raw`(agents\.md|security\.md)${E}`), 'Changing agent rules or the security policy needs human approval.'],
  [P(String.raw`scripts\/`), 'Changing project scripts and security tooling needs human approval.'],
  [P(String.raw`(eslint\.config\.js|\.npmrc|\.gitignore|tsconfig\.json|vitest\.config\.ts|playwright\.config\.ts)${E}`), 'Changing lint, test, npm or git config needs human approval.'],
  [P(String.raw`wxt\.config\.ts${E}`), 'Manifest, permissions and CSP changes need human approval.'],
  [P(String.raw`package(-lock)?\.json${E}`), 'Dependency changes need human approval.'],
  [P(String.raw`lists\/`), 'Curator list changes need human approval (docs/LIST-FORMAT.md).'],
];

// Shell commands that can write files: redirects, in-place edits, file tools, git, patch, and
// inline scripts (node -e, python -c, heredocs) that could write without naming a write tool.
const SHELL_WRITES =
  /(>|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*[pie]|\b(mv|cp|rm|truncate|ln|install|dd|touch)\b|\bgit\s+(checkout|restore|rm|mv|apply|am|stash|reset)\b|\bpatch\b|\b(node|deno|bun)\s+(-e|--eval|-p|--print)\b|\b(python3?|ruby|perl)\s+(-[a-z]*[ce]|-\s)|<<)/;

function decide() {
  if (isShell) {
    for (const [re, reason] of DENY_COMMANDS) if (re.test(command)) return ['deny', reason];
    for (const [re, reason] of ASK_COMMANDS) if (re.test(command)) return ['ask', reason];
    if (SHELL_WRITES.test(command)) {
      for (const [re, reason] of ASK_PATHS) if (re.test(command)) return ['ask', reason];
    }
    return null;
  }
  if (isWrite) {
    // Match the file being written, not its content. Tools without a path argument (patches)
    // are matched on their whole input, so they can't slip through.
    const target = pathArgs || norm;
    for (const [re, reason] of DENY_PATHS) if (re.test(target)) return ['deny', reason];
    for (const [re, reason] of ASK_PATHS) if (re.test(target)) return ['ask', reason];
    return null;
  }
  // Read tools: no secrets, whatever the tool is called.
  if (SECRET_PATH.test(pathArgs)) return ['deny', 'Reading secrets is forbidden.'];
  return null;
}

const decision = decide();
if (decision) answer(decision[0], decision[1]);
process.exit(0);
