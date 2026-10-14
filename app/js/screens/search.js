/* CERCA: tastiera a schermo + risultati in righe (canali, film, serie). */
(function () {
  'use strict';
  var App = window.App, U = App.U, UI = App.UI, Nav = App.Nav;

  var S = App.Screens.search = {
    name: 'search',
    entry: 'kb',

    init: function (el) {
      el.innerHTML = '<div class="search-left"><div class="search-field">' + UI.icons.search +
        '<input type="text" placeholder="Cerca canali, film, serie…" autocomplete="off" spellcheck="false"></div>' +
        '<div class="search-kb kb"></div></div><div class="search-res"><div class="search-msg"></div><div class="res-rows"></div></div>';
      S.input = U.$('input', el);
      var run = U.debounce(S.run, 350);
      S.field = UI.fieldZone(U.$('.search-field', el), S.input, { down: 'kb', right: 'res', up: 'nav' }, run);
      S.kb = UI.keyboard({
        el: U.$('.search-kb', el), input: S.input, onChange: run,
        edges: { up: 'field', right: 'res' },
        onOk: function () { S.run(); if (S.rows.rows.length) Nav.focus('res'); }
      });
      S.rows = new App.Rows({ el: U.$('.res-rows', el), edges: { left: 'kb', up: 'nav' } });
    },

    show: function () {
      S.run();
      return { field: S.field, kb: S.kb, res: S.rows };
    },

    run: function () {
      var q = S.input.value.trim(), C = App.Catalog, msg = U.$('.search-msg', S.el);
      if (q.length < 2) {
        S.rows.setRows([]);
        msg.textContent = 'Scrivi almeno 2 lettere per cercare tra ' + C.live.items.length + ' canali, ' +
          C.movie.items.length + ' film e ' + C.series.items.length + ' serie.';
        return;
      }
      var rows = [
        { title: 'Canali', type: 'channel', items: C.search(q, 'live', 50) },
        { title: 'Film', type: 'poster', items: C.search(q, 'movie', 50) },
        { title: 'Serie TV', type: 'poster', items: C.search(q, 'series', 50) }
      ];
      S.rows.setRows(rows);
      msg.textContent = S.rows.rows.length ? '' : 'Nessun risultato per «' + q + '»';
    }
  };
})();
