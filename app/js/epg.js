/*
 * Guida TV (EPG).
 *  - Xtream: get_short_epg per canale, caricata solo per i canali visibili.
 *  - XMLTV: file url-tvg / x-tvg-url / URL personalizzato (anche .gz).
 */
(function () {
  'use strict';
  var App = window.App, U = App.U;

  var TTL = 10 * 60 * 1000;
  var MAX_PARALLEL = 4;

  function decodeXml(s) {
    if (!s) return '';
    s = s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
    return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      switch (e.toLowerCase()) {
        case 'amp': return '&';
        case 'lt': return '<';
        case 'gt': return '>';
        case 'quot': return '"';
        case 'apos': return "'";
      }
      var n = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCharCode(n); } catch (x) { return ''; }
    }).trim();
  }

  function xmltvDate(s) {
    var m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
    if (!m) return 0;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (m[7]) {
      var sign = m[7].charAt(0) === '-' ? -1 : 1;
      t -= sign * (parseInt(m[7].slice(1, 3), 10) * 60 + parseInt(m[7].slice(3, 5), 10)) * 60000;
    }
    return t;
  }

  var E = App.EPG = {
    mode: 'off',
    cache: {},
    pending: {},
    queue: [],
    running: 0,
    xml: null,
    status: '',
    listeners: [],

    init: function () {
      E.cache = {}; E.pending = {}; E.queue = []; E.xml = null; E.status = '';
      var m = App.Settings.get('epgMode'), C = App.Catalog;
      var url = App.Settings.get('epgUrl') || '';
      if (m === 'off') { E.mode = 'off'; return; }
      if (m === 'auto' && C.xt && !url) { E.mode = 'xtream'; return; }
      url = url || C.epgUrl;
      if (url) { E.mode = 'xmltv'; E.loadXml(url); }
      else E.mode = C.xt ? 'xtream' : 'off';
    },

    onUpdate: function (fn) { E.listeners.push(fn); },
    emit: function () { E.listeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); },

    offset: function () { return (+App.Settings.get('epgOffset') || 0) * 3600000; },

    /* Programmi in cache (sincrono) oppure null. */
    cached: function (ch) {
      if (E.mode === 'xmltv') return E.xml ? E.xmlFor(ch) : null;
      var c = E.cache[ch.id];
      return c ? c.progs : null;
    },

    /* Programmi del canale (Promise). */
    get: function (ch) {
      if (E.mode === 'off') return Promise.resolve([]);
      if (E.mode === 'xmltv') return Promise.resolve(E.xml ? E.xmlFor(ch) : []);
      var c = E.cache[ch.id];
      if (c && Date.now() - c.t < TTL) return Promise.resolve(c.progs);
      if (!ch.sid || !App.Catalog.xt) return Promise.resolve([]);
      if (E.pending[ch.id]) return E.pending[ch.id].p;
      var job = {};
      job.p = new Promise(function (res) { job.res = res; });
      job.ch = ch;
      E.pending[ch.id] = job;
      E.queue.unshift(job);           // i piu' recenti (visibili ora) per primi
      E.pump();
      return job.p;
    },

    /* Precarica la EPG di una lista di canali (quelli a schermo). */
    prefetch: function (list, cb) {
      if (E.mode !== 'xtream') return;
      E.queue = E.queue.filter(function (j) { return j.started; });
      list.forEach(function (ch) {
        if (!E.cache[ch.id] && !E.pending[ch.id]) E.get(ch).then(function () { if (cb) cb(ch); });
      });
    },

    pump: function () {
      while (E.running < MAX_PARALLEL && E.queue.length) {
        (function (job) {
          job.started = true;
          E.running++;
          var off = E.offset();
          App.Catalog.xt.api('get_short_epg', { stream_id: job.ch.sid, limit: 10 }, 15000).then(function (r) {
            var list = (r && r.epg_listings) || [];
            return list.map(function (p) {
              var s = (+p.start_timestamp ? +p.start_timestamp * 1000 : new Date(String(p.start).replace(' ', 'T')).getTime()) + off;
              var e = (+p.stop_timestamp ? +p.stop_timestamp * 1000 : new Date(String(p.end || p.stop).replace(' ', 'T')).getTime()) + off;
              return { start: s, end: e, title: U.b64(p.title), desc: U.b64(p.description) };
            }).filter(function (p) { return p.end > Date.now() - 3600000; }).sort(function (a, b) { return a.start - b.start; });
          }, function () { return []; }).then(function (progs) {
            E.cache[job.ch.id] = { t: Date.now(), progs: progs };
            delete E.pending[job.ch.id];
            E.running--;
            job.res(progs);
            E.pump();
          });
        })(E.queue.shift());
      }
    },

    /* ----------------------------------------------------------- XMLTV */
    loadXml: function (url) {
      E.status = 'Caricamento guida TV…';
      U.httpText(url, { timeout: 180000 }).then(function (txt) {
        return E.parseXml(txt);
      }).then(function (data) {
        E.xml = data;
        E.status = '';
        E.emit();
      }, function (err) {
        E.status = 'Guida TV non disponibile: ' + err.message;
        E.xml = { byId: {}, byName: {} };
        E.emit();
      });
    },

    parseXml: function (txt) {
      var byId = {}, byName = {}, m;
      var now = Date.now(), from = now - 4 * 3600000, to = now + 36 * 3600000, off = E.offset();
      var chRe = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g, dnRe = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;
      while ((m = chRe.exec(txt))) {
        var id = decodeXml(m[1]).toLowerCase(), d;
        dnRe.lastIndex = 0;
        while ((d = dnRe.exec(m[2]))) byName[U.normalize(decodeXml(d[1]))] = id;
      }
      var pRe = /<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g;
      var tRe = /<title[^>]*>([\s\S]*?)<\/title>/, dRe = /<desc[^>]*>([\s\S]*?)<\/desc>/;
      var aRe = /(start|stop|channel)="([^"]*)"/g;
      return new Promise(function (resolve) {
        function step() {
          var n = 0;
          while (n++ < 3000 && (m = pRe.exec(txt))) {
            var a = {}, x;
            aRe.lastIndex = 0;
            while ((x = aRe.exec(m[1]))) a[x[1]] = x[2];
            var s = xmltvDate(a.start) + off, e = xmltvDate(a.stop) + off;
            if (e < from || s > to) continue;
            var t = m[2].match(tRe), ds = m[2].match(dRe), cid = decodeXml(a.channel).toLowerCase();
            (byId[cid] = byId[cid] || []).push({ start: s, end: e, title: t ? decodeXml(t[1]) : '', desc: ds ? decodeXml(ds[1]) : '' });
          }
          if (m) return setTimeout(step, 0);
          Object.keys(byId).forEach(function (k) { byId[k].sort(function (p, q) { return p.start - q.start; }); });
          resolve({ byId: byId, byName: byName });
        }
        step();
      });
    },

    xmlFor: function (ch) {
      var x = E.xml, id = (ch.epgId || '').toLowerCase();
      if (id && x.byId[id]) return x.byId[id];
      var n = x.byName[U.normalize(ch.epgName || ch.name)];
      if (n && x.byId[n]) return x.byId[n];
      return [];
    },

    /* Programma in onda e successivo. */
    now: function (progs) {
      var t = Date.now(), cur = null, next = null;
      if (!progs) return { cur: null, next: null, rest: [] };
      for (var i = 0; i < progs.length; i++) {
        if (progs[i].start <= t && progs[i].end > t) { cur = progs[i]; next = progs[i + 1] || null; break; }
        if (progs[i].start > t) { next = progs[i]; break; }
      }
      var idx = progs.indexOf(next);
      return { cur: cur, next: next, rest: idx >= 0 ? progs.slice(idx) : [] };
    },

    progress: function (p) {
      if (!p) return 0;
      return U.clamp((Date.now() - p.start) / (p.end - p.start), 0, 1);
    }
  };
})();
