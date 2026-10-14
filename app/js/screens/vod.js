/* FILM e SERIE TV: categorie + hero + griglia locandine; schermata dettaglio. */
(function () {
  'use strict';
  var App = window.App, U = App.U, UI = App.UI, Nav = App.Nav;

  var infoCache = {};
  function info(it) {
    if (infoCache[it.id]) return Promise.resolve(infoCache[it.id]);
    var p = it.kind === 'movie' ? App.Catalog.vodInfo(it) : Promise.resolve({ plot: it.plot, backdrop: it.backdrop, poster: it.poster, genre: it.genre, year: it.year, rating: it.rating });
    return p.then(function (r) { infoCache[it.id] = r; return r; });
  }

  function VodScreen(kind) {
    var S = {
      name: kind,
      entry: 'grid',
      st: { cat: 0, idx: 0 },

      init: function (el) {
        el.innerHTML = '<div class="vod-bg"><img alt=""><div class="shade"></div></div>' +
          '<div class="cats"><div class="panel-title">' + (kind === 'movie' ? 'Film' : 'Serie TV') + '</div><div class="c-list"></div></div>' +
          '<div class="vod-hero"><div class="hero-title"></div><div class="hero-meta"></div><div class="hero-plot"></div></div>' +
          '<div class="vod-grid"><div class="g-list"></div></div>';
        S.cats = new App.List({
          el: U.$('.c-list', el), dir: 'v', itemSize: 72, cls: 'cat', edges: { right: 'grid', up: 'nav' },
          render: function (c) {
            return '<span class="cat-name">' + U.esc(c.name) + '</span>' + (c.n !== undefined ? '<span class="cat-n">' + c.n + '</span>' : '');
          },
          onFocus: U.debounce(function (c, i) { if (S.loadedCat !== c) S.loadCat(c, i, 0); }, 280),
          onSelect: function (c, i) { if (S.loadedCat !== c) S.loadCat(c, i, 0); Nav.focus('grid'); }
        });
        S.grid = new App.List({
          el: U.$('.g-list', el), dir: 'grid', cols: 7, itemSize: 350, colSize: 216, cls: 'card', margin: 0, anchor: 'start',
          edges: { left: 'cats', up: 'nav' }, empty: 'Nessun contenuto in questa categoria',
          render: App.Cards.poster,
          onFocus: function (it, i) { S.st.idx = i; S.heroDeb(it); },
          onSelect: function (it) { App.openItem(it); },
          onKey: function (a, it) {
            if (a === 'blue' && it && it.kind !== 'episode') {
              var on = App.UserData.toggleFav(it);
              UI.toast(on ? '★ Aggiunto ai preferiti' : 'Rimosso dai preferiti');
              return true;
            }
            return false;
          }
        });
        S.heroDeb = U.debounce(S.hero, 200);
      },

      reset: function () { S.st = { cat: 0, idx: 0 }; S.loadedCat = null; },

      show: function () {
        var C = App.Catalog;
        var cats = [
          { id: '__all', name: kind === 'movie' ? 'Tutti i film' : 'Tutte le serie', n: C.list(kind, '__all').length },
          { id: '__resume', name: 'Continua a guardare' },
          { id: '__fav', name: '★ Preferiti' },
          { id: '__recent', name: 'Aggiunti di recente' }
        ].concat(C.cats(kind).map(function (c) { return { id: c.id, name: c.name, n: C.list(kind, c.id).length }; }));
        S.cats.setItems(cats, S.st.cat);
        S.loadCat(cats[S.cats.index], S.cats.index, S.st.idx);
        return { cats: S.cats, grid: S.grid };
      },

      loadCat: function (c, ci, idx) {
        S.loadedCat = c;
        S.st.cat = ci;
        S.grid.setItems(App.Catalog.list(kind, c.id), idx || 0);
        S.hero(S.grid.current());
      },

      hero: function (it) {
        var el = S.el;
        if (!it) {
          U.$('.hero-title', el).textContent = ''; U.$('.hero-meta', el).innerHTML = ''; U.$('.hero-plot', el).textContent = '';
          App.heroImage(U.$('.vod-bg img', el), '');
          return;
        }
        var title = it.kind === 'episode' ? it.seriesName + ' · S' + it.season + 'E' + it.ep : it.name;
        U.$('.hero-title', el).textContent = title;
        U.$('.hero-meta', el).innerHTML = App.metaHtml({ year: it.year, rating: it.rating, genre: it.genre });
        U.$('.hero-plot', el).textContent = it.plot || '';
        App.heroImage(U.$('.vod-bg img', el), it.backdrop || it.poster);
        if (it.kind === 'movie' || it.kind === 'series') {
          info(it).then(function (d) {
            if (S.grid.current() !== it) return;
            U.$('.hero-meta', el).innerHTML = App.metaHtml({ year: d.year || it.year, rating: d.rating || it.rating, genre: d.genre, duration: d.duration });
            U.$('.hero-plot', el).textContent = d.plot || '';
            if (d.backdrop) App.heroImage(U.$('.vod-bg img', el), d.backdrop);
          });
        }
      },

      onBack: function () { return false; }
    };
    return S;
  }

  App.Screens.movie = VodScreen('movie');
  App.Screens.series = VodScreen('series');

  /* ============================================================ dettaglio */
  var D = App.Detail = {
    open: function (it) {
      var el = U.el('<div class="detail"><img class="d-bg" alt=""><div class="shade"></div>' +
        '<div class="d-poster"><div class="card-ph">' + U.esc(it.name) + '</div>' + U.img(it.poster) + '</div>' +
        '<div class="d-info"><div class="d-title">' + U.esc(it.name) + '</div><div class="d-meta"></div><div class="d-plot"></div><div class="d-extra"></div></div>' +
        '<div class="d-btns"></div><div class="d-seasons"></div><div class="d-eps"></div><div class="d-epplot"></div></div>');
      U.$('#stage-modals').appendChild(el);
      var ctx = { it: it, el: el, seasons: [], flat: [] };
      D.ctx = ctx;

      ctx.btns = new App.List({
        el: U.$('.d-btns', el), dir: 'h', cls: 'btn',
        render: function (b) { return (b.icon ? UI.icons[b.icon] : '') + '<span>' + U.esc(b.label) + '</span>'; },
        onSelect: function (b) { b.run(); },
        edges: { down: function () { return ctx.seasons.length ? 'seasons' : null; } }
      });
      ctx.seasonList = new App.List({
        el: U.$('.d-seasons', el), dir: 'h', cls: 'season',
        render: function (s) { return 'Stagione ' + s.num + ' <small style="display:inline;margin-left:8px">' + s.episodes.length + ' ep.</small>'; },
        onFocus: function (s) { if (ctx.season !== s) D.showSeason(ctx, s, 0); },
        onSelect: function () { Nav.focus('eps'); },
        edges: { up: 'btns', down: 'eps' }
      });
      ctx.eps = new App.List({
        el: U.$('.d-eps', el), dir: 'h', itemSize: 360, cls: 'ep', margin: 0, anchor: 'start',
        render: function (e) {
          var r = App.UserData.getResume(e);
          return '<div class="card-img"><div class="card-ph">' + U.esc(e.name) + '</div>' + U.img(e.poster) +
            '<span class="ep-n">' + e.ep + '</span>' +
            (r ? '<div class="card-prog"><i style="width:' + Math.round(r.pos / r.dur * 100) + '%"></i></div>' : '') +
            '</div><div class="card-title">' + U.esc(e.name) + '</div>';
        },
        onFocus: function (e) {
          U.$('.d-epplot', el).textContent = (e.duration ? U.fmtMinutes(e.duration) + ' · ' : '') + (e.plot || '');
        },
        onSelect: function (e) { D.playEpisode(ctx, e); },
        edges: { up: 'seasons' }
      });

      ctx.layer = { zones: { btns: ctx.btns, seasons: ctx.seasonList, eps: ctx.eps }, current: 'btns', onBack: function () { D.close(ctx); } };
      Nav.push(ctx.layer);
      D.fill(ctx, { plot: it.plot, year: it.year, rating: it.rating, genre: it.genre, backdrop: it.backdrop || it.poster });
      D.buttons(ctx);

      if (it.kind === 'movie') {
        info(it).then(function (d) { D.fill(ctx, d); });
      } else {
        U.$('.d-epplot', el).textContent = 'Caricamento episodi…';
        App.Catalog.seriesInfo(it).then(function (r) {
          ctx.seasons = r.seasons;
          ctx.flat = [];
          r.seasons.forEach(function (s) { ctx.flat = ctx.flat.concat(s.episodes); });
          D.fill(ctx, r.info);
          U.$('.d-epplot', el).textContent = r.seasons.length ? '' : 'Nessun episodio disponibile';
          ctx.seasonList.setItems(r.seasons, 0);
          if (r.seasons.length) {
            var cont = D.continueEp(ctx);
            var si = cont ? Math.max(0, r.seasons.map(function (s) { return s.num; }).indexOf(cont.season)) : 0;
            ctx.seasonList.setIndex(si, true);
            D.showSeason(ctx, r.seasons[si], cont ? r.seasons[si].episodes.indexOf(cont) : 0);
          }
          D.buttons(ctx);
        }, function (err) {
          U.$('.d-epplot', el).textContent = 'Errore nel caricamento degli episodi: ' + err.message;
        });
      }
    },

    fill: function (ctx, d) {
      var el = ctx.el, it = ctx.it;
      U.$('.d-meta', el).innerHTML = App.metaHtml({ kindLabel: it.kind === 'movie' ? 'Film' : 'Serie TV', year: d.year || it.year, rating: d.rating || it.rating, duration: d.duration, genre: d.genre });
      U.$('.d-plot', el).textContent = d.plot || '';
      var ex = [];
      if (d.director) ex.push('Regia: ' + d.director);
      if (d.cast) ex.push('Cast: ' + d.cast);
      U.$('.d-extra', el).textContent = ex.join('  ·  ');
      if (d.backdrop) App.heroImage(U.$('.d-bg', el), d.backdrop);
      if (d.poster && d.poster !== it.poster) {
        var img = U.$('.d-poster img', el);
        if (img) img.src = d.poster; else U.$('.d-poster', el).insertAdjacentHTML('beforeend', U.img(d.poster));
      }
    },

    continueEp: function (ctx) {
      var res = App.UserData.d.resume, best = null, t = 0;
      Object.keys(res).forEach(function (id) {
        if (res[id].item.seriesId === ctx.it.id && res[id].t > t) { t = res[id].t; best = id; }
      });
      if (!best) return null;
      for (var i = 0; i < ctx.flat.length; i++) if (ctx.flat[i].id === best) return ctx.flat[i];
      return null;
    },

    buttons: function (ctx) {
      var it = ctx.it, b = [];
      if (it.kind === 'movie') {
        var r = App.UserData.getResume(it);
        if (r) {
          b.push({ icon: 'play', label: 'Riprendi da ' + U.fmtDuration(r.pos), run: function () { D.playMovie(ctx, r.pos); } });
          b.push({ icon: 'restart', label: 'Dall\'inizio', run: function () { D.playMovie(ctx, 0); } });
        } else b.push({ icon: 'play', label: 'Riproduci', run: function () { D.playMovie(ctx, 0); } });
      } else if (ctx.flat.length) {
        var c = D.continueEp(ctx);
        if (c) b.push({ icon: 'play', label: 'Continua S' + c.season + ' E' + c.ep, run: function () { D.playEpisode(ctx, c); } });
        else b.push({ icon: 'play', label: 'Riproduci S' + ctx.flat[0].season + ' E' + ctx.flat[0].ep, run: function () { D.playEpisode(ctx, ctx.flat[0]); } });
      }
      var fav = App.UserData.isFav(it);
      b.push({ icon: 'star', label: fav ? 'Nei preferiti' : 'Aggiungi ai preferiti', run: function () { App.UserData.toggleFav(it); D.buttons(ctx); } });
      ctx.btns.setItems(b, Math.min(ctx.btns.index, b.length - 1));
    },

    showSeason: function (ctx, s, idx) {
      ctx.season = s;
      ctx.eps.setItems(s.episodes, idx || 0);
      var e = ctx.eps.current();
      if (e) U.$('.d-epplot', ctx.el).textContent = (e.duration ? U.fmtMinutes(e.duration) + ' · ' : '') + (e.plot || '');
    },

    afterPlay: function (ctx) {
      D.buttons(ctx);
      if (ctx.season) ctx.eps.refreshVisible();
    },

    playMovie: function (ctx, pos) {
      App.Player.play(ctx.it, { mode: 'full', startAt: pos, list: [ctx.it], onClose: function () { D.afterPlay(ctx); } });
    },

    playEpisode: function (ctx, e) {
      var r = App.UserData.getResume(e);
      App.Player.play(e, { mode: 'full', startAt: r ? r.pos : 0, list: ctx.flat, index: ctx.flat.indexOf(e), onClose: function () { D.afterPlay(ctx); } });
    },

    close: function (ctx) {
      Nav.pop(ctx.layer);
      if (ctx.el.parentNode) ctx.el.parentNode.removeChild(ctx.el);
      if (App.screen && App.screen.grid) App.screen.grid.refreshVisible();
      if (App.screen && App.screen.name === 'home') App.go('home', { focusContent: true });
    }
  };
})();
