/*
 * Catalogo unificato: trasforma una sorgente (Xtream Codes, URL M3U o file M3U
 * da USB) in tre sezioni omogenee: live, movie, series.
 */
(function () {
  'use strict';
  var App = window.App, U = App.U;

  var ADULT_RE = /(adult|xxx|porn|18\+|\+18|hot|eroti)/i;
  var EP_RE = /^(.*?)[\s._\-|:]*S(\d{1,3})[\s._\-]*E(\d{1,4})/i;
  var XT_PATH_RE = /\/(?:(live|movie|series)\/)?[^\/]+\/[^\/]+\/(\d+)(?:\.(\w+))?(?:\?.*)?$/;

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function yearOf(name) {
    var m = String(name || '').match(/\((19\d{2}|20\d{2})\)|\b(19\d{2}|20\d{2})\b/);
    return m ? (m[1] || m[2]) : '';
  }

  function kindOf(e) {
    var u = e.url.toLowerCase(), g = (e.group || '').toLowerCase();
    if (/\/series\//.test(u)) return 'series';
    if (/\/movie\//.test(u)) return 'movie';
    var vodExt = /\.(mp4|mkv|avi|mov|wmv|m4v|webm)(\?|$)/.test(u);
    if (EP_RE.test(e.name) && (vodExt || /serie|series|episod|stagion/.test(g))) return 'series';
    if (vodExt) return /serie|series|episod|stagion/.test(g) ? 'series' : 'movie';
    return 'live';
  }

  var CACHE_V = 1;

  function emptySection() { return { cats: [], items: [], byCat: null, byId: {} }; }

  var C = App.Catalog = {
    profile: null,
    xt: null,
    account: null,
    epgUrl: '',
    live: emptySection(),
    movie: emptySection(),
    series: emptySection(),
    loaded: false,

    /*
     * Carica la sorgente. Dal secondo avvio usa la copia salvata sul TV (apertura
     * immediata) e aggiorna in background; opts.fresh forza lo scaricamento.
     */
    load: function (profile, status, opts) {
      status = status || function () {};
      opts = opts || {};
      C.profile = profile;
      C.loaded = false;
      C.refreshNeeded = false;
      App.UserData.load(profile.id);
      var useCache = !opts.fresh && profile.type !== 'file';
      return (useCache ? App.IDB.get('cat:' + profile.id) : Promise.resolve(null)).then(function (cached) {
        if (cached && cached.v === CACHE_V) {
          status('Apertura lista salvata…');
          C.refreshNeeded = true;
          return C.restore(cached);
        }
        return C.fetch(profile, status).then(function (T) {
          C.adopt(T);
          C.save(profile, T);
        });
      }).then(function () {
        if (!C.account) C.account = C.manualAccount(profile);
        C.loaded = true;
      });
    },

    target: function () {
      return { xt: null, account: null, epgUrl: '', live: emptySection(), movie: emptySection(), series: emptySection(), failed: [] };
    },

    fetch: function (profile, status) {
      var T = C.target();
      var p = profile.type === 'xtream' ? C.loadXtream(profile, status, T) : C.loadM3U(profile, status, T);
      return p.then(function () { return T; });
    },

    adopt: function (T) {
      C.xt = T.xt; C.account = T.account; C.epgUrl = T.epgUrl;
      C.live = T.live; C.movie = T.movie; C.series = T.series;
      ['live', 'movie', 'series'].forEach(function (k) {
        var s = C[k];
        s.byCat = null; s.byId = {};
        s.items.forEach(function (it) { s.byId[it.id] = it; });
      });
      if (T.failed.length) {
        setTimeout(function () { App.UI.toast('Non è stato possibile caricare: ' + T.failed.join(', ') + '. Riprova da Impostazioni → Playlist → Ricarica ora', 8000); }, 1500);
      }
    },

    save: function (profile, T) {
      if (profile.type === 'file' || T.failed.length) return;      // non salviamo liste incomplete
      function strip(sec) { return { cats: sec.cats, items: sec.items }; }
      App.IDB.set('cat:' + profile.id, {
        v: CACHE_V, t: Date.now(), account: T.account, epgUrl: T.epgUrl,
        xt: T.xt ? { server: T.xt.base, user: T.xt.user, pass: T.xt.pass } : null,
        live: strip(T.live), movie: strip(T.movie), series: strip(T.series)
      });
    },

    restore: function (c) {
      var T = C.target();
      T.account = c.account; T.epgUrl = c.epgUrl;
      T.xt = c.xt ? new App.Xtream(c.xt.server, c.xt.user, c.xt.pass) : null;
      ['live', 'movie', 'series'].forEach(function (k) { T[k].cats = c[k].cats; T[k].items = c[k].items; });
      C.adopt(T);
      C.cachedAt = c.t;
    },

    /* Aggiornamento in background dopo l'apertura dalla copia salvata. */
    refresh: function () {
      var profile = C.profile;
      if (!profile || !C.refreshNeeded) return;
      C.refreshNeeded = false;
      C.fetch(profile, function () {}).then(function (T) {
        C.save(profile, T);
        if (C.profile !== profile) return;
        if (T.account) { C.account = T.account; App.Header.expiry(); }
        var diff = T.live.items.length !== C.live.items.length || T.movie.items.length !== C.movie.items.length || T.series.items.length !== C.series.items.length;
        if (diff) App.UI.toast('Lista aggiornata: le novità saranno visibili al prossimo avvio (o con Ricarica ora)', 6000);
      }, function () { /* resta la copia salvata */ });
    },

    /* ------------------------------------------------------------ Xtream */
    loadXtream: function (pr, status, T) {
      var xt = T.xt = new App.Xtream(pr.server, pr.user, pr.pass);
      status('Accesso al server…');
      return xt.auth().then(function (acc) {
        T.account = acc;
        T.epgUrl = xt.xmltvUrl();
        var done = 0;
        // ogni elenco viene ritentato una volta; se fallisce ancora lo segnaliamo
        function get(action, label) {
          function once() { return xt.api(action, null, 300000); }
          return once().then(null, once).then(function (r) {
            done++;
            status('Caricamento contenuti… ' + done + '/6');
            return Array.isArray(r) ? r : [];
          }, function () {
            if (T.failed.indexOf(label) < 0) T.failed.push(label);
            return [];
          });
        }
        status('Caricamento canali…');
        // prima i canali, poi film e serie (i server lenti reggono meglio poche richieste per volta)
        return Promise.all([get('get_live_categories', 'canali'), get('get_live_streams', 'canali')]).then(function (live) {
          status('Caricamento film e serie TV… (la prima volta può richiedere qualche minuto)');
          return Promise.all([
            get('get_vod_categories', 'film'), get('get_vod_streams', 'film'),
            get('get_series_categories', 'serie TV'), get('get_series', 'serie TV')
          ]).then(function (vs) { return live.concat(vs); });
        });
      }).then(function (r) {
        function cats(a) {
          return a.map(function (c) { return { id: String(c.category_id), name: c.category_name || 'Categoria' }; });
        }
        T.live.cats = cats(r[0]);
        T.live.items = r[1].map(function (s) {
          return {
            kind: 'live', id: 'l:' + s.stream_id, sid: s.stream_id, name: s.name || '',
            logo: s.stream_icon, catId: String(s.category_id), epgId: s.epg_channel_id || '',
            num: s.num, archive: +s.tv_archive || 0
          };
        });
        T.movie.cats = cats(r[2]);
        T.movie.items = r[3].map(function (s) {
          return {
            kind: 'movie', id: 'm:' + s.stream_id, sid: s.stream_id, name: s.name || '',
            poster: s.stream_icon, catId: String(s.category_id), rating: parseFloat(s.rating) || 0,
            ext: s.container_extension, added: +s.added || 0, year: s.year || yearOf(s.name)
          };
        });
        T.series.cats = cats(r[4]);
        T.series.items = r[5].map(function (s) {
          return {
            kind: 'series', id: 's:' + s.series_id, sid: s.series_id, name: s.name || '',
            poster: s.cover, catId: String(s.category_id), rating: parseFloat(s.rating) || 0,
            plot: s.plot, genre: s.genre, year: String(s.releaseDate || s.release_date || '').slice(0, 4) || yearOf(s.name),
            backdrop: s.backdrop_path && s.backdrop_path[0], added: +s.last_modified || 0
          };
        });
      });
    },

    /* --------------------------------------------------------------- M3U */
    loadM3U: function (pr, status, T) {
      var textP;
      if (pr.type === 'file') {
        status('Lettura playlist salvata…');
        textP = App.IDB.get('m3u:' + pr.id).then(function (t) {
          if (!t) throw new Error('Playlist USB non trovata: ricaricala dalle impostazioni');
          return t;
        });
      } else {
        status('Download playlist M3U…');
        textP = U.httpText(pr.url, {
          timeout: 600000,
          onProgress: function (l) { status('Download playlist M3U… ' + (l / 1048576).toFixed(1) + ' MB'); }
        });
      }
      var cred = pr.url ? App.M3U.xtreamCredentials(pr.url) : null;
      var accP = cred ? new App.Xtream(cred.server, cred.user, cred.pass).auth().then(function (a) {
        T.xt = new App.Xtream(cred.server, cred.user, cred.pass);
        return a;
      }, function () { return null; }) : Promise.resolve(null);

      return Promise.all([textP, accP]).then(function (r) {
        if (r[1]) T.account = r[1];
        status('Analisi playlist…');
        return App.M3U.parse(r[0], function (i, n) {
          status('Analisi playlist… ' + Math.round(i * 100 / n) + '%');
        });
      }).then(function (pl) {
        T.epgUrl = pr.epgUrl || pl.header.tvgUrl || (T.xt ? T.xt.xmltvUrl() : '');
        C.buildFromM3U(pl.entries, T);
      });
    },

    buildFromM3U: function (entries, T) {
      var catMaps = { live: {}, movie: {}, series: {} }, seriesMap = {}, liveNum = 0;
      function cat(kind, name) {
        name = name || 'Senza categoria';
        var m = catMaps[kind];
        if (!m[name]) {
          m[name] = { id: 'g:' + hash(name), name: name };
          T[kind].cats.push(m[name]);
        }
        return m[name].id;
      }
      entries.forEach(function (e) {
        var kind = kindOf(e), a = e.attrs, catId = cat(kind, e.group);
        var xm = T.xt ? e.url.match(XT_PATH_RE) : null;
        var sid = xm ? xm[2] : null;
        if (kind === 'live') {
          T.live.items.push({
            kind: 'live', id: 'l:' + (sid || hash(e.name + '|' + e.group)), sid: sid, name: e.name,
            logo: a['tvg-logo'], catId: catId, epgId: a['tvg-id'] || '', epgName: a['tvg-name'] || e.name,
            num: a['tvg-chno'] || ++liveNum, url: e.url, ua: e.ua, archive: +a['catchup-days'] || 0
          });
        } else if (kind === 'movie') {
          T.movie.items.push({
            kind: 'movie', id: 'm:' + (sid || hash(e.name + '|' + e.group)), sid: sid, name: e.name,
            poster: a['tvg-logo'], catId: catId, url: e.url, ua: e.ua, year: yearOf(e.name), rating: 0, added: 0
          });
        } else {
          var m = e.name.match(EP_RE);
          var sname = m ? m[1].replace(/[\s\-_.|:]+$/, '') : e.name;
          var key = catId + '|' + sname.toLowerCase();
          var s = seriesMap[key];
          if (!s) {
            s = seriesMap[key] = {
              kind: 'series', id: 's:' + hash(key), name: sname, poster: a['tvg-logo'], catId: catId,
              year: yearOf(sname), rating: 0, added: 0, m3uEpisodes: []
            };
            T.series.items.push(s);
          }
          s.m3uEpisodes.push({
            kind: 'episode', id: 'e:' + (sid || hash(e.url)), sid: sid, name: e.name, url: e.url, ua: e.ua,
            season: m ? +m[2] : 1, ep: m ? +m[3] : s.m3uEpisodes.length + 1,
            poster: a['tvg-logo'] || s.poster, seriesId: s.id, seriesName: sname
          });
        }
      });
    },

    /* --------------------------------------------------------- consultazione */
    isAdult: function (cat) { return ADULT_RE.test(cat.name); },

    cats: function (kind) {
      var list = C[kind].cats;
      if (App.Settings.get('hideAdult')) list = list.filter(function (c) { return !C.isAdult(c); });
      return list;
    },

    list: function (kind, catId) {
      var s = C[kind];
      if (catId === '__fav') return App.UserData.favList(kind);
      if (catId === '__recent') {
        if (kind === 'live') return App.UserData.recentList();
        return s.items.slice().sort(function (a, b) { return (b.added || 0) - (a.added || 0); }).slice(0, 200);
      }
      if (catId === '__resume') return App.UserData.resumeList(kind);
      if (catId === '__all' || !catId) {
        if (!App.Settings.get('hideAdult')) return s.items;
        var ok = {};
        C.cats(kind).forEach(function (c) { ok[c.id] = 1; });
        return s.items.filter(function (it) { return ok[it.catId]; });
      }
      if (!s.byCat) {
        s.byCat = {};
        s.items.forEach(function (it) { (s.byCat[it.catId] = s.byCat[it.catId] || []).push(it); });
      }
      return s.byCat[catId] || [];
    },

    find: function (id) {
      var k = id.charAt(0) === 'l' ? 'live' : id.charAt(0) === 'm' ? 'movie' : 'series';
      return C[k].byId[id] || null;
    },

    url: function (it) {
      var xt = C.xt;
      if (it.kind === 'live') {
        if (xt && it.sid && (!it.url || C.profile.type === 'xtream')) return xt.liveUrl(it.sid, App.Settings.get('liveFormat'));
        return it.url;
      }
      if (it.url) return it.url;
      if (!xt) return '';
      if (it.kind === 'movie') return xt.vodUrl(it.sid, it.ext);
      if (it.kind === 'episode') return xt.episodeUrl(it.sid, it.ext);
      return '';
    },

    search: function (q, kind, max) {
      q = String(q || '').toLowerCase().trim();
      if (q.length < 2) return [];
      var out = [], items = C.list(kind, '__all');
      for (var i = 0; i < items.length && out.length < (max || 60); i++) {
        if (items[i].name.toLowerCase().indexOf(q) >= 0) out.push(items[i]);
      }
      return out;
    },

    /* Dettagli film (trama, cast, sfondo). */
    vodInfo: function (it) {
      var base = { plot: it.plot || '', poster: it.poster, backdrop: it.backdrop, year: it.year, rating: it.rating };
      if (!C.xt || !it.sid) return Promise.resolve(base);
      return C.xt.api('get_vod_info', { vod_id: it.sid }, 20000).then(function (r) {
        var i = (r && r.info) || {};
        if (r && r.movie_data && r.movie_data.container_extension && !it.ext) it.ext = r.movie_data.container_extension;
        return {
          plot: i.plot || i.description || base.plot,
          cast: i.cast || i.actors || '', director: i.director || '', genre: i.genre || '',
          year: String(i.releasedate || i.release_date || '').slice(0, 4) || base.year,
          duration: +i.duration_secs || 0, durationText: i.duration || '',
          rating: parseFloat(i.rating) || base.rating,
          poster: i.movie_image || i.cover_big || base.poster,
          backdrop: (i.backdrop_path && i.backdrop_path[0]) || base.backdrop || i.movie_image,
          country: i.country || ''
        };
      }, function () { return base; });
    },

    /* Stagioni ed episodi di una serie. */
    seriesInfo: function (it) {
      function group(eps) {
        var by = {};
        eps.forEach(function (e) { (by[e.season] = by[e.season] || []).push(e); });
        return Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
          return { num: n, episodes: by[n].sort(function (a, b) { return a.ep - b.ep; }) };
        });
      }
      if (it.m3uEpisodes) {
        return Promise.resolve({ info: { plot: it.plot || '', poster: it.poster, backdrop: it.poster }, seasons: group(it.m3uEpisodes) });
      }
      return C.xt.api('get_series_info', { series_id: it.sid }, 30000).then(function (r) {
        var i = (r && r.info) || {}, eps = [];
        var all = (r && r.episodes) || {};
        Object.keys(all).forEach(function (k) {
          (all[k] || []).forEach(function (e) {
            var ei = e.info || {};
            eps.push({
              kind: 'episode', id: 'e:' + e.id, sid: e.id, name: e.title || ('Episodio ' + e.episode_num),
              season: +e.season || +k, ep: +e.episode_num || 0, ext: e.container_extension,
              poster: ei.movie_image || it.poster, plot: ei.plot || '',
              duration: +ei.duration_secs || 0, seriesId: it.id, seriesName: it.name
            });
          });
        });
        return {
          info: {
            plot: i.plot || it.plot || '', cast: i.cast || '', genre: i.genre || it.genre || '',
            director: i.director || '', year: String(i.releaseDate || i.release_date || '').slice(0, 4) || it.year,
            rating: parseFloat(i.rating) || it.rating, poster: i.cover || it.poster,
            backdrop: (i.backdrop_path && i.backdrop_path[0]) || it.backdrop || i.cover || it.poster
          },
          seasons: group(eps)
        };
      });
    }
  };

  /* ------------------------------------------------- preferiti/cronologia */
  App.UserData = {
    pid: null,
    d: null,
    load: function (pid) {
      this.pid = pid;
      this.d = App.Store.get('ud.' + pid, null) || { fav: {}, recent: [], resume: {} };
    },
    save: function () { App.Store.set('ud.' + this.pid, this.d); },
    isFav: function (it) { return !!this.d.fav[it.id]; },
    toggleFav: function (it) {
      if (this.d.fav[it.id]) delete this.d.fav[it.id]; else this.d.fav[it.id] = Date.now();
      this.save();
      return !!this.d.fav[it.id];
    },
    favList: function (kind) {
      var fav = this.d.fav, out = [];
      Object.keys(fav).sort(function (a, b) { return fav[b] - fav[a]; }).forEach(function (id) {
        var it = C.find(id);
        if (it && it.kind === kind) out.push(it);
      });
      return out;
    },
    addRecent: function (it) {
      var r = this.d.recent.filter(function (id) { return id !== it.id; });
      r.unshift(it.id);
      this.d.recent = r.slice(0, 40);
      this.save();
    },
    recentList: function () {
      return this.d.recent.map(C.find).filter(Boolean);
    },
    snapshot: function (it) {
      var keys = ['kind', 'id', 'sid', 'name', 'poster', 'logo', 'ext', 'url', 'ua', 'season', 'ep', 'seriesId', 'seriesName', 'year'];
      var o = {};
      keys.forEach(function (k) { if (it[k] !== undefined) o[k] = it[k]; });
      return o;
    },
    setResume: function (it, pos, dur) {
      if (!it || it.kind === 'live') return;
      if (!dur || pos < 30 || pos > dur - 60) {           // finito o appena iniziato
        delete this.d.resume[it.id];
      } else {
        this.d.resume[it.id] = { pos: pos, dur: dur, t: Date.now(), item: this.snapshot(it) };
      }
      var ids = Object.keys(this.d.resume), res = this.d.resume;
      if (ids.length > 60) {
        ids.sort(function (a, b) { return res[a].t - res[b].t; }).slice(0, ids.length - 60)
          .forEach(function (id) { delete res[id]; });
      }
      this.save();
    },
    getResume: function (it) { return this.d.resume[it.id] || null; },
    resumeList: function (kind) {
      var res = this.d.resume;
      return Object.keys(res).sort(function (a, b) { return res[b].t - res[a].t; }).map(function (id) {
        var it = res[id].item;
        it.progress = res[id].pos / res[id].dur;
        return it;
      }).filter(function (it) {
        return !kind || it.kind === kind || (kind === 'series' && it.kind === 'episode');
      });
    }
  };
})();
