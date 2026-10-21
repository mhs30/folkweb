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
// Shell rules match the raw command line, not its JSON encoding. Git's global options
// (`git -C dir -c k=v push`) are dropped first, so rules see `git push`.
const rawCommand = typeof toolInput?.command === 'string' ? toolInput.command : typeof toolInput?.cmd === 'string' ? toolInput.cmd : text;
function tokenizeShell(input) {
  const tokens = [];
  const separators = ';|&<>()`\n';
  let cursor = 0;
  while (cursor < input.length) {
    if (/\s/.test(input[cursor])) {
      cursor++;
      continue;
    }
    if (input[cursor] === '#') {
      while (cursor < input.length && input[cursor] !== '\n') cursor++;
      continue;
    }
    const start = cursor;
    if (separators.includes(input[cursor])) {
      tokens.push({ start, end: ++cursor, value: '', separator: true });
      continue;
    }

    let value = '';
    let quote = '';
    while (cursor < input.length) {
      const char = input[cursor];
      if (quote) {
        if (char === quote) {
          quote = '';
          cursor++;
        } else if (char === '\\' && quote === '"' && cursor + 1 < input.length) {
          value += input[cursor + 1];
          cursor += 2;
        } else {
          value += char;
          cursor++;
        }
      } else if (char === "'" || char === '"') {
        quote = char;
        cursor++;
      } else if (char === '\\') {
        if (cursor + 1 >= input.length) return null;
        value += input[cursor + 1];
        cursor += 2;
      } else if (/\s/.test(char) || separators.includes(char)) {
        break;
      } else {
        value += char;
        cursor++;
      }
    }
    if (quote) return null;
    tokens.push({ start, end: cursor, value, separator: false });
  }
  return tokens;
}

function isGitToken(token) {
  return !token.separator && (token.value === 'git' || token.value.endsWith('/git'));
}

function isGitGlobalOption(value) {
  if (/^--[a-z][\w-]*(?:=.*)?$/.test(value)) return true;
  return /^-[a-z]+(?:=.*)?$/.test(value);
}

function takesSeparateValue(option) {
  return ['--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'].includes(option) || option === '-c';
}

function normalizeGitGlobalOptions(input) {
  const tokens = tokenizeShell(input);
  if (!tokens) return null;
  const removed = [];

  for (let i = 0; i < tokens.length; i++) {
    if (!isGitToken(tokens[i])) continue;
    let next = i + 1;
    while (next < tokens.length && !tokens[next].separator) {
      const token = tokens[next];
      const [option = '', inlineValue] = token.value.split('=', 2);
      if (!isGitGlobalOption(token.value)) break;

      removed.push(token);
      next++;
      if (inlineValue === undefined && takesSeparateValue(option.toLowerCase())) {
        if (next >= tokens.length || tokens[next].separator) break;
        removed.push(tokens[next]);
        next++;
      }
    }
    i = next - 1;
  }

  if (removed.length === 0) return input;
  const chars = input.split('');
  for (const token of removed) {
    for (let i = token.start; i < token.end; i++) chars[i] = ' ';
  }
  return chars.join('');
}

const SHELLS = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh', 'fish']);

function nestedShellCommands(tokens) {
  const commands = [];
  let opaque = false;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].separator || !SHELLS.has(tokens[i].value.split('/').at(-1))) continue;
    let end = i + 1;
    while (end < tokens.length && !tokens[end].separator) end++;
    let commandIndex = -1;
    for (let j = i + 1; j < end; j++) {
      const arg = tokens[j].value;
      if (arg === '-c' || arg === '--command' || (/^-[^-]*c/.test(arg) && arg !== '-')) {
        commandIndex = j + 1;
        break;
      }
    }
    if (commandIndex === -1) {
      if (end > i + 1) opaque = true;
    } else if (commandIndex >= end) {
      opaque = true;
    } else {
      commands.push(tokens[commandIndex].value);
    }
    i = end - 1;
  }
  return { commands, opaque };
}

function findSubstitutionEnd(input, start) {
  if (input[start] === '`') {
    for (let i = start + 1; i < input.length; i++) {
      if (input[i] === '\\') i++;
      else if (input[i] === '`') return i;
    }
    return -1;
  }

  let depth = 1;
  let quote = '';
  for (let i = start + 2; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === '\\' && quote === '"' && i + 1 < input.length) i++;
      else if (char === quote) quote = '';
      else if (quote === '"' && char === '$' && input[i + 1] === '(') {
        depth++;
        i++;
      }
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '\\' && i + 1 < input.length) i++;
    else if (char === '$' && input[i + 1] === '(') {
      depth++;
      i++;
    } else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return i;
  }
  return -1;
}

function shellSubstitutions(input) {
  const commands = [];
  let quote = '';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote === "'") {
      if (char === "'") quote = '';
      continue;
    }
    if (char === '\\' && quote !== "'" && i + 1 < input.length) {
      i++;
      continue;
    }
    if (char === "'" && !quote) {
      quote = "'";
      continue;
    }
    if (char === '"' && quote === '"') {
      quote = '';
      continue;
    }
    if (char === '"' && !quote) {
      quote = '"';
      continue;
    }
    if (quote !== "'" && ((char === '$' && input[i + 1] === '(') || (char === '`' && quote !== "'"))) {
      const start = char === '`' ? i : i + 1;
      const end = findSubstitutionEnd(input, start);
      if (end === -1) return null;
      commands.push(input.slice(char === '`' ? i + 1 : i + 2, end));
      i = end;
    }
  }
  return commands;
}

function inspectCommands(input) {
  const commands = [];
  const pending = [{ text: input, depth: 0 }];
  let opaque = false;
  let parseFailed = false;
  let cursor = 0;
  while (cursor < pending.length) {
    const { text: current, depth } = pending[cursor++];
    commands.push(current.toLowerCase());
    const tokens = tokenizeShell(current);
    if (!tokens) {
      parseFailed = true;
      continue;
    }
    const nested = nestedShellCommands(tokens);
    opaque ||= nested.opaque;
    const substitutions = shellSubstitutions(current);
    if (!substitutions) {
      parseFailed = true;
      continue;
    }
    if (depth >= 32 && (nested.commands.length > 0 || substitutions.length > 0)) {
      return { commands, opaque: true, parseFailed };
    }
    pending.push(...nested.commands.map((text) => ({ text, depth: depth + 1 })));
    pending.push(...substitutions.map((text) => ({ text, depth: depth + 1 })));
  }
  return { commands, opaque, parseFailed };
}

const inspectedCommands = inspectCommands(rawCommand);
// Path arguments (view, grep, glob, edit, create…): not file contents or search patterns.
const pathKeys = ['path', 'file_path', 'filePath', 'paths', 'filePaths', 'directory', 'source', 'destination', 'glob'];
if (/glob|find/i.test(toolName)) pathKeys.push('pattern');
const pathArgs = pathKeys
  .flatMap((k) => [toolInput?.[k]].flat())
  .filter((v) => typeof v === 'string')
  .join(' ')
  .replace(/\\/g, '/')
  .toLowerCase();

const isShell = /bash|shell|terminal|exec|run_?command|command/i.test(toolName);
const isWrite = /edit|write|create|replace|patch|insert|delete|move|rename|multi/i.test(toolName);
// Tools (e.g. MCP) that change GitHub directly instead of the working tree: a write verb on a GitHub object.
const isGitHubWrite =
  /merge_pull_request|push_files|create_or_update_file|(merge|push|update|delete|fork|rerun|cancel|run|dismiss)_?(files?|release|ref|repo|repository|workflow|secret|ruleset|branch|tag)|create_?(release|ref|repo|repository|secret|ruleset|branch|tag)/i.test(toolName);

// Paths may appear after "/", whitespace, quotes or "=" (JSON payloads and shell commands).
const B = String.raw`(?:^|[\/\s'"=:<>])`;
const E = String.raw`(?:$|[\s'";|&)>*])`;
const P = (body) => new RegExp(B + body);
const SECRET_PATH = P(String.raw`(\.env(\.[\w*-]+)?|id_rsa|id_ed25519|id_ecdsa|[\w*-][\w.*-]*\.(pem|key|p12|pfx))${E}`);

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
  // Making a repository public publishes its whole history. Only a maintainer does that, by hand.
  [
    /--accept-visibility-change-consequences|\bgh\s+repo\s+(edit|create)\b[^;&|]*--(visibility|public)\b|\b(gh\s+api|api\.github\.com)\b[^;&|]*\b(visibility|private)\b[^;&|]*(public|false)|\b(gh\s+api|api\.github\.com)\b[^;&|]*(public|false)[^;&|]*\b(visibility|private)\b/,
    'Changing repository visibility is done by a maintainer, by hand, never by an agent.',
  ],
  [/\bgo-public\.sh\b(?![^;&|]*--dry-run)/, 'ops/go-public.sh changes GitHub settings: a maintainer runs it (agents may use --dry-run).'],
  // Releases and tags are made by maintainers only (docs/RELEASING.md).
  [/\bgh\s+release\s+(create|upload|edit|delete)\b/, 'Releases are published by maintainers only.'],
  [/\bgit\s+tag\b(?!\s*($|[;&|]|\s(-l|--list|-n\d*|--contains|--points-at)\b))/, 'Agents never create or change tags; releases start from a maintainer’s tag.'],
  [/\bgit\s+push\b[^;&|]*(\s--tags\b|\s--follow-tags\b|refs\/tags\/|\sv\d+\.\d+)/, 'Agents never push tags; releases start from a maintainer’s tag.'],
  [/\bgh\s+pr\s+merge\b[^;&|]*\s--admin\b/, 'Bypassing branch rules is forbidden.'],
];

const ASK_COMMANDS = [
  [/\bnpm\s+(?:i|install|add)(?:\s+-{1,2}[\w=-]+)*\s+[^-\s;&|]/, 'Adding dependencies needs human approval (supply chain).'],
  [/\bnpm\s+(?:uninstall|remove|rm|un|update|up|upgrade|exec|x)\b|\bnpm\s+pkg\s+(?:set|delete)\b/, 'Dependency changes and running packages need human approval (supply chain).'],
  [/\bnpx\s+(?:[^;&|]*\s)?(?:-y|--yes|-p|--package)\b|\bnpx\s+(?:-{1,2}[\w=-]+\s+)*@?[\w.-]+(?:\/[\w.-]+)?@[\w.^~<>=*-]+/, 'Downloading and running a package needs human approval (supply chain).'],
  [/\b(pnpm|yarn)\s+(add|dlx)\b|\bbunx\b/, 'Adding or running packages needs human approval (supply chain).'],
  [/\bgit\s+push\b/, 'Pushing needs human approval.'],
  [/\bnpm\s+audit\s+fix\b/, 'Dependency changes need human approval.'],
  [
    /\bgh\s+(pr\s+merge|workflow\s+(run|enable|disable)|run\s+(rerun|cancel|delete)|secret|variable|ruleset|cache\s+delete|label\s+(create|edit|delete)|repo\s+(delete|archive|unarchive|rename|transfer|sync|deploy-key))\b/,
    'Changing things on GitHub needs human approval.',
  ],
  [/\bgh\s+api\b[^;&|]*(\s-x\s*(post|put|patch|delete)\b|\s--method[\s=]*(post|put|patch|delete)\b|\s(-f|--field|--raw-field|--input)\b)/, 'Writing through the GitHub API needs human approval.'],
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

// Shell commands that can write files: redirects, in-place edits, file tools, git, patch, downloads,
// archives, and inline scripts (node -e, python -c, heredocs) that could write without naming a write tool.
const SHELL_WRITES =
  /(>|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*[pie]|\b(mv|cp|rm|truncate|ln|install|dd|touch|chmod|rsync|unzip|cpio|wget)\b|\btar\s+[^;&|]*\b-?[a-z]*x|\bcurl\b[^;&|]*\s(-o|--output|--remote-name)\b|\bgit\s+(checkout|restore|rm|mv|apply|am|stash|reset)\b|\bpatch\b|\b(node|deno|bun)\s+(-e|--eval|-p|--print)\b|\b(python3?|ruby|perl)\s+(-[a-z]*[ce]|-\s)|<<)/;

function decide() {
  if (isShell) {
    const commands = inspectedCommands.commands.flatMap((entry) => {
      const normalized = normalizeGitGlobalOptions(entry);
      return normalized === null ? [entry] : [entry, normalized];
    });
    for (const command of commands) {
      for (const [re, reason] of DENY_COMMANDS) if (re.test(command)) return ['deny', reason];
    }
    if (inspectedCommands.parseFailed || inspectedCommands.opaque) {
      return ['ask', 'could not safely inspect shell quoting or wrapper; a human should check it.'];
    }
    for (const command of commands) {
      for (const [re, reason] of ASK_COMMANDS) if (re.test(command)) return ['ask', reason];
    }
    for (const command of commands) {
      if (SHELL_WRITES.test(command)) {
        for (const [re, reason] of ASK_PATHS) if (re.test(command)) return ['ask', reason];
      }
    }
    return null;
  }
  if (isGitHubWrite) return ['ask', 'Changing things on GitHub needs human approval.'];
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
