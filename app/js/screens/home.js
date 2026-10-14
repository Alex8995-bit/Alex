/*
 * HOME in stile launcher (Apple TV): tre grandi riquadri Live TV / Film / Serie TV,
 * "Continua a guardare", scorciatoie rapide, orologio e scadenza.
 * Ogni riquadro richiama lo stile della sua sezione: Prime Video, Netflix, YouTube.
 */
(function () {
  'use strict';
  var App = window.App, U = App.U, UI = App.UI, Nav = App.Nav;

  function heroImage(img, src) {
    if (!src) { img.style.opacity = 0; img.removeAttribute('src'); return; }
    if (img.getAttribute('src') === src) return;
    img.style.opacity = 0;
    img.onload = function () { img.style.opacity = ''; };
    img.onerror = function () { img.style.opacity = 0; };
    img.src = src;
  }
  App.heroImage = heroImage;

  /* Riga di meta-informazioni: anno · voto · genere. */
  App.metaHtml = function (o) {
    var m = [];
    if (o.kindLabel) m.push('<span>' + U.esc(o.kindLabel) + '</span>');
    if (o.year) m.push('<span>' + U.esc(o.year) + '</span>');
    if (o.rating) m.push('<span class="rating">★ ' + (+o.rating).toFixed(1) + '</span>');
    if (o.duration) m.push('<span>' + U.fmtMinutes(o.duration) + '</span>');
    if (o.genre) m.push('<span>' + U.esc(o.genre) + '</span>');
    return m.join('');
  };

  function count(n) {
    if (n >= 10000) return Math.round(n / 1000) + 'K';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return String(n);
  }

  var ICON = {
    live: '<svg viewBox="0 0 24 24"><path d="M21 6h-7.6l3.3-3.3-.7-.7L12 6 8 2l-.7.7L10.6 6H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 13H3V8h18zM9 10v7l6-3.5z"/></svg>',
    movie: '<svg viewBox="0 0 24 24"><path d="m18 4 2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4z"/></svg>',
    series: '<svg viewBox="0 0 28 20"><rect width="28" height="20" rx="5" fill="#FF0000"/><path d="M11 5.5v9l8-4.5z" fill="#fff"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M12 4l-1.4 1.4 5.6 5.6H4v2h12.2l-5.6 5.6L12 20l8-8z"/></svg>',
    epg: '<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14zM7 12h5v2H7zm0 4h8v2H7z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z"/></svg>',
    resume: '<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2 4.9l-1.4 1.5A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z"/></svg>'
  };

  var H = App.Screens.home = {
    name: 'home',
    entry: 'tiles',

    init: function (el) {
      el.innerHTML =
        '<div class="h-bg"><div class="h-glow"></div><img class="h-bg-img" alt=""><div class="h-shade"></div></div>' +
        '<div class="h-top"><div class="h-logo">Nova<span>Play</span></div><div class="h-top-list"></div>' +
        '<div class="h-clock"><div class="h-time"></div><div class="h-date"></div></div></div>' +
        '<div class="h-tiles"></div>' +
        '<div class="h-row"><h3></h3><div class="h-row-list"></div></div>' +
        '<div class="h-quick"></div>' +
        '<div class="h-foot"><span class="h-exp"></span><span class="h-user"></span><span class="h-ver">NovaPlay ' + App.VERSION + '</span></div>';

      H.top = new App.List({
        el: U.$('.h-top-list', el), dir: 'h', cls: 'tbtn', margin: 0, edges: { down: 'tiles' },
        render: function (b) {
          return b.id === 'search'
            ? '<span class="tpill">' + UI.icons.search + '<span>Cerca canali, film e serie…</span></span>'
            : '<span class="tround">' + UI.icons.settings + '</span>';
        },
        onSelect: function (b) { App.go(b.id, { focusContent: true }); }
      });

      H.tiles = new App.List({
        el: U.$('.h-tiles', el), dir: 'h', cls: 'htile', margin: 0,
        edges: { up: 'top', down: function () { return H.row.items.length ? 'row' : 'quick'; } },
        render: H.renderTile,
        onFocus: function (t) { H.glow(t.id); },
        onSelect: function (t) { App.go(t.id, { focusContent: true }); }
      });

      H.row = new App.List({
        el: U.$('.h-row-list', el), dir: 'h', itemSize: 300, cls: 'wcard', margin: 0, anchor: 'start',
        edges: { up: 'tiles', down: 'quick' },
        render: function (it) { return it.kind === 'live' ? App.Cards.channel(it) : App.Cards.resume(it); },
        onFocus: function (it) { H.glow(it.kind === 'live' ? 'live' : it.kind === 'movie' ? 'movie' : 'series', it.poster); },
        onSelect: function (it) { App.openItem(it, it.kind === 'live' ? H.row.items : null); }
      });

      H.quick = new App.List({
        el: U.$('.h-quick', el), dir: 'h', cls: 'qtile', margin: 0,
        edges: { up: function () { return H.row.items.length ? 'row' : 'tiles'; } },
        render: function (q) { return q.icon + '<span>' + q.label + '</span>'; },
        onFocus: function () { H.glow(''); },
        onSelect: function (q) { q.run(); }
      });
      H.top.setItems([{ id: 'search' }, { id: 'settings' }], 0);
      setInterval(H.clock, 10000);
    },

    show: function () {
      var C = App.Catalog, D = App.UserData;
      var recent = D.recentList()[0];
      var newMovies = 0, week = Date.now() / 1000 - 7 * 86400;
      C.movie.items.forEach(function (m) { if (m.added > week) newMovies++; });
      var upd = C.cachedAt ? new Date(C.cachedAt) : new Date();
      H.tiles.setItems([
        { id: 'live', title: 'LIVE TV', sub: count(C.live.items.length) + ' canali', badge: 'Aggiornato ' + (U.fmtDate(upd) === U.fmtDate(new Date()) ? 'oggi ' + U.fmtTime(upd) : U.fmtDate(upd)), extra: recent ? 'Ultimo visto: ' + recent.name : 'Guida TV e anteprima' },
        { id: 'movie', title: 'FILM', sub: count(C.movie.items.length) + ' film', badge: newMovies ? newMovies + ' nuovi' : '', extra: 'Continua da dove eri rimasto' },
        { id: 'series', title: 'SERIE TV', sub: count(C.series.items.length) + ' serie', badge: '', extra: 'Episodio successivo automatico' }
      ], H.tiles.index || 0);

      var rowTitle, items = D.resumeList();
      if (items.length) rowTitle = 'Continua a guardare';
      else if ((items = D.recentList()).length) rowTitle = 'Canali visti di recente';
      else if ((items = D.favList('live')).length) rowTitle = 'Canali preferiti';
      else { items = C.list('live', '__all').slice(0, 30); rowTitle = 'Canali in evidenza'; }
      U.$('.h-row h3', H.el).innerHTML = ICON.resume + '<span>' + rowTitle + '</span>';
      H.row.setItems(items.slice(0, 40), 0);
      U.$('.h-row', H.el).style.display = items.length ? '' : 'none';

      H.quick.setItems([
        { icon: UI.icons.search, label: 'Cerca', run: function () { App.go('search', { focusContent: true }); } },
        { icon: ICON.epg, label: 'Guida TV', run: function () { App.go('live', { focusContent: true }); } },
        { icon: UI.icons.star, label: 'Preferiti', run: function () { App.Screens.live.st = { cat: 1, ch: 0 }; App.Screens.live.loadedCat = null; App.go('live', { focusContent: true }); } },
        { icon: ICON.list, label: 'Playlist', run: function () { App.Screens.settings.sec = 0; App.go('settings', { focusContent: true }); } },
        { icon: UI.icons.settings, label: 'Impostazioni', run: function () { App.go('settings', { focusContent: true }); } }
      ], H.quick.index || 0);

      H.clock();
      H.footer();
      return { top: H.top, tiles: H.tiles, row: H.row, quick: H.quick };
    },

    onBack: function () {
      var b = Nav.base();
      if (b.current !== 'tiles') { Nav.focus('tiles'); return true; }
      UI.confirm('Uscire da ' + App.NAME + '?', '', App.exit, 'Esci');
      return true;
    },

    renderTile: function (t) {
      return '<span class="t-deco1"></span><span class="t-deco2"></span>' +
        (t.badge ? '<span class="t-badge">' + U.esc(t.badge) + '</span>' : '') +
        '<span class="t-icon">' + ICON[t.id] + '</span>' +
        '<span class="t-title">' + t.title + '</span>' +
        '<span class="t-sub">' + U.esc(t.sub) + '</span>' +
        '<span class="t-extra">' + U.esc(t.extra) + '</span>' +
        '<span class="t-arrow">' + ICON.arrow + '</span>';
    },

    /* Luce d'ambiente dietro i riquadri, del colore della sezione a fuoco. */
    glow: function (id, img) {
      var g = U.$('.h-glow', H.el);
      g.className = 'h-glow' + (id ? ' glow-' + id : '');
      heroImage(U.$('.h-bg-img', H.el), img || '');
    },

    clock: function () {
      if (!H.el) return;
      var d = new Date();
      U.$('.h-time', H.el).textContent = U.fmtTime(d);
      U.$('.h-date', H.el).textContent = U.fmtLongDate(d);
    },

    footer: function () {
      var a = App.Catalog.account, el = U.$('.h-exp', H.el), txt = '', cls = '';
      if (a && a.expiry) {
        var dl = U.daysLeft(a.expiry);
        txt = dl < 0 ? 'Abbonamento scaduto il ' + U.fmtDate(a.expiry)
          : 'Scadenza ' + U.fmtDate(a.expiry) + ' · ' + (dl === 0 ? 'oggi' : dl === 1 ? '1 giorno' : dl + ' giorni');
        cls = dl < 0 ? 'bad' : dl <= 7 ? 'warn' : 'ok';
      } else if (a && a.unlimited) { txt = 'Scadenza: illimitata'; cls = 'ok'; }
      else txt = 'Scadenza: non indicata';
      el.className = 'h-exp ' + cls;
      el.innerHTML = '<i></i>' + U.esc(txt);
      var p = App.Catalog.profile;
      U.$('.h-user', H.el).textContent = p ? 'Playlist: ' + p.name + (a && a.username ? ' · ' + a.username : '') : '';
    }
  };
})();
