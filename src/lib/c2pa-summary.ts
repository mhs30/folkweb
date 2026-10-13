/**
 * Turn a C2PA manifest store (the JSON from @contentauth/c2pa-wasm's reader) into a
 * small, honest summary. The input is untrusted: navigate defensively and
 * never render any of it as HTML.
 *
 * Verdicts describe what the credentials *declare*. Absence of credentials
 * means "unknown", never "AI".
 */

export type C2paVerdict = 'ai-generated' | 'ai-assisted' | 'captured' | 'human-made' | 'credentials' | 'none';
export type C2paValidation = 'trusted' | 'valid' | 'untrusted-signer' | 'invalid' | 'unknown';

/**
 * Settings for the bundled C2PA reader (c2pa-rs "context" JSON). The reader has its own network
 * client: by default it fetches remote manifests named inside the file (XMP dcterms:provenance)
 * and could reach any address, outside safeFetch(). Folkweb reads only the bytes it already
 * fetched, so every network path is off. No trust list is bundled, so trust isn't checked:
 * results say "valid" (signature intact, signer not checked), never a made-up "untrusted".
 */
export const C2PA_READER_CONTEXT = JSON.stringify({
  version: 1,
  core: { allowed_network_hosts: [] },
  verify: { remote_manifest_fetch: false, ocsp_fetch: false, verify_trust: false, verify_timestamp_trust: false },
});

/** The file only points to credentials stored at another address, which Folkweb doesn't fetch. */
export function isRemoteManifestError(message: string): boolean {
  return /RemoteManifestUrl/.test(message);
}

export interface C2paSummary {
  verdict: C2paVerdict;
  validation: C2paValidation;
  signer: string | null;
  generator: string | null;
  signedAt: string | null;
  actions: string[];
  sourceTypes: string[];
  ingredientCount: number;
}

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
const AI_GENERATED = new Set(['trainedAlgorithmicMedia']);
const AI_ASSISTED = new Set(['compositeWithTrainedAlgorithmicMedia']);
const CAPTURED = new Set(['digitalCapture', 'negativeFilm', 'positiveFilm', 'print', 'computationalCapture']);
const HUMAN_MADE = new Set(['digitalArt', 'humanEdits', 'minorHumanEdits']);

function rec(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}
function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}
function str(x: unknown, max = 200): string | null {
  return typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null;
}
function pick(o: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}

function sourceTypeName(v: unknown): string | null {
  const s = str(v, 300);
  if (!s) return null;
  return s.startsWith(IPTC) ? s.slice(IPTC.length) : s.split('/').pop() ?? null;
}

export function summarizeManifestStore(store: unknown): C2paSummary {
  const empty: C2paSummary = {
    verdict: 'none',
    validation: 'unknown',
    signer: null,
    generator: null,
    signedAt: null,
    actions: [],
    sourceTypes: [],
    ingredientCount: 0,
  };
  const s = rec(store);
  const manifests = rec(pick(s, 'manifests'));
  const activeLabel = str(pick(s, 'active_manifest', 'activeManifest'), 500);
  const active = manifests && activeLabel ? rec(manifests[activeLabel]) : null;
  if (!active) return empty;

  const actions: string[] = [];
  const sourceTypes = new Set<string>();
  for (const a of arr(pick(active, 'assertions'))) {
    const assertion = rec(a);
    const label = str(pick(assertion, 'label'));
    if (!label || !label.startsWith('c2pa.actions')) continue;
    for (const act of arr(pick(rec(pick(assertion, 'data')), 'actions'))) {
      const action = rec(act);
      const name = str(pick(action, 'action'), 80);
      if (name && actions.length < 50) actions.push(name);
      const st = sourceTypeName(pick(action, 'digitalSourceType', 'digital_source_type'));
      if (st) sourceTypes.add(st);
    }
  }

  const sig = rec(pick(active, 'signature_info', 'signatureInfo'));
  const genInfo = rec(arr(pick(active, 'claim_generator_info', 'claimGeneratorInfo'))[0]);
  const generator =
    str(pick(genInfo, 'name')) ?? str(pick(active, 'claim_generator', 'claimGenerator'));

  const types = [...sourceTypes];
  let verdict: C2paVerdict = 'credentials';
  if (types.some((t) => AI_GENERATED.has(t))) verdict = 'ai-generated';
  else if (types.some((t) => AI_ASSISTED.has(t))) verdict = 'ai-assisted';
  else if (types.some((t) => CAPTURED.has(t))) verdict = 'captured';
  else if (types.some((t) => HUMAN_MADE.has(t))) verdict = 'human-made';

  return {
    verdict,
    validation: summarizeValidation(s),
    signer: str(pick(sig, 'issuer', 'common_name', 'commonName')),
    generator,
    signedAt: str(pick(sig, 'time'), 40),
    actions,
    sourceTypes: types,
    ingredientCount: arr(pick(active, 'ingredients')).length,
  };
}

function failureCodes(s: Record<string, unknown> | null): string[] {
  const codes: string[] = [];
  for (const v of arr(pick(s, 'validation_status', 'validationStatus'))) {
    const c = str(pick(rec(v), 'code'), 120);
    if (c) codes.push(c);
  }
  const results = rec(pick(s, 'validation_results', 'validationResults'));
  const activeRes = rec(pick(results, 'activeManifest', 'active_manifest'));
  for (const v of arr(pick(activeRes, 'failure'))) {
    const c = str(pick(rec(v), 'code'), 120);
    if (c) codes.push(c);
  }
  return codes;
}

function summarizeValidation(s: Record<string, unknown> | null): C2paValidation {
  const state = str(pick(s, 'validation_state', 'validationState'), 40)?.toLowerCase();
  const failures = failureCodes(s);
  const onlyUntrusted = failures.length > 0 && failures.every((c) => c === 'signingCredential.untrusted');
  if (state === 'invalid' || (failures.length > 0 && !onlyUntrusted)) return 'invalid';
  if (onlyUntrusted) return 'untrusted-signer';
  if (state === 'trusted') return 'trusted';
  if (state === 'valid') return 'valid';
  return 'unknown';
}

export const VERDICT_TEXT: Record<C2paVerdict, { icon: string; title: string; detail: string }> = {
  'ai-generated': { icon: '🤖', title: 'Declared AI-generated', detail: 'The credentials say this was made by a generative AI model.' },
  'ai-assisted': { icon: '🧩', title: 'Contains AI-generated parts', detail: 'The credentials say this combines human-made and AI-generated material.' },
  captured: { icon: '📷', title: 'Captured by a device', detail: 'The credentials say this was captured by a camera or scanner.' },
  'human-made': { icon: '✍️', title: 'Declared human-made', detail: 'The credentials say this was made or edited by a person.' },
  credentials: { icon: 'ⓒ', title: 'Has Content Credentials', detail: 'Credentials are present but do not state how the content was made.' },
  none: { icon: '·', title: 'No Content Credentials', detail: 'Nothing is known about this file’s origin. This does not mean it is AI-generated.' },
};

const UNVERIFIED_REASON: Record<Exclude<C2paValidation, 'trusted' | 'invalid'>, string> = {
  valid: 'The signature is intact, but Folkweb doesn’t check signers against a trust list yet, so who signed it is a claim.',
  'untrusted-signer': 'The signature is intact, but the signer couldn’t be confirmed, so anyone could have made this claim.',
  unknown: 'Folkweb could not confirm the signature.',
};

export interface C2paHeadline {
  icon: string;
  title: string;
  detail: string;
  /** Row label for the signer: only a trusted signature confirms who signed. */
  signerLabel: 'Signed by' | 'Claimed signer';
}

/**
 * The headline never looks more certain than the signature (SECURITY.md invariant 10):
 * a declaration is stated plainly only when the signer is on the trust list, a failed
 * validation replaces the declaration, and anything else is labelled an unverified claim.
 */
export function headlineFor(summary: C2paSummary): C2paHeadline {
  const v = VERDICT_TEXT[summary.verdict];
  if (summary.verdict === 'none') return { ...v, signerLabel: 'Claimed signer' };
  if (summary.validation === 'trusted') return { ...v, signerLabel: 'Signed by' };
  if (summary.validation === 'invalid') {
    return {
      icon: '⚠️',
      title: 'Credentials failed validation',
      detail: 'The file or its credentials changed after signing, or the signature is broken. What they declare can’t be relied on.',
      signerLabel: 'Claimed signer',
    };
  }
  const reason = UNVERIFIED_REASON[summary.validation];
  const title = summary.verdict === 'credentials' ? v.title : `Unverified claim: ${v.title.charAt(0).toLowerCase()}${v.title.slice(1)}`;
  return { icon: v.icon, title, detail: `${v.detail} ${reason}`, signerLabel: 'Claimed signer' };
}
