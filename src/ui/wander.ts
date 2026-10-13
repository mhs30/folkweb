import { BUNDLED_BOOST } from '../lib/lists';
import { loadSettings, loadTrust } from '../lib/storage';
import { wanderPool } from '../lib/trust';
import { parseSafeUrl } from '../lib/url-safety';

function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! % n;
}

/** A random human-made site from your trust circle and the boost lists, or null if there is none. */
export async function pickWanderUrl(): Promise<string | null> {
  const [trust, settings] = await Promise.all([loadTrust(), loadSettings()]);
  const pool = [...wanderPool(trust), ...[...BUNDLED_BOOST, ...settings.userBoost].map((d) => `https://${d}`)]
    .map((u) => parseSafeUrl(u))
    .filter((u): u is URL => u !== null);
  return pool.length ? pool[randomIndex(pool.length)]!.href : null;
}
