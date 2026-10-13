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
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224
  );
}

/** The eight 16-bit groups of a serialized IPv6 address (as the URL parser writes it), or null. */
function ipv6Groups(h: string): number[] | null {
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const part = (s: string) => (s ? s.split(':') : []);
  const head = part(halves[0] ?? '');
  const tail = part(halves[1] ?? '');
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * IPv6 literals are allowed only in global unicast space (2000::/3), minus ranges that
 * embed IPv4 addresses or are reserved. Everything else (loopback, unspecified,
 * IPv4-mapped and -compatible, NAT64, unique local, link- and site-local, multicast) is
 * outside 2000::/3 and refused.
 */
function isPrivateIPv6(host: string): boolean {
  if (!host.startsWith('[')) return false;
  const g = ipv6Groups(host.slice(1, -1).toLowerCase());
  if (!g) return true;
  const [g0 = 0, g1 = 0] = g;
  if ((g0 & 0xe000) !== 0x2000) return true; // not 2000::/3
  if (g0 === 0x2002) return true; // 6to4 (embeds IPv4)
  if (g0 === 0x2001 && g1 === 0x0000) return true; // Teredo (embeds IPv4)
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2001 && g1 < 0x0200) return true; // IETF protocol assignments 2001::/23
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
  // "localhost." and "nas.local." are the same names as without the final dot.
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.endsWith('.') || host === 'localhost') return false;
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
  /**
   * 'follow' (default): follow redirects, then re-check the final address before reading.
   * 'refuse': fail on any redirect. Use it when the address is already known, like a
   * same-origin human.json, so no request ever leaves for a redirect target.
   */
  redirects?: 'follow' | 'refuse';
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
      // Browsers hide a redirect's Location even from extensions, so redirects can't be
      // checked hop by hop: either refuse them, or follow and check where they ended.
      redirect: opts.redirects === 'refuse' ? 'manual' : 'follow',
      signal: controller.signal,
      headers: opts.accept ? { Accept: opts.accept } : undefined,
    });
    if (res.type === 'opaqueredirect') throw new SafeFetchError('Redirects are not followed for this address');
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
