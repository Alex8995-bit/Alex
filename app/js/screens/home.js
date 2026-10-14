/* HOME: sfondo dinamico + righe (continua a guardare, preferiti, novita'). */
(function () {
  'use strict';
  var App = window.App, U = App.U;

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

  var H = App.Screens.home = {
    name: 'home',
    entry: 'rows',

    init: function (el) {
      el.innerHTML = '<div class="home-bg"><img alt=""><div class="shade"></div></div>' +
        '<div class="home-hero"><div class="hero-title"></div><div class="hero-meta"></div><div class="hero-plot"></div></div>' +
        '<div class="home-rows"></div>';
      H.rows = new App.Rows({
        el: U.$('.home-rows', el),
        edges: { up: 'nav' },
        onFocus: U.debounce(H.hero, 180)
      });
    },

    show: function () {
      var C = App.Catalog, D = App.UserData, rows = [];
      rows.push({ title: 'Continua a guardare', type: 'resume', items: D.resumeList() });
      rows.push({ title: 'Canali preferiti', type: 'channel', items: D.favList('live') });
      rows.push({ title: 'Visti di recente', type: 'channel', items: D.recentList().slice(0, 30) });
      rows.push({ title: 'Film aggiunti di recente', type: 'poster', items: C.list('movie', '__recent').slice(0, 40) });
      rows.push({ title: 'Serie TV aggiornate di recente', type: 'poster', items: C.list('series', '__recent').slice(0, 40) });
      rows.push({ title: 'I tuoi film preferiti', type: 'poster', items: D.favList('movie') });
      rows.push({ title: 'Le tue serie preferite', type: 'poster', items: D.favList('series') });
      C.cats('movie').slice(0, 4).forEach(function (c) {
        rows.push({ title: 'Film · ' + c.name, type: 'poster', items: C.list('movie', c.id).slice(0, 40) });
      });
      C.cats('series').slice(0, 3).forEach(function (c) {
        rows.push({ title: 'Serie TV · ' + c.name, type: 'poster', items: C.list('series', c.id).slice(0, 40) });
      });
      C.cats('live').slice(0, 3).forEach(function (c) {
        rows.push({ title: 'Live · ' + c.name, type: 'channel', items: C.list('live', c.id).slice(0, 40) });
      });
      H.rows.setRows(rows);
      var first = H.rows.rows[0];
      H.hero(first && first.items[0], first);
      return { rows: H.rows };
    },

    hero: function (it) {
      var el = H.el;
      if (!it) return;
      var src = it.backdrop || it.poster || '';
      heroImage(U.$('.home-bg img', el), it.kind === 'live' ? '' : src);
      var title = it.kind === 'episode' ? it.seriesName : it.name;
      U.$('.hero-title', el).textContent = title;
      var kindLabel = { live: 'Canale live', movie: 'Film', series: 'Serie TV', episode: 'Episodio S' + it.season + ' E' + it.ep }[it.kind];
      U.$('.hero-meta', el).innerHTML = App.metaHtml({ kindLabel: kindLabel, year: it.year, rating: it.rating, genre: it.genre });
      var plot = U.$('.hero-plot', el);
      plot.textContent = it.plot || '';
      if (it.kind === 'live') {
        App.EPG.get(it).then(function (progs) {
          var n = App.EPG.now(progs);
          if (n.cur) plot.textContent = 'In onda: ' + n.cur.title + ' (' + U.fmtTime(n.cur.start) + ' – ' + U.fmtTime(n.cur.end) + ')' + (n.cur.desc ? ' — ' + n.cur.desc : '');
        });
      }
    }
  };
})();
