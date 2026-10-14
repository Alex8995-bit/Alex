/* Avvio, temi, header (data + scadenza), routing tra schermate, card e righe. */
(function () {
  'use strict';
  var App = window.App, U = App.U, Nav = App.Nav, UI = App.UI;

  /* ------------------------------------------------------------ temi */
  App.THEMES = {
    prime: { name: 'Prime Video (blu)', accent: '#1A98FF', accText: '#fff', bg: '#0F171E', bg2: '#1B2838', panel: 'rgba(27,37,48,.92)' },
    netflix: { name: 'Netflix (rosso)', accent: '#E50914', accText: '#fff', bg: '#141414', bg2: '#2a0c0e', panel: 'rgba(28,28,28,.92)' },
    youtube: { name: 'YouTube (scuro)', accent: '#FF0033', accText: '#fff', bg: '#0F0F0F', bg2: '#1f1f1f', panel: 'rgba(30,30,30,.92)' },
    apple: { name: 'Apple TV (minimal)', accent: '#FFFFFF', accText: '#000', bg: '#000000', bg2: '#1c1c1e', panel: 'rgba(22,22,24,.92)' }
  };

  var THEME_CSS = [
    '#bg{background:radial-gradient(ellipse at 70% 0%,{bg2} 0%,{bg} 60%);}',
    '.modal-box,#loading .box{background:{bg2};}',
    '.cats,.live-chs,.live-info-wrap,.set-menu{background:{panel};}',
    '.live-side{background:{bg};}',
    '#tabs .li.sel{color:#fff;}',
    '#tabs .li.focus{background:{accent};color:{accText};transform:scale(1.06);}',
    '.zone-active .li.focus.cat,.zone-active .li.focus.set-item{background:{accent};color:{accText};}',
    '.cat.sel,.set-item.sel{box-shadow:inset 5px 0 0 {accent};}',
    '.zone-active .cat.sel.focus,.zone-active .set-item.sel.focus{box-shadow:none;}',
    '.ch.sel{background:rgba(255,255,255,.06);}',
    '.zone-active .ch.focus{background:{accent};color:{accText};}',
    '.zone-active .ch.focus .ch-epg,.zone-active .ch.focus .ch-num{opacity:.9;}',
    '.pbar i,.li-bar i,.osd-bar i,.card-prog i{background:{accent};}',
    '.zone-active .ch.focus .pbar i{background:{accText};}',
    '.ch-playing{background:{accent};color:{accText};}',
    '.zone-active .ch.focus .ch-playing{background:{accText};color:{accent};}',
    '.zone-active .card.focus .card-img,.zone-active .wcard.focus .card-img,.zone-active .ep.focus .card-img{transform:scale(1.08);box-shadow:0 0 0 4px #fff,0 18px 40px rgba(0,0,0,.7);}',
    '.zone-active .btn.focus,.zone-active .osd-btn.focus,.zone-active .wbtn.focus,.zone-active .season.focus{background:{accent};color:{accText};transform:scale(1.05);}',
    '.season.sel{box-shadow:inset 0 -4px 0 {accent};}',
    '.zone-active .opt.focus,.zone-active .form-row.focus,.zone-active .srow.focus{background:{accent};color:{accText};}',
    '.zone-active .key.focus{background:{accent};color:{accText};transform:scale(1.1);}',
    '.field.focus,.search-field.focus{border-color:{accent};}',
    '.spin,#p-spinner{border-top-color:{accent};}',
    '#logo{color:{accent};}#logo span{color:#fff;}',
    '.hero-meta .rating,.d-meta .rating{color:{accent};}',
    '.vod-bg .shade{background:linear-gradient(to right,{bg} 3%,rgba(0,0,0,0) 45%),linear-gradient(to top,{bg} 38%,rgba(0,0,0,0) 75%);}',
    '.home-bg .shade{background:linear-gradient(to right,{bg} 22%,rgba(0,0,0,0) 65%),linear-gradient(to top,{bg} 48%,rgba(0,0,0,0) 85%);}',
    '.detail{background:{bg};}.detail .shade{background:linear-gradient(to right,{bg} 25%,rgba(0,0,0,.2) 80%),linear-gradient(to top,{bg} 30%,rgba(0,0,0,0) 70%);}',
    '.srow .badge{background:{accent};color:{accText};}'
  ].join('\n');

  App.applyTheme = function () {
    var t = App.THEMES[App.Settings.get('theme')] || App.THEMES.prime;
    var css = THEME_CSS.replace(/\{(\w+)\}/g, function (m, k) { return t[k] || m; });
    var st = U.$('#theme-css');
    if (!st) { st = document.createElement('style'); st.id = 'theme-css'; document.head.appendChild(st); }
    st.textContent = css;
  };

  /* Scala il palco 1920x1080 alla risoluzione reale. */
  App.fit = function () {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    ['#stage', '#overlay'].forEach(function (id) {
      var st = U.$(id);
      st.style.transform = st.style.webkitTransform = 'scale(' + s + ')';
      st.style.left = Math.round((window.innerWidth - 1920 * s) / 2) + 'px';
      st.style.top = Math.round((window.innerHeight - 1080 * s) / 2) + 'px';
    });
  };

  App.exit = function () {
    App.Player.close();
    try { tizen.application.getCurrentApplication().exit(); return; } catch (e) { /* non Tizen */ }
    try { window.close(); } catch (e) { /* ignore */ }
    UI.toast('Chiudi l\'app con il tasto Home del telecomando');
  };

  /* ------------------------------------------------------------ card */
  App.Cards = {
    initials: function (name) { return U.esc(String(name || '').slice(0, 40)); },
    poster: function (it) {
      var pr = it.progress ? '<div class="card-prog"><i style="width:' + Math.round(it.progress * 100) + '%"></i></div>' : '';
      var badge = it.rating ? '<span class="card-badge">★ ' + (+it.rating).toFixed(1) + '</span>' : '';
      return '<div class="card-img"><div class="card-ph">' + App.Cards.initials(it.name) + '</div>' +
        U.img(it.poster || it.logo) + badge + pr + '</div><div class="card-title">' + U.esc(it.name) + '</div>';
    },
    channel: function (it) {
      return '<div class="card-img"><div class="card-ph">' + App.Cards.initials(it.name) + '</div>' + U.img(it.logo, 'logo') +
        '</div><div class="card-title">' + (it.num ? it.num + ' · ' : '') + U.esc(it.name) + '</div>';
    },
    resume: function (it) {
      var title = it.kind === 'episode' ? it.seriesName + ' · S' + it.season + 'E' + it.ep : it.name;
      return '<div class="card-img"><div class="card-ph">' + App.Cards.initials(title) + '</div>' + U.img(it.poster) +
        '<div class="card-prog"><i style="width:' + Math.round((it.progress || 0) * 100) + '%"></i></div></div>' +
        '<div class="card-title">' + U.esc(title) + '</div>';
    }
  };

  /* Apre/riproduce un elemento qualsiasi. */
  App.openItem = function (it, list) {
    if (it.kind === 'live') {
      var l = list || App.Catalog.list('live', '__all');
      App.Player.play(it, { mode: 'full', list: l, index: l.indexOf(it) });
    } else if (it.kind === 'episode') {
      var r = App.UserData.getResume(it);
      App.Player.play(it, { mode: 'full', startAt: r ? r.pos : 0, list: [it] });
    } else {
      App.Detail.open(it);
    }
  };

  /* ------------------------------------------------------------ righe */
  /* Pila verticale di liste orizzontali (Home, Cerca). */
  function Rows(o) {
    this.o = o;
    this.el = o.el;
    this.edges = o.edges || {};
    this.rows = [];
    this.idx = 0;
    this.el.innerHTML = '<div class="rows-inner"></div>';
    this.inner = this.el.firstChild;
  }
  App.Rows = Rows;

  Rows.prototype.setRows = function (rows) {
    var self = this;
    this.inner.innerHTML = '';
    this.rows = rows.filter(function (r) { return r.items && r.items.length; });
    this.rows.forEach(function (r, ri) {
      var wide = r.type !== 'poster';
      var div = U.el('<div class="row ' + (wide ? 'row-wide' : 'row-poster') + '"><h3>' + U.esc(r.title) + '</h3><div></div></div>');
      self.inner.appendChild(div);
      r.div = div;
      r.list = new App.List({
        el: div.lastChild, dir: 'h', itemSize: wide ? 300 : 196, view: self.el.clientWidth || 1800,
        cls: wide ? 'wcard' : 'card', margin: 0, anchor: 'start',
        render: r.type === 'channel' ? App.Cards.channel : r.type === 'resume' ? App.Cards.resume : App.Cards.poster,
        onFocus: function (it) { if (self.o.onFocus) self.o.onFocus(it, r); },
        onSelect: function (it) { if (self.o.onSelect) self.o.onSelect(it, r); else App.openItem(it, r.items); }
      });
      r.list.setItems(r.items.slice(0, 60), 0);
      if (ri === 0) div.classList.add('row-active');
    });
    this.idx = 0;
    this.scroll();
  };

  Rows.prototype.scroll = function () {
    var r = this.rows[this.idx];
    var y = r ? r.div.offsetTop : 0;
    this.inner.style.transform = this.inner.style.webkitTransform = 'translate3d(0,' + (-y) + 'px,0)';
    this.rows.forEach(function (x, i) { x.div.classList.toggle('row-active', x === r); });
  };

  Rows.prototype.activate = function () {
    var r = this.rows[this.idx];
    if (r) r.list.activate();
  };
  Rows.prototype.deactivate = function () {
    var r = this.rows[this.idx];
    if (r) r.list.deactivate();
  };
  Rows.prototype.handle = function (a, e) {
    var r = this.rows[this.idx];
    if (!r) return false;
    if (a === 'up' || a === 'down') {
      var n = this.idx + (a === 'up' ? -1 : 1);
      if (n < 0 || n >= this.rows.length) return false;
      r.list.deactivate();
      this.idx = n;
      this.scroll();
      this.rows[n].list.activate();
      return true;
    }
    return r.list.handle(a, e);
  };

  /* ------------------------------------------------------------ header */
  var TABS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'live', label: 'Live TV', icon: 'live' },
    { id: 'movie', label: 'Film', icon: 'movie' },
    { id: 'series', label: 'Serie TV', icon: 'series' },
    { id: 'search', label: 'Cerca', icon: 'search' },
    { id: 'settings', label: 'Impostazioni', icon: 'settings' }
  ];

  App.Header = {
    init: function () {
      App.Header.tabs = new App.List({
        el: U.$('#tabs'), dir: 'h', cls: 'tab',
        render: function (t) { return UI.icons[t.icon] + '<span>' + t.label + '</span>'; },
        onSelect: function (t) { App.go(t.id, { focusContent: true }); },
        edges: { down: function () { return App.screen && App.screen.entry; } }
      });
      App.Header.tabs.setItems(TABS, 0);
      App.Header.tick();
      setInterval(App.Header.tick, 15000);
    },
    select: function (id) {
      for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) App.Header.tabs.setIndex(i, true);
    },
    tick: function () {
      var d = new Date();
      U.$('#hdr-date').innerHTML = U.esc(U.fmtLongDate(d)) + '<b>' + U.fmtTime(d) + '</b>';
    },
    expiry: function () {
      var el = U.$('#hdr-exp'), a = App.Catalog.account;
      el.className = '';
      if (!a) { el.textContent = ''; el.style.display = 'none'; return; }
      el.style.display = '';
      if (a.expiry) {
        var dl = U.daysLeft(a.expiry);
        el.textContent = dl < 0 ? 'Abbonamento scaduto il ' + U.fmtDate(a.expiry)
          : 'Scadenza ' + U.fmtDate(a.expiry) + ' · ' + (dl === 0 ? 'oggi' : dl === 1 ? '1 giorno' : dl + ' giorni');
        el.className = dl < 0 ? 'bad' : dl <= 7 ? 'warn' : 'ok';
      } else if (a.unlimited) {
        el.textContent = 'Scadenza: illimitata';
        el.className = 'ok';
      } else {
        el.textContent = 'Scadenza: non indicata';
      }
    }
  };

  /* ------------------------------------------------------------ routing */
  App.screen = null;

  App.go = function (name, params) {
    params = params || {};
    var sc = App.Screens[name];
    if (!sc) return;
    if (!App.Catalog.loaded && name !== 'settings' && name !== 'welcome') {
      UI.toast('Configura prima una playlist');
      name = 'settings'; sc = App.Screens.settings;
    }
    if (App.screen && App.screen !== sc) {
      App.screen.el.classList.add('hidden');
      if (App.screen.hide) App.screen.hide();
    }
    App.screen = sc;
    App.Header.select(name);
    U.$('#header').classList.toggle('hidden', name === 'welcome');
    sc.el.classList.remove('hidden');
    var zones = { nav: App.Header.tabs };
    var own = sc.show(params) || {};
    for (var k in own) if (own.hasOwnProperty(k)) zones[k] = own[k];
    Nav.setBase({
      zones: zones,
      current: params.focusContent || name === 'welcome' ? sc.entry : (params.focus || 'nav'),
      onBack: App.onBack
    });
  };

  App.onBack = function () {
    var b = Nav.base();
    if (App.screen && App.screen.onBack && App.screen.onBack()) return;
    if (b.current !== 'nav' && b.zones.nav) { Nav.focus('nav'); return; }
    if (App.screen && App.screen.name !== 'home' && App.Catalog.loaded) { App.go('home'); return; }
    UI.confirm('Uscire da ' + App.NAME + '?', '', App.exit, 'Esci');
  };

  /* -------------------------------------------------------- caricamento */
  App.loadActive = function () {
    var p = App.Settings.activeProfile();
    if (!p) { App.Catalog.loaded = false; App.go('welcome'); return Promise.resolve(); }
    App.Player.close();
    UI.loading('Caricamento di «' + p.name + '»…');
    return App.Catalog.load(p, function (s) { UI.loading(s); }).then(function () {
      UI.loading(false);
      App.EPG.init();
      App.Header.expiry();
      App.Screens.live.reset && App.Screens.live.reset();
      App.Screens.movie.reset && App.Screens.movie.reset();
      App.Screens.series.reset && App.Screens.series.reset();
      App.go('home', { focusContent: true });
      var a = App.Catalog.account, dl = a && a.expiry ? U.daysLeft(a.expiry) : null;
      if (dl !== null && dl <= 7) UI.toast(dl < 0 ? 'Attenzione: abbonamento scaduto!' : 'Attenzione: l\'abbonamento scade tra ' + dl + ' giorni', 6000);
    }, function (err) {
      UI.loading(false);
      App.Catalog.loaded = false;
      App.Header.expiry();
      UI.select({
        title: 'Impossibile caricare la playlist',
        message: (err && err.message ? err.message : String(err)),
        options: [{ label: 'Riprova', v: 'retry' }, { label: 'Apri impostazioni', v: 'set' }],
        onSelect: function (o) { if (o.v === 'retry') App.loadActive(); else App.go('settings', { focusContent: true }); }
      });
      App.go('settings');
    });
  };

  /* ------------------------------------------------------- benvenuto */
  App.Screens.welcome = {
    name: 'welcome',
    entry: 'actions',
    el: null,
    show: function () {
      var el = this.el;
      el.innerHTML = '<div class="welcome"><h1>Nova<span>Play</span></h1>' +
        '<p>Benvenuto! Aggiungi la tua lista IPTV per iniziare: Xtream Codes, link M3U oppure un file M3U/configurazione da chiavetta USB.</p>' +
        '<div class="w-list"></div><div class="ver">Versione ' + App.VERSION + '</div></div>';
      var list = new App.List({
        el: U.$('.w-list', el), dir: 'v', cls: 'wbtn',
        render: function (b) { return UI.icons[b.icon] + '<span>' + b.label + '<small>' + b.sub + '</small></span>'; },
        onSelect: function (b) { b.run(); }
      });
      list.setItems([
        { icon: 'live', label: 'Accedi con Xtream Codes', sub: 'Server, nome utente e password', run: App.Profiles.addXtream },
        { icon: 'movie', label: 'Aggiungi link M3U', sub: 'URL della playlist (e guida TV facoltativa)', run: App.Profiles.addM3U },
        { icon: 'usb', label: 'Carica da chiavetta USB', sub: 'File .m3u / .m3u8 oppure novaplay.json', run: App.Profiles.addUsb },
        { icon: 'settings', label: 'Impostazioni', sub: 'Player, aspetto, proxy', run: function () { App.go('settings', { focusContent: true }); } }
      ], 0);
      return { actions: list };
    }
  };

  /* ------------------------------------------------------------ avvio */
  App.Idle = { ping: function () { } };

  App.start = function () {
    App.Settings.load();
    App.applyTheme();
    App.fit();
    window.addEventListener('resize', App.fit);
    App.registerTizenKeys();
    Nav.init();
    App.Player.init();
    App.Header.init();
    ['welcome', 'home', 'live', 'movie', 'series', 'search', 'settings'].forEach(function (n) {
      var div = document.createElement('div');
      div.className = 'screen hidden screen-' + n;
      U.$('#screens').appendChild(div);
      App.Screens[n].el = div;
      if (App.Screens[n].init) App.Screens[n].init(div);
    });
    App.EPG.onUpdate(function () { if (App.screen && App.screen.onEpg) App.screen.onEpg(); });
    App.detectProxy().then(function () { App.loadActive(); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.start);
  else setTimeout(App.start, 0);
})();
