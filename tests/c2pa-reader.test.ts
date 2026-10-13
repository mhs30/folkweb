import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import initC2pa, { WasmReader } from '@contentauth/c2pa-wasm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { C2PA_READER_CONTEXT, isRemoteManifestError } from '../src/lib/c2pa-summary';

// The real bundled reader, run in Node: these tests prove what it does on the network.
const WASM = readFileSync(join(__dirname, '..', 'node_modules', '@contentauth', 'c2pa-wasm', 'pkg', 'c2pa_bg.wasm'));

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A 1×1 PNG with no embedded manifest, whose XMP points to a remote one (as an attacker's file would). */
function pngWithRemoteManifest(url: string): Uint8Array {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  const xmp =
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    `<rdf:Description rdf:about="" xmlns:dcterms="http://purl.org/dc/terms/" dcterms:provenance="${url}"/>` +
    '</rdf:RDF></x:xmpmeta>';
  const itxt = Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1'), Buffer.from(xmp, 'utf8')]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('iTXt', itxt),
      chunk('IDAT', deflateSync(Buffer.from([0, 0]))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

async function read(context?: string): Promise<string> {
  try {
    const reader = await WasmReader.fromBytes('image/png', pngWithRemoteManifest('http://192.168.1.1/manifest.c2pa'), context);
    reader.free();
    return 'read';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

beforeAll(async () => {
  await initC2pa({ module_or_path: WASM });
});

afterEach(() => vi.unstubAllGlobals());

describe('bundled C2PA reader stays offline (pre-launch audit N2)', () => {
  it('without Folkweb’s settings, the reader would fetch the address named in the file', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('blocked by test'));
    vi.stubGlobal('fetch', fetchMock);
    await read();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('with Folkweb’s settings it never touches the network: the reader stops at the remote reference', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('blocked by test'));
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await read(C2PA_READER_CONTEXT);
    expect(fetchMock).not.toHaveBeenCalled();
    // Proves the settings were parsed and applied (a bad context fails with a parse error instead).
    expect(outcome).toMatch(/RemoteManifestUrl/);
    expect(isRemoteManifestError(outcome)).toBe(true);
  });
});
