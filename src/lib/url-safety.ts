import { LIMITS } from './constants';

/**
 * URL safety helpers. Every URL that comes from a web page, a filter list or a
 * human.json document is untrusted and must pass through here before the
 * extension navigates to it or fetches it.
 */

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(host: string): boolean {
  if (!host.startsWith('[')) return false;
  const h = host.slice(1, -1).toLowerCase();
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(h)) return true; // link-local fe80::/10
  if (h.startsWith('::ffff:')) return true; // IPv4-mapped: refuse rather than parse
  return false;
}

/** True when the URL is http(s), has no embedded credentials and is not a local/private host. */
export function isSafePublicHttpUrl(input: string | URL): boolean {
  let url: URL;
  try {
    url = typeof input === 'string' ? new URL(input) : input;
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost') return false;
  if (!host.includes('.') && !host.startsWith('[')) return false;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return false;
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return false;
  return true;
}

/** Parse a URL only if it is a safe public http(s) URL; otherwise null. */
export function parseSafeUrl(input: unknown, base?: string): URL | null {
  if (typeof input !== 'string' || input.length > 4096) return null;
  try {
    const url = new URL(input, base);
    return isSafePublicHttpUrl(url) ? url : null;
  } catch {
    return null;
  }
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  accept?: string;
  /** Allowed content-type prefixes, e.g. ['image/', 'video/']. Empty = any. */
  contentTypes?: string[];
}

export class SafeFetchError extends Error {}

/**
 * Fetch a public URL without cookies, with a timeout and a hard size cap.
 * The final (post-redirect) URL is re-checked; the body is streamed and
 * aborted once it exceeds maxBytes.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string; finalUrl: string }> {
  const url = parseSafeUrl(rawUrl);
  if (!url) throw new SafeFetchError('URL is not a public http(s) address');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? LIMITS.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      signal: controller.signal,
      headers: opts.accept ? { Accept: opts.accept } : undefined,
    });
    if (res.url && !isSafePublicHttpUrl(res.url)) throw new SafeFetchError('Redirected to a non-public address');
    if (!res.ok) throw new SafeFetchError(`HTTP ${res.status}`);

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (opts.contentTypes?.length && !opts.contentTypes.some((p) => contentType.startsWith(p))) {
      throw new SafeFetchError(`Unexpected content type: ${contentType || 'none'}`);
    }
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > opts.maxBytes) throw new SafeFetchError('Response too large');

    const reader = res.body?.getReader();
    if (!reader) throw new SafeFetchError('Empty response');
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        controller.abort();
        throw new SafeFetchError('Response too large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(new ArrayBuffer(total));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { bytes, contentType, finalUrl: res.url || url.href };
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    if (controller.signal.aborted) throw new SafeFetchError('Request timed out');
    throw new SafeFetchError('Network error');
  } finally {
    clearTimeout(timer);
  }
}
