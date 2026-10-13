import { browser } from 'wxt/browser';
import { LIMITS } from './constants';
import { normalizeDomain } from './domains';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from './settings';
import { EMPTY_TRUST, sanitizeTrust, type TrustState } from './trust';

/** All persisted state lives in storage.local and is validated on every read. */

const KEYS = { settings: 'settings', trust: 'trust', allowOnce: 'allowOnce' } as const;

export async function loadSettings(): Promise<Settings> {
  const data = await browser.storage.local.get(KEYS.settings);
  return data[KEYS.settings] === undefined ? DEFAULT_SETTINGS : sanitizeSettings(data[KEYS.settings]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.local.set({ [KEYS.settings]: sanitizeSettings(s) });
}

export async function updateSettings(patch: (s: Settings) => Settings): Promise<Settings> {
  const next = sanitizeSettings(patch(await loadSettings()));
  await saveSettings(next);
  return next;
}

export async function loadTrust(): Promise<TrustState> {
  const data = await browser.storage.local.get(KEYS.trust);
  return data[KEYS.trust] === undefined ? EMPTY_TRUST : sanitizeTrust(data[KEYS.trust]);
}

export async function saveTrust(t: TrustState): Promise<void> {
  await browser.storage.local.set({ [KEYS.trust]: sanitizeTrust(t) });
}

type AllowOnce = Record<string, number>;

async function loadAllowOnce(): Promise<AllowOnce> {
  const data = await browser.storage.local.get(KEYS.allowOnce);
  const raw = data[KEYS.allowOnce];
  const out: AllowOnce = {};
  if (typeof raw === 'object' && raw !== null) {
    const now = Date.now();
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const host = normalizeDomain(k);
      if (host && typeof v === 'number' && v > now) out[host] = v;
    }
  }
  return out;
}

export async function isAllowedOnce(host: string): Promise<boolean> {
  const h = normalizeDomain(host);
  return !!h && (await loadAllowOnce())[h] !== undefined;
}

export async function allowOnce(host: string): Promise<void> {
  const h = normalizeDomain(host);
  if (!h) return;
  const current = await loadAllowOnce();
  current[h] = Date.now() + LIMITS.allowOnceMs;
  await browser.storage.local.set({ [KEYS.allowOnce]: current });
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEYS.settings];
    if (area === 'local' && change) cb(sanitizeSettings(change.newValue));
  });
}

export function onTrustChanged(cb: (t: TrustState) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEYS.trust];
    if (area === 'local' && change) cb(sanitizeTrust(change.newValue));
  });
}
