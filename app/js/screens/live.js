/* LIVE TV: categorie | canali con EPG | anteprima + guida del canale. */
(function () {
  'use strict';
  var App = window.App, U = App.U, UI = App.UI;

  var L = App.Screens.live = {
    name: 'live',
    entry: 'chs',
    st: { cat: 0, ch: 0 },

    init: function (el) {
      el.innerHTML =
        '<div class="cats"><div class="panel-title">Categorie</div><div class="c-list"></div></div>' +
        '<div class="live-chs"><div class="panel-title ch-title ellipsis"></div><div class="ch-list"></div></div>' +
        '<div class="live-side"><div class="live-preview"><div class="pv-ph"></div></div><div class="live-info"></div></div>';

      L.cats = new App.List({
        el: U.$('.c-list', el), dir: 'v', itemSize: 72, cls: 'cat', edges: { right: 'chs', up: 'nav' },
        render: function (c) {
          return '<span class="cat-name">' + U.esc(c.name) + '</span>' + (c.n !== undefined ? '<span class="cat-n">' + c.n + '</span>' : '');
        },
        onFocus: U.debounce(function (c, i) { if (L.loadedCat !== c) L.loadCat(c, i, 0); }, 280),
        onSelect: function (c, i) { if (L.loadedCat !== c) L.loadCat(c, i, 0); App.Nav.focus('chs'); }
      });

      L.chs = new App.List({
        el: U.$('.ch-list', el), dir: 'v', itemSize: 104, cls: 'ch', edges: { left: 'cats', up: 'nav' },
        empty: 'Nessun canale in questa categoria',
        render: L.renderCh,
        onFocus: function (ch, i) { L.st.ch = i; L.infoDeb(ch); },
        onSelect: L.select,
        onRender: U.debounce(function () { L.prefetch(); }, 350),
        onKey: function (a, ch) {
          if (!ch) return false;
          if (a === 'blue') {
            var on = App.UserData.toggleFav(ch);
            UI.toast(on ? '★ ' + ch.name + ' aggiunto ai preferiti' : ch.name + ' rimosso dai preferiti');
            L.chs.refreshItem(L.chs.index);
            return true;
          }
          if (a === 'play' || a === 'playpause') { L.select(ch, L.chs.index); return true; }
          return false;
        }
      });
      L.infoDeb = U.debounce(L.info, 220);
    },

    reset: function () { L.st = { cat: 0, ch: 0 }; L.loadedCat = null; },

    show: function () {
      var C = App.Catalog;
      var cats = [
        { id: '__all', name: 'Tutti i canali', n: C.list('live', '__all').length },
        { id: '__fav', name: '★ Preferiti', n: App.UserData.favList('live').length },
        { id: '__recent', name: 'Visti di recente' }
      ].concat(C.cats('live').map(function (c) { return { id: c.id, name: c.name, n: C.list('live', c.id).length }; }));
      L.catItems = cats;
      L.cats.setItems(cats, L.st.cat);
      L.loadCat(cats[L.cats.index], L.cats.index, L.st.ch);
      L.placeholder();
      return { cats: L.cats, chs: L.chs };
    },

    hide: function () { App.Player.close(); },

    onBack: function () {
      if (App.Player.mode === 'mini') { App.Player.close(); L.chs.refreshVisible(); return true; }
      return false;
    },

    onEpg: function () {
      L.chs.refreshVisible();
      var ch = L.chs.current();
      if (ch) L.info(ch);
    },

    loadCat: function (c, ci, chIdx) {
      if (!c) return;
      L.loadedCat = c;
      L.st.cat = ci;
      L.items = App.Catalog.list('live', c.id);
      U.$('.ch-title', L.el).textContent = c.name + ' · ' + L.items.length + ' canali';
      L.chs.setItems(L.items, chIdx || 0);
      var ch = L.chs.current();
      if (ch) L.info(ch); else U.$('.live-info', L.el).innerHTML = '';
    },

    renderCh: function (ch) {
      var e = App.EPG.now(App.EPG.cached(ch)), cur = e.cur;
      var playing = App.Player.mode && App.Player.item && App.Player.item.id === ch.id;
      return '<span class="ch-num">' + U.esc(ch.num || '') + '</span>' +
        '<div class="ch-logo">' + U.img(ch.logo) + '</div>' +
        '<div class="ch-txt"><div class="ch-name">' + U.esc(ch.name) + '</div>' +
        '<div class="ch-epg">' + (cur ? U.fmtTime(cur.start) + '  ' + U.esc(cur.title) : '&nbsp;') + '</div>' +
        (cur ? '<div class="pbar"><i style="width:' + Math.round(App.EPG.progress(cur) * 100) + '%"></i></div>' : '') + '</div>' +
        (playing ? '<span class="ch-playing">IN ONDA</span>' : '') +
        (App.UserData.isFav(ch) ? '<span class="ch-fav">★</span>' : '');
    },

    prefetch: function () {
      var a = L.chs.win[0], b = L.chs.win[1];
      if (a < 0) return;
      var vis = L.items.slice(a, b);
      App.EPG.prefetch(vis, function (ch) {
        var i = L.items.indexOf(ch);
        if (i >= L.chs.win[0] && i < L.chs.win[1]) L.chs.refreshItem(i);
      });
    },

    placeholder: function (ch) {
      U.$('.pv-ph', L.el).innerHTML = (ch ? U.img(ch.logo) : '') +
        '<div>Premi <b>OK</b> per l\'anteprima<br>e di nuovo <b>OK</b> per lo schermo intero</div>';
    },

    info: function (ch) {
      var box = U.$('.live-info', L.el);
      if (!App.Player.mode) L.placeholder(ch);
      function paint(progs) {
        if (L.chs.current() !== ch) return;
        var e = App.EPG.now(progs), cur = e.cur;
        var html = '<div class="li-ch">' + U.esc(ch.name) +
          (App.UserData.isFav(ch) ? '<span class="tag">★ Preferito</span>' : '') +
          (ch.archive ? '<span class="tag">Replay</span>' : '') + '</div>';
        if (cur) {
          html += '<div class="li-now"><span>' + U.fmtTime(cur.start) + ' – ' + U.fmtTime(cur.end) + '</span>' + U.esc(cur.title) + '</div>' +
            '<div class="li-bar"><i style="width:' + Math.round(App.EPG.progress(cur) * 100) + '%"></i></div>' +
            '<div class="li-desc">' + U.esc(cur.desc || '') + '</div>';
        } else {
          html += '<div class="li-now"><span>' + (App.EPG.mode === 'off' ? 'Guida TV disattivata' : (App.EPG.status || 'Nessuna informazione sul programma')) + '</span></div>';
        }
        var rest = e.rest.slice(0, cur ? 5 : 6);
        if (rest.length) {
          html += '<div class="li-next">' + rest.map(function (p) {
            return '<div><b>' + U.fmtTime(p.start) + '</b>' + U.esc(p.title) + '</div>';
          }).join('') + '</div>';
        }
        html += '<div class="li-hint">OK anteprima / schermo intero <span class="k blue"></span>preferito · CH+/CH− pagina</div>';
        box.innerHTML = html;
      }
      paint(App.EPG.cached(ch));
      App.EPG.get(ch).then(function (progs) {
        if (!progs) return;
        paint(progs);
        var i = L.chs.items.indexOf(ch);
        if (i >= 0) L.chs.refreshItem(i);
      });
    },

    previewRect: function () {
      var r = U.$('.live-preview', L.el).getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    },

    select: function (ch, i) {
      var P = App.Player;
      if (P.mode && P.item && P.item.id === ch.id) { P.toFull(); return; }
      var opts = {
        list: L.items, index: i,
        onExitFull: function () {
          if (App.screen === L && App.Settings.get('preview')) { P.toMini(L.previewRect()); L.chs.refreshVisible(); }
          else P.close();
        },
        onChannel: function (c, idx) {
          if (L.chs.items === P.list) L.chs.setIndex(idx, true);
          L.chs.refreshVisible();
          L.info(c);
        },
        onClose: function () { L.chs.refreshVisible(); }
      };
      if (App.Settings.get('preview')) { opts.mode = 'mini'; opts.rect = L.previewRect(); }
      else opts.mode = 'full';
      P.play(ch, opts);
      L.chs.refreshVisible();
    }
  };
})();
