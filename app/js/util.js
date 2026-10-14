/*
 * NovaPlay IPTV - utility di base.
 * Scritto in ES5 per restare compatibile con i browser dei TV meno recenti
 * (Tizen 3+/Chromium 47, VIDAA).
 */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.VERSION = '1.0.0';
  App.Screens = {};
  App.NAME = 'NovaPlay';
  App.isTizen = typeof window.tizen !== 'undefined';
  App.isVidaa = /vidaa|hisense/i.test(navigator.userAgent);
  App.hasAVPlay = function () {
    return !!(window.webapis && window.webapis.avplay);
  };

  var U = App.U = {};

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  };

  U.el = function (html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  };

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  U.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  };

  U.b64 = function (s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(atob(s))); } catch (e) {
      try { return atob(s); } catch (e2) { return s; }
    }
  };

  /* Immagine con fallback silenzioso (nasconde l'icona se il link e' rotto). */
  U.img = function (src, cls) {
    if (!src) return '';
    return '<img class="' + (cls || '') + '" src="' + U.esc(src) + '" onerror="this.style.visibility=\'hidden\'" alt="">';
  };

  /* ---------------------------------------------------------------- date */

  var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  U.fmtTime = function (d) {
    d = d instanceof Date ? d : new Date(d);
    return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };
  U.fmtDate = function (d) {
    d = d instanceof Date ? d : new Date(d);
    return U.pad2(d.getDate()) + '/' + U.pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  U.fmtLongDate = function (d) {
    d = d || new Date();
    var g = GIORNI[d.getDay()];
    return g.charAt(0).toUpperCase() + g.slice(1) + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();
  };
  U.fmtDuration = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + U.pad2(m) : m) + ':' + U.pad2(s);
  };
  U.fmtMinutes = function (sec) {
    var m = Math.round((sec || 0) / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
  };
  /* Accetta "gg/mm/aaaa", "aaaa-mm-gg", timestamp unix (s o ms). */
  U.parseDate = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v;
    var s = String(v).trim(), m;
    if (/^\d{9,13}$/.test(s)) {
      var n = parseInt(s, 10);
      return new Date(n < 1e12 ? n * 1000 : n);
    }
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) {
      return new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59);
    }
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
      return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
    }
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };
  U.daysLeft = function (d) {
    if (!d) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  };

  U.normalize = function (s) {
    return String(s || '').toLowerCase()
      .replace(/\b(fhd|uhd|hd|sd|hevc|h265|4k|1080p?|720p?)\b/g, '')
      .replace(/[^a-z0-9]+/g, '');
  };

  /* ---------------------------------------------------------- storage */

  var PREFIX = 'np.';
  App.Store = {
    get: function (k, def) {
      try {
        var v = localStorage.getItem(PREFIX + k);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (k, v) {
      try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* quota */ }
    },
    remove: function (k) {
      try { localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ }
    }
  };

  /* Archivio chiave/valore su IndexedDB per dati grandi (playlist da USB, cache). */
  App.IDB = (function () {
    var mem = {}, dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve) {
        try {
          var req = window.indexedDB.open('novaplay', 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
      return dbp;
    }
    function run(mode, fn) {
      return db().then(function (d) {
        if (!d) return fn(null);
        return new Promise(function (resolve) {
          var tx = d.transaction('kv', mode), st = tx.objectStore('kv'), r = fn(st);
          tx.oncomplete = function () { resolve(r && r.result); };
          tx.onerror = tx.onabort = function () { resolve(undefined); };
        });
      });
    }
    return {
      get: function (k) {
        return run('readonly', function (st) { return st ? st.get(k) : { result: mem[k] }; });
      },
      set: function (k, v) {
        return run('readwrite', function (st) { if (st) st.put(v, k); else mem[k] = v; return null; });
      },
      del: function (k) {
        return run('readwrite', function (st) { if (st) st['delete'](k); else delete mem[k]; return null; });
      }
    };
  })();

  /* ---------------------------------------------------------- settings */

  var DEFAULTS = {
    profiles: [],
    activeProfile: null,
    engine: 'auto',          // auto | avplay | html5
    liveFormat: 'ts',        // ts | m3u8 (Xtream)
    buffer: 'medium',        // low | medium | high
    autoReconnect: true,
    preview: true,
    subAuto: false,
    subLang: 'ita',
    subSize: 'medium',
    audioLang: 'ita',
    aspect: 'auto',          // auto | fill | zoom
    epgMode: 'auto',         // auto | xmltv | off
    epgUrl: '',
    epgOffset: 0,            // ore
    theme: 'prime',
    hideAdult: false,
    proxy: '',
    proxyStreams: false
  };

  App.Settings = {
    data: null,
    load: function () {
      var d = App.Store.get('settings', {});
      this.data = {};
      for (var k in DEFAULTS) {
        if (DEFAULTS.hasOwnProperty(k)) this.data[k] = d.hasOwnProperty(k) ? d[k] : DEFAULTS[k];
      }
      return this.data;
    },
    save: function () { App.Store.set('settings', this.data); },
    get: function (k) { return this.data[k]; },
    set: function (k, v) { this.data[k] = v; this.save(); },
    activeProfile: function () {
      var id = this.data.activeProfile, list = this.data.profiles;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return list[0] || null;
    }
  };

  /* -------------------------------------------------------------- http */

  U.proxify = function (url, isStream) {
    var p = App.Settings.data && App.Settings.data.proxy;
    if (!p || App.isTizen) return url;              // su Tizen il CORS non si applica
    if (isStream && !App.Settings.data.proxyStreams) return url;
    if (url.indexOf(p) === 0) return url;
    return p + (p.indexOf('?') >= 0 ? '' : '?url=') + encodeURIComponent(url);
  };

  /* GET con timeout. opts: {json, timeout, noProxy, onProgress} */
  U.http = function (url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', opts.noProxy ? url : U.proxify(url), true);
      xhr.timeout = opts.timeout || 30000;
      if (opts.onProgress) xhr.onprogress = function (e) { opts.onProgress(e.loaded, e.total); };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300 || (xhr.status === 0 && xhr.responseText)) {
          if (!opts.json) return resolve(xhr.responseText);
          try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(new Error('Risposta non valida dal server')); }
        } else {
          reject(new Error('Errore HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error('Connessione non riuscita (rete o CORS)')); };
      xhr.ontimeout = function () { reject(new Error('Timeout del server')); };
      xhr.send();
    });
  };

  /* Scarica testo, decomprimendo i file .gz quando il browser lo permette. */
  U.httpText = function (url, opts) {
    if (/\.gz(\?|$)/i.test(url) && window.fetch && window.DecompressionStream) {
      return fetch(U.proxify(url)).then(function (r) {
        if (!r.ok) throw new Error('Errore HTTP ' + r.status);
        return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      });
    }
    return U.http(url, opts);
  };

  /* Esegue fn su un array a blocchi per non bloccare l'interfaccia. */
  U.chunked = function (arr, size, fn, onProgress) {
    return new Promise(function (resolve) {
      var i = 0;
      function step() {
        var end = Math.min(arr.length, i + size);
        for (; i < end; i++) fn(arr[i], i);
        if (onProgress) onProgress(i, arr.length);
        if (i < arr.length) setTimeout(step, 0); else resolve();
      }
      step();
    });
  };
})();
