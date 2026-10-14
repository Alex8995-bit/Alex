#!/usr/bin/env node
/*
 * Server locale per usare NovaPlay dal browser del TV (Hisense VIDAA, ecc.).
 *  - serve la cartella app/ su http://IP-DEL-PC:8080/
 *  - /proxy?url=...  proxy CORS (riscrive anche le playlist HLS .m3u8)
 *
 * Uso: node tools/serve.js [porta]
 * Poi sul TV apri il browser all'indirizzo mostrato e, se serve, imposta in
 * Impostazioni > Rete e proxy:  http://IP-DEL-PC:8080/proxy
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
// connessioni riutilizzate verso il server IPTV: i segmenti video arrivano senza ritardi di apertura
const AGENTS = { 'http:': new http.Agent({ keepAlive: true, maxSockets: 16 }), 'https:': new https.Agent({ keepAlive: true, maxSockets: 16 }) };
const { URL } = require('url');

const PORT = +process.argv[2] || +process.env.PORT || 8080;
const ROOT = fs.existsSync(path.join(__dirname, '..', 'app')) ? path.join(__dirname, '..', 'app') : path.join(__dirname, 'NovaPlay');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain'
};
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type'
};

/* Nasconde le password nei messaggi del Terminale. */
function safe(url) {
  return String(url).replace(/(password=)[^&]*/i, '$1***').replace(/\/(live|movie|series)\/([^\/]+)\/[^\/]+\//, '/$1/$2/***/');
}

function proxy(req, res, target, hops) {
  let u;
  try { u = new URL(target); } catch (e) {
    console.log('[proxy] URL non valido:', safe(target));
    res.writeHead(400, CORS); return res.end('URL non valido');
  }
  const lib = u.protocol === 'https:' ? https : http;
  const headers = { 'User-Agent': req.headers['user-agent'] || 'NovaPlay', Accept: '*/*' };
  if (req.headers.range) headers.Range = req.headers.range;
  // liste e API compresse in gzip: arrivano molto piu' in fretta (non per i video)
  const isMedia = /\.(ts|m3u8|mp4|mkv|avi|mov|m4s|m4v|aac|webm|key)(\?|$)/i.test(u.pathname) ||
    /\/(live|movie|series)\//i.test(u.pathname) || /\/\d+$/.test(u.pathname);
  if (!req.headers.range && !isMedia) headers['Accept-Encoding'] = 'gzip';
  // alcuni server impiegano minuti a preparare le liste grandi
  const up = lib.get(u, { headers, timeout: 300000, agent: AGENTS[u.protocol] }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) {
      r.resume();
      return proxy(req, res, new URL(r.headers.location, u).toString(), hops + 1);
    }
    if (!/\.(ts|m4s|aac|key|bin)(\?|$)/i.test(u.pathname)) console.log('[proxy]', r.statusCode, safe(u.href));
    const ct = String(r.headers['content-type'] || '');
    const isPlaylist = /\.m3u8(\?|$)/i.test(u.pathname) || (/mpegurl/i.test(ct) && isMedia);
    if (isPlaylist) {
      let body = '';
      const src = /gzip/i.test(r.headers['content-encoding'] || '') ? r.pipe(zlib.createGunzip()) : r;
      src.setEncoding('utf8');
      src.on('data', (d) => { body += d; });
      src.on('error', () => res.end());
      src.on('end', () => {
        if (!/#EXT-X-/.test(body)) {           // non e' HLS: la inoltriamo cosi' com'e'
          res.writeHead(r.statusCode, Object.assign({ 'Content-Type': ct || 'text/plain' }, CORS));
          return res.end(body);
        }
        const base = `http://${req.headers.host}/proxy?url=`;
        const out = body.split(/\r?\n/).map((line) => {
          const t = line.trim();
          if (t && !t.startsWith('#')) return base + encodeURIComponent(new URL(t, u).toString());
          return line.replace(/URI="([^"]+)"/g, (m, p) => `URI="${base}${encodeURIComponent(new URL(p, u).toString())}"`);
        }).join('\n');
        res.writeHead(r.statusCode, Object.assign({ 'Content-Type': 'application/vnd.apple.mpegurl' }, CORS));
        res.end(out);
      });
      return;
    }
    const h = Object.assign({}, CORS);
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-encoding'].forEach((k) => {
      if (r.headers[k]) h[k] = r.headers[k];
    });
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', (e) => {
    if (res.writableEnded) return;
    console.log('[proxy] ERRORE', e.message, '->', safe(u.href));
    if (!res.headersSent) res.writeHead(502, CORS);
    res.end('Errore proxy: ' + e.message);
  });
  // se il TV chiude la connessione (cambio canale) chiudiamo anche quella verso il server IPTV
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (u.pathname === '/proxy') return proxy(req, res, u.searchParams.get('url') || '', 0);
  if (u.pathname === '/__novaplay') {
    // l'app lo usa per capire che e' servita da questo server e attivare il proxy da sola
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CORS));
    return res.end(JSON.stringify({ proxy: '/proxy' }));
  }
  let p = path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Non trovato'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach((l) => (l || []).forEach((i) => {
    if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }));
  console.log('NovaPlay in esecuzione:');
  (ips.length ? ips : ['localhost']).forEach((ip) => console.log(`  App:   http://${ip}:${PORT}/`));
  console.log('Il proxy si attiva da solo quando apri l\'app da questo indirizzo.');
  console.log('Qui sotto vedrai le richieste verso il server IPTV (Ctrl+C per fermare).');
});
