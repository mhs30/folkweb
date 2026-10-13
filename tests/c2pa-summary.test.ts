import { describe, expect, it } from 'vitest';
import { summarizeManifestStore } from '../src/lib/c2pa-summary';

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

function store(sourceType: string | null, extra: Record<string, unknown> = {}) {
  return {
    active_manifest: 'urn:uuid:1',
    manifests: {
      'urn:uuid:1': {
        claim_generator_info: [{ name: 'Test Camera App', version: '1.0' }],
        signature_info: { issuer: 'Example Signer Inc.', time: '2026-01-01T00:00:00Z' },
        ingredients: [{}],
        assertions: [
          {
            label: 'c2pa.actions.v2',
            data: { actions: [{ action: 'c2pa.created', ...(sourceType ? { digitalSourceType: IPTC + sourceType } : {}) }] },
          },
        ],
      },
    },
    ...extra,
  };
}

describe('summarizeManifestStore', () => {
  it('returns "none" for missing or malformed input', () => {
    for (const input of [null, undefined, 42, 'x', {}, { manifests: {} }, { active_manifest: 'a', manifests: { a: 'bad' } }]) {
      expect(summarizeManifestStore(input).verdict).toBe('none');
    }
  });

  it.each([
    ['trainedAlgorithmicMedia', 'ai-generated'],
    ['compositeWithTrainedAlgorithmicMedia', 'ai-assisted'],
    ['digitalCapture', 'captured'],
    ['digitalArt', 'human-made'],
    [null, 'credentials'],
  ])('maps %s → %s', (st, verdict) => {
    expect(summarizeManifestStore(store(st)).verdict).toBe(verdict);
  });

  it('AI declaration wins over capture when both are present', () => {
    const s = store('digitalCapture');
    (s.manifests['urn:uuid:1'].assertions[0]!.data.actions as unknown[]).push({ action: 'c2pa.edited', digitalSourceType: IPTC + 'trainedAlgorithmicMedia' });
    expect(summarizeManifestStore(s).verdict).toBe('ai-generated');
  });

  it('extracts signer, generator, time and counts', () => {
    const s = summarizeManifestStore(store('digitalCapture', { validation_state: 'Trusted' }));
    expect(s).toMatchObject({
      signer: 'Example Signer Inc.',
      generator: 'Test Camera App',
      signedAt: '2026-01-01T00:00:00Z',
      actions: ['c2pa.created'],
      ingredientCount: 1,
      validation: 'trusted',
    });
  });

  it.each([
    [{ validation_state: 'Valid' }, 'valid'],
    [{ validation_state: 'Invalid' }, 'invalid'],
    [{ validation_status: [{ code: 'assertion.hashedURI.mismatch' }] }, 'invalid'],
    [{ validation_status: [{ code: 'signingCredential.untrusted' }] }, 'untrusted-signer'],
    [{}, 'unknown'],
  ])('validation %j → %s', (extra, expected) => {
    expect(summarizeManifestStore(store('digitalCapture', extra)).validation).toBe(expected);
  });

  it('truncates hostile long strings', () => {
    const s = store(null);
    (s.manifests['urn:uuid:1'].signature_info as { issuer: string }).issuer = 'x'.repeat(10_000);
    expect(summarizeManifestStore(s).signer?.length).toBe(200);
  });
});
