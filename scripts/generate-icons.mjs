#!/usr/bin/env node
// Generates the Folkweb logo: three people ("folks") on a warm rounded tile.
// Dependency-free: shapes are drawn with signed-distance tests and 4×4 supersampling,
// then encoded with a tiny PNG writer (node:zlib). The same geometry is written as SVG.
//   node scripts/generate-icons.mjs
// Outputs: public/icon/{16,32,48,96,128}.png, public/icon/logo.svg, site/logo.svg,
//          site/favicon.png (32px) and site/icon-180.png (touch icon).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Geometry on a 128×128 canvas.
const TILE = { r: 30, top: [0xf2, 0x7a, 0x45], bottom: [0xd2, 0x4a, 0x26] };
const BODY_CUT = 106; // bodies are cut flat here, like a bust
const SIDE = { fill: [0xff, 0xe2, 0xd2], heads: [[34, 61, 13], [94, 61, 13]], bodies: [[34, 116, 25], [94, 116, 25]] };
const CENTER = { fill: [0xff, 0xff, 0xff], head: [64, 47, 17.5], body: [64, 117, 30], gap: 4.5 };

const circle = (x, y, [cx, cy, r]) => Math.hypot(x - cx, y - cy) - r;
const body = (x, y, c) => Math.max(circle(x, y, c), y - BODY_CUT);
const roundedRect = (x, y, size, r) => {
  const qx = Math.abs(x - size / 2) - (size / 2 - r);
  const qy = Math.abs(y - size / 2) - (size / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Colour of one sample point (x, y in 0..128), or null when outside the tile. */
function sample(x, y) {
  if (roundedRect(x, y, 128, TILE.r) > 0) return null;
  const bg = mix(TILE.top, TILE.bottom, y / 128);
  const center = Math.min(circle(x, y, CENTER.head), body(x, y, CENTER.body));
  if (center <= 0) return CENTER.fill;
  if (center <= CENTER.gap) return bg; // a sliver of tile colour separates the front person
  const side = Math.min(...SIDE.heads.map((c) => circle(x, y, c)), ...SIDE.bodies.map((c) => body(x, y, c)));
  if (side <= 0) return SIDE.fill;
  return bg;
}

function rgba(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = 4; // 4×4 supersampling
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < s; sy++) {
        for (let sx = 0; sx < s; sx++) {
          const c = sample(((pxi + (sx + 0.5) / s) / size) * 128, ((py + (sy + 0.5) / s) / size) * 128);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (py * size + pxi) * 4;
      if (a) px.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / (s * s)) * 255)], i);
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const pixels = rgba(size);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const bust = ([hx, hy, hr], [bx, by, br]) =>
  `<circle cx="${hx}" cy="${hy}" r="${hr}"/><circle cx="${bx}" cy="${by}" r="${br}" clip-path="url(#cut)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Folkweb">
  <defs>
    <linearGradient id="tile" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="128">
      <stop offset="0" stop-color="${hex(TILE.top)}"/>
      <stop offset="1" stop-color="${hex(TILE.bottom)}"/>
    </linearGradient>
    <clipPath id="cut"><rect width="128" height="${BODY_CUT}"/></clipPath>
  </defs>
  <rect width="128" height="128" rx="${TILE.r}" fill="url(#tile)"/>
  <g fill="${hex(SIDE.fill)}">${bust(SIDE.heads[0], SIDE.bodies[0])}${bust(SIDE.heads[1], SIDE.bodies[1])}</g>
  <g fill="url(#tile)" stroke="url(#tile)" stroke-width="${CENTER.gap * 2}">${bust(CENTER.head, CENTER.body)}</g>
  <g fill="${hex(CENTER.fill)}">${bust(CENTER.head, CENTER.body)}</g>
</svg>
`;

mkdirSync('public/icon', { recursive: true });
for (const size of [16, 32, 48, 96, 128]) writeFileSync(`public/icon/${size}.png`, png(size));
writeFileSync('public/icon/logo.svg', svg);
mkdirSync('site', { recursive: true });
writeFileSync('site/logo.svg', svg);
writeFileSync('site/favicon.png', png(32));
writeFileSync('site/icon-180.png', png(180));
console.log('icons written to public/icon/ and site/');
