/* Parser M3U / M3U8 (formato esteso IPTV). */
(function () {
  'use strict';
  var App = window.App, U = App.U;

  var ATTR_RE = /([a-zA-Z0-9_\-]+)="([^"]*)"/g;

  function parseAttrs(s) {
    var out = {}, m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = m[2];
    return out;
  }

  /* Il nome canale e' dopo la prima virgola fuori dalle virgolette (puo' contenere altre virgole). */
  function splitInfo(line) {
    var inQ = false, cut = -1;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) { cut = i; break; }
    }
    if (cut < 0) return { meta: line, name: '' };
    return { meta: line.slice(0, cut), name: line.slice(cut + 1).trim() };
  }

  App.M3U = {
    /* Restituisce Promise({header:{tvgUrl}, entries:[{name,attrs,group,url,ua,duration}]}) */
    parse: function (text, onProgress) {
      text = String(text || '').replace(/^﻿/, '');
      if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 4096))) {
        return Promise.reject(new Error('Il file non sembra una playlist M3U valida'));
      }
      var lines = text.split(/\r?\n/);
      var header = {}, entries = [], cur = null, extgrp = null, ua = null;

      return U.chunked(lines, 4000, function (raw) {
        var line = raw.trim();
        if (!line) return;
        if (line.charAt(0) === '#') {
          var up = line.slice(0, 10).toUpperCase();
          if (up.indexOf('#EXTM3U') === 0) {
            var h = parseAttrs(line);
            header.tvgUrl = h['url-tvg'] || h['x-tvg-url'] || h['tvg-url'] || header.tvgUrl;
          } else if (up.indexOf('#EXTINF') === 0) {
            var p = splitInfo(line.slice(line.indexOf(':') + 1));
            var attrs = parseAttrs(p.meta);
            cur = {
              name: p.name || attrs['tvg-name'] || 'Senza nome',
              attrs: attrs,
              group: attrs['group-title'] || '',
              duration: parseFloat(p.meta) || -1
            };
          } else if (up.indexOf('#EXTGRP') === 0) {
            extgrp = line.slice(8).trim();
          } else if (line.toUpperCase().indexOf('#EXTVLCOPT:HTTP-USER-AGENT=') === 0) {
            ua = line.slice(line.indexOf('=') + 1).trim();
          }
          return;
        }
        // riga URL
        if (!cur) cur = { name: line.split('/').pop(), attrs: {}, group: '', duration: -1 };
        if (!cur.group && extgrp) cur.group = extgrp;
        cur.url = line;
        if (ua) cur.ua = ua;
        entries.push(cur);
        cur = null; extgrp = null; ua = null;
      }, onProgress).then(function () {
        return { header: header, entries: entries };
      });
    },

    /* Ricava server/utente/password da un link M3U in stile Xtream (get.php?username=..). */
    xtreamCredentials: function (url) {
      var m = String(url || '').match(/^(https?:\/\/[^\/?#]+)[^?#]*\?(.*)$/i);
      if (!m) return null;
      var q = {};
      m[2].split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) {
          try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { q[kv.slice(0, i)] = kv.slice(i + 1); }
        }
      });
      if (q.username && q.password) return { server: m[1], user: q.username, pass: q.password };
      return null;
    }
  };
})();
