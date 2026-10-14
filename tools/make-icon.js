#!/usr/bin/env node
/* Genera app/icon.png (512x512) senza dipendenze esterne. Uso: node tools/make-icon.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;
const px = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a) {
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

const R = 96; // raggio angoli
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    // rettangolo arrotondato
    const cx = x < R ? R : x > S - R ? S - R : x;
    const cy = y < R ? R : y > S - R ? S - R : y;
    const d = Math.hypot(x - cx, y - cy);
    if (d > R) { set(x, y, 0, 0, 0, 0); continue; }
    const t = (x + y) / (2 * S);
    // gradiente blu -> viola -> rosso (Prime / Netflix)
    let r = Math.round(26 + t * 200), g = Math.round(152 - t * 130), b = Math.round(255 - t * 120);
    // triangolo "play"
    const ax = 200, ay = 150, bx = 200, by = 362, qx = 372, qy = 256;
    const s1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const s2 = (x - qx) * (by - qy) - (bx - qx) * (y - qy);
    const s3 = (x - ax) * (qy - ay) - (qx - ax) * (y - ay);
    const neg = s1 < 0 || s2 < 0 || s3 < 0, pos = s1 > 0 || s2 > 0 || s3 > 0;
    if (!(neg && pos)) { r = g = b = 255; }
    set(x, y, r, g, b, 255);
  }
}

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
]);
const out = path.join(__dirname, '..', 'app', 'icon.png');
fs.writeFileSync(out, png);
console.log('Creato', out, png.length, 'byte');
