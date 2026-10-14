#!/usr/bin/env node
/*
 * Crea i pacchetti in dist/:
 *   dist/NovaPlay.wgt            pacchetto Samsung Tizen (firmato se e' disponibile la CLI "tizen")
 *   dist/usb/NovaPlay/           cartella da copiare sulla chiavetta USB (Hisense / browser)
 *   dist/NovaPlay-USB.zip        stessa cartella compressa
 *
 * Uso:  node tools/build.js
 *       TIZEN_PROFILE=mio_profilo node tools/build.js   (firma con Tizen Studio CLI)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const DIST = path.join(ROOT, 'dist');

function walk(dir, base = dir, out = []) {
  for (const n of fs.readdirSync(dir).sort()) {
    if (n.startsWith('.')) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/* --- zip minimale (deflate) --- */
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zip(entries, outFile) {
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.data, crc = crc32(data), comp = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(useDeflate ? 8 : 0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(useDeflate ? 8 : 0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += h.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(outFile, Buffer.concat(parts.concat([cd, end])));
}

function copyDir(src, dst) {
  for (const rel of walk(src)) {
    const to = path.join(dst, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, rel), to);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const files = walk(APP);

/* --- Samsung Tizen (.wgt) --- */
const wgt = path.join(DIST, 'NovaPlay.wgt');
const profile = process.env.TIZEN_PROFILE;
let signed = false;
if (profile) {
  try {
    const tmp = path.join(DIST, 'tizen-src');
    copyDir(APP, tmp);
    execFileSync('tizen', ['package', '-t', 'wgt', '-s', profile, '--', tmp], { stdio: 'inherit' });
    const made = fs.readdirSync(tmp).find((f) => f.endsWith('.wgt'));
    if (made) { fs.renameSync(path.join(tmp, made), wgt); signed = true; }
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    console.warn('Firma con la CLI tizen non riuscita:', e.message);
  }
}
if (!signed) {
  zip(files.map((f) => ({ name: f, data: fs.readFileSync(path.join(APP, f)) })), wgt);
  console.log('Creato', path.relative(ROOT, wgt), '(NON firmato: firmalo con Tizen Studio, vedi README)');
} else {
  console.log('Creato', path.relative(ROOT, wgt), '(firmato con il profilo', profile + ')');
}

/* --- cartella USB (Hisense VIDAA / browser) --- */
const usb = path.join(DIST, 'usb', 'NovaPlay');
copyDir(APP, usb);
fs.copyFileSync(path.join(ROOT, 'tools', 'novaplay.example.json'), path.join(DIST, 'usb', 'novaplay.example.json'));
fs.writeFileSync(path.join(DIST, 'usb', 'LEGGIMI.txt'), [
  'NovaPlay IPTV - contenuto della chiavetta USB',
  '',
  'NovaPlay/index.html      -> app (aprila con il browser del TV o del PC)',
  'novaplay.example.json    -> esempio di configurazione: rinominalo in novaplay.json,',
  '                            inserisci i tuoi dati e importalo da',
  '                            Impostazioni > Playlist > Carica da chiavetta USB',
  'Puoi copiare qui anche i tuoi file .m3u / .m3u8.',
  '',
  'Istruzioni complete: README.md del progetto.'
].join('\r\n'));
const usbFiles = walk(path.join(DIST, 'usb'));
zip(usbFiles.map((f) => ({ name: f, data: fs.readFileSync(path.join(DIST, 'usb', f)) })), path.join(DIST, 'NovaPlay-USB.zip'));
console.log('Creata  dist/usb/ e dist/NovaPlay-USB.zip');
