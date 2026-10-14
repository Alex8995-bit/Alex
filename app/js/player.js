/*
 * Player video.
 *  - Samsung Tizen: webapis.avplay (decoder nativo, il piu' stabile su TS/HLS).
 *  - Hisense VIDAA / browser: <video> + hls.js (HLS) + mpegts.js (MPEG-TS live).
 * Il controller aggiunge watchdog anti-blocco, riconnessione automatica con
 * backoff, ripresa dalla posizione, sottotitoli, tracce audio e OSD.
 */
(function () {
  'use strict';
  var App = window.App, U = App.U, Nav = App.Nav, UI = App.UI;

  var BUFFER = { low: { hls: 12, av: 3 }, medium: { hls: 30, av: 6 }, high: { hls: 60, av: 10 } };

  function bufferCfg() { return BUFFER[App.Settings.get('buffer')] || BUFFER.medium; }

  function cleanCue(t) {
    return String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '');
  }

  function langOf(s) { return String(s || '').toLowerCase().slice(0, 3); }

  /* ================================================ motore AVPlay */
  function AVPlayEngine(cb) {
    this.cb = cb;
    this.textIdx = -1;
    this.subTimer = null;
    if (!U.$('#avp')) {
      var o = document.createElement('object');
      o.id = 'avp';
      o.setAttribute('type', 'application/avplayer');
      U.$('#player').insertBefore(o, U.$('#player').firstChild);
    }
  }
  AVPlayEngine.prototype.name = 'avplay';
  AVPlayEngine.prototype.av = function () { return window.webapis.avplay; };

  AVPlayEngine.prototype.load = function (url, o) {
    var av = this.av(), cb = this.cb, self = this;
    this.stop();
    this.textIdx = -1;
    try {
      av.open(url);
      this.setRect(o.rect);
      av.setListener({
        onbufferingstart: function () { cb('buffering'); },
        onbufferingprogress: function () { },
        onbufferingcomplete: function () { cb('playing'); },
        onstreamcompleted: function () { cb('ended'); },
        oncurrentplaytime: function (ms) { cb('time', ms / 1000); },
        onerror: function (e) { cb('error', e); },
        onevent: function () { },
        ondrmevent: function () { },
        onsubtitlechange: function (duration, text) {
          if (self.textIdx < 0) return;
          cb('subtitle', cleanCue(text));
          clearTimeout(self.subTimer);
          self.subTimer = setTimeout(function () { cb('subtitle', ''); }, +duration || 4000);
        }
      });
      if (o.ua) { try { av.setStreamingProperty('USER_AGENT', o.ua); } catch (e) { /* ignore */ } }
      var sec = bufferCfg().av;
      try {
        av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', sec);
        av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', sec + 2);
      } catch (e) { /* ignore */ }
      try { av.setTimeoutForBuffering(20); } catch (e) { /* ignore */ }
      this.setAspect(App.Settings.get('aspect'));
      av.prepareAsync(function () {
        try {
          if (o.startAt > 0) av.seekTo(Math.floor(o.startAt * 1000));
          av.play();
          cb('playing');
        } catch (e) { cb('error', e); }
      }, function (e) { cb('error', e); });
    } catch (e) {
      cb('error', e);
    }
  };
  AVPlayEngine.prototype.stop = function () {
    var av = this.av();
    clearTimeout(this.subTimer);
    try { av.stop(); } catch (e) { /* ignore */ }
    try { av.close(); } catch (e) { /* ignore */ }
  };
  AVPlayEngine.prototype.state = function () { try { return this.av().getState(); } catch (e) { return 'NONE'; } };
  AVPlayEngine.prototype.play = function () { try { this.av().play(); } catch (e) { /* ignore */ } };
  AVPlayEngine.prototype.pause = function () { try { this.av().pause(); } catch (e) { /* ignore */ } };
  AVPlayEngine.prototype.isPaused = function () { return this.state() === 'PAUSED'; };
  AVPlayEngine.prototype.time = function () { try { return this.av().getCurrentTime() / 1000; } catch (e) { return 0; } };
  AVPlayEngine.prototype.duration = function () { try { return this.av().getDuration() / 1000; } catch (e) { return 0; } };
  AVPlayEngine.prototype.seek = function (sec) {
    try { this.av().seekTo(Math.max(0, Math.floor(sec * 1000)), function () { }, function () { }); } catch (e) { /* ignore */ }
  };
  AVPlayEngine.prototype.setRect = function (r) {
    if (!r) return;
    var k = 1920 / (window.innerWidth || 1920);
    try {
      this.av().setDisplayRect(Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k));
    } catch (e) { /* ignore */ }
  };
  AVPlayEngine.prototype.setAspect = function (m) {
    var map = { auto: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO', fill: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', zoom: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' };
    try { this.av().setDisplayMethod(map[m] || map.auto); } catch (e) { /* ignore */ }
  };
  AVPlayEngine.prototype.tracks = function (kind) {
    var type = kind === 'text' ? 'TEXT' : 'AUDIO', out = [];
    try {
      this.av().getTotalTrackInfo().forEach(function (t) {
        if (t.type !== type) return;
        var info = {};
        try { info = JSON.parse(t.extra_info); } catch (e) { /* ignore */ }
        var lang = info.language || info.track_lang || '';
        out.push({ index: t.index, lang: lang, label: (lang || 'Traccia ' + (out.length + 1)).toUpperCase() });
      });
    } catch (e) { /* ignore */ }
    return out;
  };
  AVPlayEngine.prototype.currentTrack = function (kind) {
    if (kind === 'text') return this.textIdx;
    try {
      var cur = this.av().getCurrentStreamInfo().filter(function (s) { return s.type === 'AUDIO'; })[0];
      return cur ? cur.index : -1;
    } catch (e) { return -1; }
  };
  AVPlayEngine.prototype.selectTrack = function (kind, idx) {
    var av = this.av();
    try {
      if (kind === 'text') {
        this.textIdx = idx;
        if (idx < 0) { av.setSilentSubtitle(true); this.cb('subtitle', ''); }
        else { av.setSilentSubtitle(false); av.setSelectTrack('TEXT', idx); }
      } else av.setSelectTrack('AUDIO', idx);
    } catch (e) { /* ignore */ }
  };
  AVPlayEngine.prototype.suspend = function () { try { this.av().suspend(); } catch (e) { /* ignore */ } };
  AVPlayEngine.prototype.restore = function () { try { this.av().restore(); } catch (e) { /* ignore */ } };

  /* ================================================ motore HTML5 */
  function Html5Engine(cb) {
    var v = this.v = U.$('#vid'), self = this;
    this.cb = cb;
    this.hls = null; this.mp = null; this.textIdx = -1;
    v.addEventListener('waiting', function () { cb('buffering'); });
    v.addEventListener('stalled', function () { cb('buffering'); });
    v.addEventListener('playing', function () { cb('playing'); });
    v.addEventListener('ended', function () { cb('ended'); });
    v.addEventListener('timeupdate', function () { cb('time', v.currentTime); self.pollSubs(); });
    v.addEventListener('error', function () {
      if (self.hls || self.mp || !v.getAttribute('src')) return;
      cb('error', v.error && v.error.code);
    });
  }
  Html5Engine.prototype.name = 'html5';

  Html5Engine.prototype.load = function (url, o) {
    var v = this.v, cb = this.cb, self = this, buf = bufferCfg().hls;
    this.stop();
    this.textIdx = -1;
    var path = url.split('?')[0].toLowerCase();
    var isHls = /\.m3u8$/.test(path) || /\/hls\//.test(path);
    var isVod = /\.(mp4|mkv|webm|mov|avi|m4v|wmv)$/.test(path);
    var isTs = /\.ts$/.test(path) || (o.live && !isHls && !isVod);

    if (isHls && window.Hls && window.Hls.isSupported()) {
      var Hls = window.Hls, netErr = 0, medErr = 0;
      var h = this.hls = new Hls({
        enableWorker: true,
        maxBufferLength: buf, maxMaxBufferLength: buf * 2, backBufferLength: o.live ? 10 : 30,
        liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 12, maxLiveSyncPlaybackRate: 1.05,
        maxBufferHole: 1, nudgeMaxRetry: 10, highBufferWatchdogPeriod: 2,
        manifestLoadingMaxRetry: 6, levelLoadingMaxRetry: 6, fragLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000, fragLoadingRetryDelay: 1000,
        startPosition: o.startAt > 0 ? o.startAt : -1,
        subtitleDisplay: false, renderTextTracksNatively: true
      });
      h.on(Hls.Events.MANIFEST_PARSED, function () { v.play()['catch'](function () { }); });
      h.on(Hls.Events.FRAG_BUFFERED, function () { netErr = 0; });
      h.on(Hls.Events.ERROR, function (ev, d) {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netErr++ < 3) { h.startLoad(); return; }
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && medErr++ < 2) { h.recoverMediaError(); return; }
        cb('error', d.details);
      });
      h.loadSource(url);
      h.attachMedia(v);
      return;
    }

    if (isTs && window.mpegts && mpegts.getFeatureList().mseLivePlayback) {
      var mp = this.mp = mpegts.createPlayer({ type: 'mpegts', isLive: !!o.live, url: url }, {
        enableWorker: true, lazyLoad: !o.live, enableStashBuffer: true, stashInitialSize: 1024 * 1024,
        // niente salti in avanti per recuperare il ritardo (causano scatti): si accelera di poco
        liveBufferLatencyChasing: false, liveSync: true, liveSyncMaxLatency: 15, liveSyncTargetLatency: 8, liveSyncPlaybackRate: 1.05,
        autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30
      });
      mp.on(mpegts.Events.ERROR, function (t, d) { cb('error', t + ':' + d); });
      mp.on(mpegts.Events.LOADING_COMPLETE, function () { if (o.live) cb('ended'); });
      mp.attachMediaElement(v);
      mp.load();
      var pp = mp.play();
      if (pp && pp['catch']) pp['catch'](function () { });
      return;
    }

    v.src = url;
    if (o.startAt > 0) {
      var seekOnce = function () { v.removeEventListener('loadedmetadata', seekOnce); try { v.currentTime = o.startAt; } catch (e) { /* ignore */ } };
      v.addEventListener('loadedmetadata', seekOnce);
    }
    var p = v.play();
    if (p && p['catch']) p['catch'](function (e) { if (e && e.name === 'NotSupportedError') cb('error', e.name); });
  };

  Html5Engine.prototype.stop = function () {
    var v = this.v;
    if (this.hls) { try { this.hls.destroy(); } catch (e) { /* ignore */ } this.hls = null; }
    if (this.mp) {
      try { this.mp.pause(); this.mp.unload(); this.mp.detachMediaElement(); this.mp.destroy(); } catch (e) { /* ignore */ }
      this.mp = null;
    }
    try { v.pause(); } catch (e) { /* ignore */ }
    v.removeAttribute('src');
    try { v.load(); } catch (e) { /* ignore */ }
  };
  /*
   * Piccoli blocchi: se c'e' un "buco" nel buffer o il video e' fermo con dati gia'
   * scaricati, salta di poco in avanti invece di riavviare tutto lo stream.
   */
  Html5Engine.prototype.nudge = function () {
    var v = this.v, b = v.buffered, t = v.currentTime;
    try {
      if (b.length && t < b.start(0) - 0.05) { v.currentTime = b.start(0) + 0.1; return true; }
      for (var i = 0; i < b.length; i++) {
        var st = b.start(i), en = b.end(i);
        if (st > t + 0.05 && st - t < 6) { v.currentTime = st + 0.1; return true; }
        if (t >= st && t <= en && en - t > 1 && v.readyState < 3) { v.currentTime = t + 0.2; return true; }
      }
      if (v.paused && !this.userPaused) { this.play(); return true; }
    } catch (e) { /* ignore */ }
    return false;
  };
  Html5Engine.prototype.play = function () { var p = this.v.play(); if (p && p['catch']) p['catch'](function () { }); };
  Html5Engine.prototype.pause = function () { this.v.pause(); };
  Html5Engine.prototype.isPaused = function () { return this.v.paused; };
  Html5Engine.prototype.time = function () { return this.v.currentTime || 0; };
  Html5Engine.prototype.duration = function () { var d = this.v.duration; return isFinite(d) ? d : 0; };
  Html5Engine.prototype.seek = function (s) { try { this.v.currentTime = Math.max(0, s); } catch (e) { /* ignore */ } };
  Html5Engine.prototype.setRect = function () { };
  Html5Engine.prototype.setAspect = function (m) {
    this.v.style.objectFit = m === 'fill' ? 'fill' : m === 'zoom' ? 'cover' : 'contain';
  };
  Html5Engine.prototype.nativeText = function () {
    var out = [], tt = this.v.textTracks || [];
    for (var i = 0; i < tt.length; i++) if (tt[i].kind === 'subtitles' || tt[i].kind === 'captions') out.push(tt[i]);
    return out;
  };
  Html5Engine.prototype.tracks = function (kind) {
    var h = this.hls, v = this.v, out = [];
    if (kind === 'text') {
      if (h) return h.subtitleTracks.map(function (t, i) { return { index: i, lang: t.lang || '', label: t.name || t.lang || 'Sottotitoli ' + (i + 1) }; });
      return this.nativeText().map(function (t, i) { return { index: i, lang: t.language || '', label: t.label || t.language || 'Sottotitoli ' + (i + 1) }; });
    }
    if (h) return h.audioTracks.map(function (t, i) { return { index: i, lang: t.lang || '', label: t.name || t.lang || 'Audio ' + (i + 1) }; });
    if (v.audioTracks) {
      for (var i = 0; i < v.audioTracks.length; i++) {
        var a = v.audioTracks[i];
        out.push({ index: i, lang: a.language || '', label: a.label || a.language || 'Audio ' + (i + 1) });
      }
    }
    return out;
  };
  Html5Engine.prototype.currentTrack = function (kind) {
    if (kind === 'text') return this.textIdx;
    if (this.hls) return this.hls.audioTrack;
    var at = this.v.audioTracks;
    if (at) for (var i = 0; i < at.length; i++) if (at[i].enabled) return i;
    return -1;
  };
  Html5Engine.prototype.selectTrack = function (kind, idx) {
    if (kind === 'text') {
      this.textIdx = idx;
      if (this.hls) this.hls.subtitleTrack = idx;
      else this.nativeText().forEach(function (t, i) { t.mode = i === idx ? 'hidden' : 'disabled'; });
      if (idx < 0) this.cb('subtitle', '');
      return;
    }
    if (this.hls) { this.hls.audioTrack = idx; return; }
    var at = this.v.audioTracks;
    if (at) for (var i = 0; i < at.length; i++) at[i].enabled = i === idx;
  };
  Html5Engine.prototype.pollSubs = function () {
    if (this.textIdx < 0) return;
    var tt = this.v.textTracks || [], txt = [];
    for (var i = 0; i < tt.length; i++) {
      var t = tt[i];
      if (t.mode === 'showing') t.mode = 'hidden';      // il rendering lo facciamo noi
      if (t.mode !== 'hidden' || !t.activeCues) continue;
      for (var j = 0; j < t.activeCues.length; j++) txt.push(cleanCue(t.activeCues[j].text));
    }
    var s = txt.join('\n');
    if (s !== this.lastSub) { this.lastSub = s; this.cb('subtitle', s); }
  };
  Html5Engine.prototype.suspend = function () { this.pause(); };
  Html5Engine.prototype.restore = function () { this.play(); };

  /* ================================================ controller */
  var P = App.Player = {
    mode: null,          // null | 'mini' | 'full'
    item: null,
    list: null,
    index: -1,
    opts: {},
    engine: null,
    engines: {},
    state: 'idle',
    retries: 0,
    lastTime: 0,
    lastTick: 0,
    lastMove: 0,
    stableSince: 0,
    tracksApplied: false,
    layer: null,

    init: function () {
      P.el = U.$('#player');
      P.subs = U.$('#subs');
      P.buildOsd();
      setInterval(P.watchdog, 1000);
      document.addEventListener('visibilitychange', function () {
        if (!P.mode || !P.engine) return;
        if (document.hidden) P.engine.suspend(); else P.engine.restore();
      });
    },

    pickEngine: function () {
      var want = App.Settings.get('engine');
      var name = (want === 'html5' || !App.hasAVPlay()) ? 'html5' : 'avplay';
      if (!P.engines[name]) P.engines[name] = name === 'avplay' ? new AVPlayEngine(P.onEvent) : new Html5Engine(P.onEvent);
      if (P.engine && P.engine !== P.engines[name]) P.engine.stop();
      P.engine = P.engines[name];
      document.body.classList.toggle('engine-avplay', name === 'avplay');
      return P.engine;
    },

    isLive: function () { return P.item && P.item.kind === 'live'; },
    isFull: function () { return P.mode === 'full'; },

    /* opts: {mode:'mini'|'full', rect, list, index, startAt, onExitFull, onChannel} */
    play: function (item, opts) {
      opts = opts || {};
      var url = App.Catalog.url(item);
      if (!url) { UI.toast('Link di riproduzione non disponibile'); return; }
      P.saveResume();
      P.item = item;
      P.opts = opts;
      P.list = opts.list || P.list;
      P.index = opts.index !== undefined ? opts.index : (P.list ? P.list.indexOf(item) : -1);
      P.url = url;
      P.retries = 0;
      P.startAt = opts.startAt || 0;
      P.lastTime = P.startAt;
      P.tracksApplied = false;
      P.pickEngine();
      if (item.kind === 'live') App.UserData.addRecent(item);
      P.setSub('');
      P.setMode(opts.mode || 'full', opts.rect);
      P.updateOsd(true);
      P.load();
    },

    load: function () {
      P.state = 'loading';
      P.userPaused = false;
      if (P.engine) P.engine.userPaused = false;
      P.lastMove = Date.now();
      P.spinner(true);
      P.msg('');
      P.engine.load(U.proxify(P.url, true), {
        live: P.isLive(), startAt: P.startAt, ua: P.item.ua, rect: P.rect()
      });
      P.engine.setAspect(App.Settings.get('aspect'));
    },

    rect: function () {
      if (P.mode === 'full') return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      return P.miniRect;
    },

    setMode: function (mode, rect) {
      var el = P.el;
      if (mode === 'mini') {
        P.miniRect = rect;
        el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px';
        el.style.width = rect.width + 'px'; el.style.height = rect.height + 'px';
        el.className = 'mini';
        if (P.layer) { Nav.pop(P.layer); P.layer = null; }
        P.hideOsd();
        document.body.classList.remove('player-full');
        document.body.classList.add('player-mini');
      } else {
        el.style.left = el.style.top = '0px';
        el.style.width = '100%'; el.style.height = '100%';
        el.className = 'full';
        document.body.classList.remove('player-mini');
        document.body.classList.add('player-full');
        if (!P.layer) {
          P.layer = { zones: { osd: P.zone }, current: 'osd' };
          Nav.push(P.layer);
        }
        P.showOsd();
      }
      P.mode = mode;
      if (P.engine) P.engine.setRect(P.rect());
    },

    toFull: function () { if (P.mode) P.setMode('full'); },
    toMini: function (rect) { if (P.mode) P.setMode('mini', rect); },

    exitFull: function () {
      if (P.opts.onExitFull) P.opts.onExitFull();
      else P.close();
    },

    close: function () {
      if (!P.mode) return;
      P.saveResume();
      if (P.engine) P.engine.stop();
      if (P.layer) { Nav.pop(P.layer); P.layer = null; }
      P.mode = null; P.state = 'idle'; P.item = null;
      P.el.className = 'hidden';
      P.hideOsd();
      P.spinner(false); P.msg(''); P.setSub('');
      document.body.classList.remove('player-full', 'player-mini');
      var cb = P.opts.onClose;
      P.opts = {};
      if (cb) cb();
    },

    /* ------------------------------------------------------ eventi */
    onEvent: function (type, data) {
      if (!P.mode) return;
      switch (type) {
        case 'buffering':
          if (P.state !== 'loading') P.state = 'buffering';
          P.spinner(true);
          break;
        case 'playing':
          P.state = 'playing';
          P.lastMove = Date.now();
          if (!P.stableSince) P.stableSince = Date.now();
          P.spinner(false); P.msg('');
          if (!P.tracksApplied) { P.tracksApplied = true; setTimeout(P.applyDefaultTracks, 1500); }
          P.updateOsd(true);
          if (P.osdVisible) P.refreshPlayBtn();
          break;
        case 'time':
          if (Math.abs(data - P.lastTime) > 0.05) { P.lastMove = Date.now(); if (P.state === 'buffering' || P.state === 'loading') { P.state = 'playing'; P.spinner(false); } }
          P.lastTime = data;
          break;
        case 'ended':
          if (P.isLive()) P.recover('fine flusso');
          else if (P.item.kind === 'episode' && P.hasNext()) { P.saveResume(); P.playNext(); }
          else { App.UserData.setResume(P.item, 0, 0); P.close(); }
          break;
        case 'error':
          P.recover('errore ' + (data || ''));
          break;
        case 'subtitle':
          P.setSub(data);
          break;
      }
    },

    watchdog: function () {
      if (!P.mode || !P.engine) return;
      var now = Date.now();
      if (P.state === 'playing' || P.state === 'buffering' || P.state === 'loading') {
        if (P.engine.isPaused() && P.userPaused) { P.lastMove = now; return; }
        var t = P.engine.time();
        if (Math.abs(t - P.lastTick) > 0.05) { P.lastTick = t; P.lastMove = now; }
        var still = now - P.lastMove;
        // 1) blocco breve: piccolo salto nel buffer (senza riconnettersi)
        if (still > 2500 && P.state !== 'loading' && P.engine.nudge && now - (P.lastNudge || 0) > 2500) {
          P.lastNudge = now;
          if (P.engine.nudge()) return;
        }
        // 2) blocco lungo: riconnessione
        var limit = P.state === 'loading' ? 25000 : (P.isLive() ? 10000 : 20000);
        if (still > limit) P.recover('blocco');
      }
      if (P.retries && P.state === 'playing' && P.stableSince && now - P.stableSince > 30000) P.retries = 0;
      if (P.osdVisible) P.updateOsd(false);
      if (!P.isLive() && P.state === 'playing' && now - (P.lastSave || 0) > 15000) P.saveResume();
    },

    recover: function (reason) {
      if (!P.mode) return;
      P.stableSince = 0;
      if (!App.Settings.get('autoReconnect') || P.retries >= 8) {
        P.state = 'error';
        P.spinner(false);
        P.msg('Impossibile riprodurre il contenuto.<br><small>Verifica la connessione o prova un altro formato/motore nelle Impostazioni.</small>');
        return;
      }
      P.retries++;
      var delay = Math.min(1000 * Math.pow(2, P.retries - 1), 10000);
      P.state = 'retry';
      P.spinner(true);
      P.msg('Riconnessione in corso… (' + P.retries + '/8)');
      if (!P.isLive()) P.startAt = Math.max(0, P.lastTime - 2);
      if (P.engine) P.engine.stop();
      clearTimeout(P.retryT);
      var item = P.item;
      P.retryT = setTimeout(function () { if (P.mode && P.item === item) P.load(); }, delay);
      if (window.console) console.warn('[player] recover:', reason);
    },

    saveResume: function () {
      if (!P.item || P.isLive() || !P.engine) return;
      var d = P.engine.duration(), t = P.engine.time() || P.lastTime;
      if (d > 0) App.UserData.setResume(P.item, t, d);
      P.lastSave = Date.now();
    },

    /* ----------------------------------------------- tracce */
    applyDefaultTracks: function () {
      if (!P.mode || !P.engine) return;
      var s = App.Settings.data, e = P.engine;
      var audio = e.tracks('audio');
      if (audio.length > 1 && s.audioLang) {
        var a = audio.filter(function (t) { return langOf(t.lang) === langOf(s.audioLang) || langOf(t.label) === langOf(s.audioLang); })[0];
        if (a && e.currentTrack('audio') !== a.index) e.selectTrack('audio', a.index);
      }
      var text = e.tracks('text');
      var pick = -1;
      if (s.subAuto && text.length) {
        var m = text.filter(function (t) { return langOf(t.lang) === langOf(s.subLang) || langOf(t.label) === langOf(s.subLang); })[0];
        pick = m ? m.index : -1;
      }
      e.selectTrack('text', pick);
    },

    menuTracks: function (kind) {
      var e = P.engine, tracks = e.tracks(kind), cur = e.currentTrack(kind);
      var opts = tracks.map(function (t) { return { label: t.label, sub: t.lang && t.lang !== t.label ? t.lang : '', idx: t.index, checked: t.index === cur }; });
      if (kind === 'text') opts.unshift({ label: 'Disattivati', idx: -1, checked: cur < 0 });
      if (!tracks.length) {
        UI.toast(kind === 'text' ? 'Nessun sottotitolo disponibile per questo contenuto' : 'Una sola traccia audio disponibile');
        return;
      }
      UI.select({
        title: kind === 'text' ? 'Sottotitoli' : 'Traccia audio', options: opts,
        onSelect: function (o) { e.selectTrack(kind, o.idx); UI.toast((kind === 'text' ? 'Sottotitoli: ' : 'Audio: ') + o.label); }
      });
    },

    cycleAspect: function () {
      var order = ['auto', 'fill', 'zoom'], names = { auto: 'Originale', fill: 'Adatta allo schermo', zoom: 'Zoom' };
      var cur = App.Settings.get('aspect'), n = order[(order.indexOf(cur) + 1) % order.length];
      App.Settings.set('aspect', n);
      P.engine.setAspect(n);
      UI.toast('Formato: ' + names[n]);
    },

    /* --------------------------------------------- canali/episodi */
    /*
     * Cambio canale: il nome compare subito, lo stream parte quando ti fermi
     * (premendo piu' volte ▲▼ non si apre una connessione per ogni canale saltato).
     */
    zap: function (delta) {
      if (!P.list || !P.list.length) return;
      var base = P.pendingZap !== undefined && P.pendingZap !== null ? P.pendingZap : P.index;
      var i = (base + delta + P.list.length) % P.list.length;
      P.pendingZap = i;
      P.hideOsd();
      var it = P.list[i], z = U.$('#p-zap');
      z.innerHTML = '<small>' + U.esc(it.num || '') + '</small>' + U.esc(it.name);
      z.className = 'zap-name';
      z.style.display = 'block';
      clearTimeout(P.zapT);
      P.zapT = setTimeout(function () {
        P.pendingZap = null;
        z.style.display = 'none'; z.className = '';
        if (i !== P.index) P.zapTo(i);
      }, 650);
    },
    zapTo: function (i) {
      var it = P.list[i];
      if (!it) return;
      var o = P.opts;
      o.index = i; o.list = P.list; o.mode = P.mode; o.rect = P.miniRect; o.startAt = 0;
      P.play(it, o);
      if (o.onChannel) o.onChannel(it, i);
    },
    hasNext: function () { return P.list && P.index >= 0 && P.index < P.list.length - 1; },
    playNext: function () {
      if (!P.hasNext()) return;
      var nx = P.list[P.index + 1];
      UI.toast('Prossimo episodio: ' + nx.name);
      var r = App.UserData.getResume(nx);
      P.opts.startAt = r ? r.pos : 0;
      P.opts.index = P.index + 1;
      P.play(nx, P.opts);
    },

    /* --------------------------------------------------------- UI */
    spinner: function (on) { U.$('#p-spinner').style.display = on ? 'block' : 'none'; },
    msg: function (html) {
      var m = U.$('#p-msg');
      m.innerHTML = html || '';
      m.style.display = html ? 'block' : 'none';
    },
    setSub: function (t) {
      var s = App.Settings.get('subSize');
      P.subs.className = 'sub-' + (s || 'medium');
      P.subs.innerHTML = t ? '<span>' + U.esc(t).replace(/\n/g, '<br>') + '</span>' : '';
    },

    buildOsd: function () {
      var osd = U.$('#osd');
      osd.innerHTML =
        '<div class="osd-top"><div class="osd-logo"></div><div class="osd-titles"><div class="osd-title"></div><div class="osd-sub"></div></div><div class="osd-clock"></div></div>' +
        '<div class="osd-bottom">' +
        '<div class="osd-live"><div class="osd-now"></div><div class="osd-bar"><i></i></div><div class="osd-next"></div></div>' +
        '<div class="osd-vod"><span class="osd-t0">0:00</span><div class="osd-bar"><i></i><b></b></div><span class="osd-t1">0:00</span></div>' +
        '<div class="osd-btns"></div>' +
        '<div class="osd-hint"></div>' +
        '</div>';
      P.btns = new App.List({
        el: U.$('.osd-btns', osd), dir: 'h', cls: 'osd-btn',
        render: function (b) { return UI.icons[b.icon] + '<span>' + U.esc(b.label) + '</span>'; },
        onSelect: function (b) { P.showOsd(); b.run(); }
      });
      P.zone = {
        edges: {},
        activate: function () { if (P.osdFocus === 'btns') P.btns.activate(); },
        deactivate: function () { P.btns.deactivate(); },
        handle: P.handleKey
      };
    },

    osdButtons: function () {
      var b = [];
      b.push({ icon: P.engine && P.engine.isPaused() ? 'play' : 'pause', label: P.engine && P.engine.isPaused() ? 'Riproduci' : 'Pausa', run: P.togglePause });
      b.push({ icon: 'cc', label: 'Sottotitoli', run: function () { P.menuTracks('text'); } });
      b.push({ icon: 'audio', label: 'Audio', run: function () { P.menuTracks('audio'); } });
      b.push({ icon: 'aspect', label: 'Formato', run: P.cycleAspect });
      if (P.isLive()) b.push({ icon: 'star', label: App.UserData.isFav(P.item) ? 'Rimuovi preferito' : 'Preferito', run: P.toggleFav });
      else b.push({ icon: 'restart', label: 'Dall\'inizio', run: function () { P.engine.seek(0); } });
      if (P.item && P.item.kind === 'episode' && P.hasNext()) b.push({ icon: 'next', label: 'Prossimo episodio', run: P.playNext });
      return b;
    },

    toggleFav: function () {
      var on = App.UserData.toggleFav(P.item);
      UI.toast(on ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
      P.btns.setItems(P.osdButtons(), P.btns.index);
    },

    togglePause: function () {
      if (!P.engine) return;
      if (P.engine.isPaused()) { P.userPaused = false; P.engine.play(); } else { P.userPaused = true; P.engine.pause(); }
      P.engine.userPaused = P.userPaused;
      setTimeout(P.refreshPlayBtn, 150);
      P.showOsd();
    },

    refreshPlayBtn: function () {
      if (!P.btns.items.length || !P.engine) return;
      P.btns.items[0] = P.osdButtons()[0];
      P.btns.refreshItem(0);
    },

    setOsdFocus: function (f) {
      P.osdFocus = f;
      U.$('#osd .osd-vod').classList.toggle('focus', f === 'bar');
      if (f === 'btns' && P.layer) P.btns.activate(); else P.btns.deactivate();
    },

    updateOsd: function (full) {
      if (!P.item) return;
      var osd = U.$('#osd'), it = P.item, live = P.isLive();
      osd.classList.toggle('is-live', !!live);
      osd.classList.toggle('is-vod', !live);
      U.$('.osd-clock', osd).textContent = U.fmtTime(new Date());
      if (full) {
        U.$('.osd-logo', osd).innerHTML = U.img(it.logo || it.poster);
        var title = it.kind === 'episode' ? it.seriesName : it.name;
        U.$('.osd-title', osd).textContent = (live && it.num ? it.num + '  ' : '') + title;
        U.$('.osd-sub', osd).textContent = it.kind === 'episode' ? ('S' + U.pad2(it.season) + ' E' + U.pad2(it.ep) + ' · ' + it.name) : (it.year || '');
        if (live) {
          App.EPG.get(it).then(function (progs) {
            if (P.item !== it) return;
            P.epg = App.EPG.now(progs);
            P.updateOsd(false);
          });
        }
      }
      if (live) {
        var e = P.epg && P.item === it ? P.epg : App.EPG.now(App.EPG.cached(it));
        var cur = e.cur, nx = e.next;
        U.$('.osd-now', osd).innerHTML = cur ? '<b>' + U.fmtTime(cur.start) + ' – ' + U.fmtTime(cur.end) + '</b> ' + U.esc(cur.title) : 'Nessuna informazione sul programma';
        U.$('.osd-live .osd-bar i', osd).style.width = (App.EPG.progress(cur) * 100) + '%';
        U.$('.osd-next', osd).innerHTML = nx ? 'A seguire: <b>' + U.fmtTime(nx.start) + '</b> ' + U.esc(nx.title) : '';
      } else if (P.engine) {
        var d = P.engine.duration(), t = P.seekTarget !== null && P.seekTarget !== undefined ? P.seekTarget : P.engine.time();
        U.$('.osd-t0', osd).textContent = U.fmtDuration(t);
        U.$('.osd-t1', osd).textContent = d ? U.fmtDuration(d) : '--:--';
        var pct = (d ? U.clamp(t / d, 0, 1) * 100 : 0) + '%';
        U.$('.osd-vod .osd-bar i', osd).style.width = pct;
        U.$('.osd-vod .osd-bar b', osd).style.left = pct;
      }
    },

    showOsd: function (ms) {
      var osd = U.$('#osd');
      if (!P.osdVisible) {
        P.osdVisible = true;
        osd.classList.add('show');
        P.btns.setItems(P.osdButtons(), 0);
        U.$('.osd-hint', osd).innerHTML = P.isLive()
          ? '▲▼ cambia canale · 0-9 numero canale · <span class="k red"></span> sottotitoli <span class="k green"></span> audio <span class="k yellow"></span> formato <span class="k blue"></span> preferito'
          : '◀▶ avanti/indietro · OK pausa · ▼ altri comandi · <span class="k red"></span> sottotitoli <span class="k green"></span> audio <span class="k yellow"></span> formato';
        P.setOsdFocus(P.isLive() ? 'btns' : 'bar');
      }
      P.updateOsd(false);
      clearTimeout(P.osdT);
      P.osdT = setTimeout(P.hideOsd, ms || 6000);
    },
    hideOsd: function () {
      P.osdVisible = false;
      clearTimeout(P.osdT);
      var osd = U.$('#osd');
      if (osd) osd.classList.remove('show');
    },

    seekBy: function (delta) {
      if (P.isLive() || !P.engine) return;
      var d = P.engine.duration();
      if (P.seekTarget === null || P.seekTarget === undefined) P.seekTarget = P.engine.time();
      P.seekTarget = U.clamp(P.seekTarget + delta, 0, d ? d - 3 : 1e9);
      P.showOsd();
      clearTimeout(P.seekT);
      P.seekT = setTimeout(function () {
        P.engine.seek(P.seekTarget);
        P.lastMove = Date.now();
        P.seekTarget = null;
        P.seekCount = 0;
      }, 900);
    },

    /* passo di ricerca che accelera tenendo premuto */
    seekStep: function (a) {
      P.seekCount = (P.seekCount || 0) + 1;
      var step = P.seekCount > 8 ? 60 : P.seekCount > 4 ? 30 : 10;
      P.seekBy(a === 'left' ? -step : step);
    },

    digits: function (n) {
      var z = U.$('#p-zap');
      P.numBuf = (P.numBuf || '') + n;
      z.className = '';
      z.textContent = P.numBuf;
      z.style.display = 'block';
      clearTimeout(P.numT);
      P.numT = setTimeout(function () {
        var num = P.numBuf; P.numBuf = ''; z.style.display = 'none';
        if (!P.list) return;
        for (var i = 0; i < P.list.length; i++) {
          if (String(P.list[i].num) === num) { P.zapTo(i); return; }
        }
        UI.toast('Canale ' + num + ' non trovato');
      }, 1800);
    },

    handleKey: function (a, e) {
      var live = P.isLive();
      switch (a) {
        case 'red': P.menuTracks('text'); return true;
        case 'green': P.menuTracks('audio'); return true;
        case 'yellow': P.cycleAspect(); return true;
        case 'blue': if (live) P.toggleFav(); return true;
        case 'play': P.userPaused = P.engine.userPaused = false; P.engine.play(); P.showOsd(); return true;
        case 'pause': P.userPaused = P.engine.userPaused = true; P.engine.pause(); P.showOsd(); return true;
        case 'playpause': P.togglePause(); return true;
        case 'stop': P.close(); return true;
        case 'ff': P.seekBy(30); return true;
        case 'rw': P.seekBy(-30); return true;
        case 'next': if (P.item.kind === 'episode') P.playNext(); else if (live) P.zap(1); return true;
        case 'prev': if (live) P.zap(-1); return true;
        case 'digit': if (live) P.digits(e.digit); return true;
        case 'chup': if (live) P.zap(1); else P.seekBy(60); return true;
        case 'chdown': if (live) P.zap(-1); else P.seekBy(-60); return true;
        case 'info': if (P.osdVisible) P.hideOsd(); else P.showOsd(10000); return true;
      }
      if (P.state === 'error' && a === 'ok') { P.retries = 0; P.load(); return true; }
      if (P.osdVisible) {
        if (a === 'back') { P.hideOsd(); return true; }
        if (live) {
          if (a === 'up' || a === 'down') { P.zap(a === 'up' ? 1 : -1); return true; }
        } else if (P.osdFocus === 'bar') {
          if (a === 'left' || a === 'right') { P.seekStep(a); return true; }
          if (a === 'ok') { P.togglePause(); return true; }
          if (a === 'down') { P.setOsdFocus('btns'); P.showOsd(); return true; }
          if (a === 'up') { P.hideOsd(); return true; }
        } else {
          if (a === 'up') { P.setOsdFocus('bar'); P.showOsd(); return true; }
          if (a === 'down') { P.hideOsd(); return true; }
        }
        P.btns.handle(a);
        P.showOsd();
        return true;
      }
      if (a === 'back') { P.exitFull(); return true; }
      if (a === 'ok') { P.showOsd(); return true; }
      if (live) {
        if (a === 'up') { P.zap(1); return true; }
        if (a === 'down') { P.zap(-1); return true; }
        P.showOsd();
        return true;
      }
      if (a === 'left' || a === 'right') { P.seekStep(a); return true; }
      P.showOsd();
      return true;
    }
  };
})();
