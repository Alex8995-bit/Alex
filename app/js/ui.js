/* Componenti comuni: toast, caricamento, finestre di scelta, conferma, tastiera e moduli. */
(function () {
  'use strict';
  var App = window.App, U = App.U, Nav = App.Nav;

  var UI = App.UI = {};

  UI.icons = {
    home: '<svg viewBox="0 0 24 24"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>',
    live: '<svg viewBox="0 0 24 24"><path d="M21 6h-7.6l3.3-3.3-.7-.7L12 6 8 2l-.7.7L10.6 6H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm0 13H3V8h18z"/></svg>',
    movie: '<svg viewBox="0 0 24 24"><path d="m18 4 2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4z"/></svg>',
    series: '<svg viewBox="0 0 24 24"><path d="M4 6H2v14a2 2 0 0 0 2 2h14v-2H4zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-8 12.5v-9l6 4.5z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 9.5 16a6.5 6.5 0 0 0 4.2-1.6l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3.3h-4L10.6 6a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>',
    cc: '<svg viewBox="0 0 24 24"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
    aspect: '<svg viewBox="0 0 24 24"><path d="M19 12h-2v3h-3v2h5zM7 9h3V7H5v5h2zm14-6H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h18z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.5 14l-1.7 7z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m6 18 8.5-6L6 6zM16 6v12h2V6z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
    usb: '<svg viewBox="0 0 24 24"><path d="M15 7v4h1v2h-3V5h2l-3-4-3 4h2v8H8v-2.1A2 2 0 1 0 6 11v2a2 2 0 0 0 2 2h3v3.1a2.5 2.5 0 1 0 2 0V15h3a2 2 0 0 0 2-2v-2h1V7z"/></svg>'
  };

  /* --------------------------------------------------------- toast */
  var toastT;
  UI.toast = function (msg, ms) {
    var t = U.$('#toast');
    t.innerHTML = '<span>' + U.esc(msg) + '</span>';
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 3000);
  };

  UI.loading = function (msg) {
    var l = U.$('#loading');
    if (msg === false) { l.classList.remove('show'); return; }
    U.$('#loading-msg').textContent = msg || 'Caricamento…';
    l.classList.add('show');
  };

  /* -------------------------------------------------------- modale */
  function Modal(cls, html) {
    this.el = U.el('<div class="modal ' + (cls || '') + '"><div class="modal-box">' + html + '</div></div>');
    U.$('#modals').appendChild(this.el);
    this.layer = null;
  }
  Modal.prototype.open = function (zones, current, onBack) {
    var self = this;
    this.layer = { zones: zones, current: current, onBack: onBack || function () { self.close(); } };
    Nav.push(this.layer);
    return this;
  };
  Modal.prototype.close = function () {
    Nav.pop(this.layer);
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    if (this.onClose) this.onClose();
  };
  UI.Modal = Modal;

  /* Lista di opzioni. opts: {title, options:[{label, sub, checked, value}], index, onSelect(opt, i)} */
  UI.select = function (opts) {
    var m = new Modal('modal-select', '<h2>' + U.esc(opts.title || '') + '</h2>' +
      (opts.message ? '<p class="modal-msg">' + U.esc(opts.message) + '</p>' : '') + '<div class="sel-list"></div>');
    var sel = -1;
    opts.options.forEach(function (o, i) { if (o.checked) sel = i; });
    var list = new App.List({
      el: U.$('.sel-list', m.el), dir: 'v', itemSize: 84, cls: 'opt',
      render: function (o) {
        return '<span class="opt-check">' + (o.checked ? '●' : '') + '</span><span class="opt-label">' + U.esc(o.label) +
          (o.sub ? '<small>' + U.esc(o.sub) + '</small>' : '') + '</span>';
      },
      onSelect: function (o, i) { m.close(); if (opts.onSelect) opts.onSelect(o, i); }
    });
    U.$('.sel-list', m.el).style.height = Math.min(600, opts.options.length * 84) + 'px';
    m.open({ list: list }, 'list');
    list.setItems(opts.options, opts.index !== undefined ? opts.index : Math.max(0, sel));
    return m;
  };

  /* Conferma. */
  UI.confirm = function (title, message, onYes, yesLabel) {
    UI.select({
      title: title, message: message,
      options: [{ label: yesLabel || 'Conferma', v: 1 }, { label: 'Annulla', v: 0 }],
      onSelect: function (o) { if (o.v && onYes) onYes(); }
    });
  };

  /* ------------------------------------------------ tastiera a schermo */
  var LAYOUTS = {
    abc: ['1234567890', 'qwertyuiop', 'asdfghjkl@', 'zxcvbnm._-'],
    ABC: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL@', 'ZXCVBNM._-'],
    sym: ['1234567890', '!#$%&*()=?', '/:;,+\'"~^|', '[]{}<>\\€£_']
  };
  var SPECIAL = [
    { k: 'shift', l: '⇧' }, { k: 'sym', l: '#+=' }, { k: 'txt', t: 'http://', l: 'http://' },
    { k: 'txt', t: '.com', l: '.com' }, { k: 'txt', t: ':', l: ':' }, { k: 'txt', t: '/', l: '/' },
    { k: 'space', l: 'spazio' }, { k: 'del', l: '⌫' }, { k: 'clear', l: 'canc' }, { k: 'ok', l: 'OK' }
  ];

  /* Tastiera riutilizzabile. o: {el, input, onChange, onOk, edges} -> List */
  UI.keyboard = function (o) {
    var layout = 'abc';
    function keys() {
      var out = [];
      LAYOUTS[layout].forEach(function (row) {
        row.split('').forEach(function (c) { out.push({ k: 'chr', t: c, l: c }); });
      });
      return out.concat(SPECIAL);
    }
    var list = new App.List({
      el: o.el, dir: 'grid', cols: 10, cls: 'key', edges: o.edges,
      render: function (k) { return '<span>' + U.esc(k.l) + '</span>'; },
      onSelect: function (k) {
        var inp = o.input, v = inp.value;
        if (k.k === 'chr' || k.k === 'txt') v += k.t;
        else if (k.k === 'space') v += ' ';
        else if (k.k === 'del') v = v.slice(0, -1);
        else if (k.k === 'clear') v = '';
        else if (k.k === 'shift' || k.k === 'sym') {
          layout = k.k === 'shift' ? (layout === 'abc' ? 'ABC' : 'abc') : (layout === 'sym' ? 'abc' : 'sym');
          var idx = list.index;
          list.setItems(keys(), idx);
          return;
        } else if (k.k === 'ok') { if (o.onOk) o.onOk(v); return; }
        inp.value = v;
        if (o.onChange) o.onChange(v);
      }
    });
    list.setItems(keys(), 0);
    return list;
  };

  /* Zona "campo di testo": OK apre la tastiera nativa del TV / tastiera fisica. */
  UI.fieldZone = function (el, input, edges, onChange) {
    input.addEventListener('input', function () { if (onChange) onChange(input.value); });
    return {
      edges: edges || {},
      activate: function () { el.classList.add('focus'); },
      deactivate: function () { el.classList.remove('focus'); },
      handle: function (a) {
        if (a === 'ok') { input.focus(); return true; }
        return false;
      }
    };
  };

  /* Inserimento testo. opts: {title, value, placeholder, password, hint, onDone(v)} */
  UI.input = function (opts) {
    var m = new Modal('modal-input',
      '<h2>' + U.esc(opts.title || '') + '</h2>' +
      (opts.hint ? '<p class="modal-msg">' + U.esc(opts.hint) + '</p>' : '') +
      '<div class="field"><input type="' + (opts.password ? 'password' : 'text') + '" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="kb"></div>' +
      '<p class="modal-help">OK sul campo = tastiera del TV · ▼ tastiera a schermo · tasto OK per confermare</p>');
    var input = U.$('input', m.el);
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    var field = UI.fieldZone(U.$('.field', m.el), input, { down: 'kb' });
    var kb = UI.keyboard({
      el: U.$('.kb', m.el), input: input, edges: { up: 'field' },
      onOk: function (v) { m.close(); if (opts.onDone) opts.onDone(v.trim()); }
    });
    // "Fatto"/Invio sulla tastiera del TV conferma direttamente il valore
    input.addEventListener('keydown', function (e) {
      if (e.keyCode === 13 || e.keyCode === 65376) {
        setTimeout(function () { m.close(); if (opts.onDone) opts.onDone(input.value.trim()); }, 0);
      }
    });
    m.open({ field: field, kb: kb }, 'field');
    return m;
  };

  /* Modulo con piu' campi. opts: {title, fields:[{key,label,value,placeholder,password,hint,optional}], onSave(values)->Promise} */
  UI.form = function (opts) {
    var m = new Modal('modal-form', '<h2>' + U.esc(opts.title) + '</h2><div class="form-list"></div><div class="form-err"></div>');
    var values = {};
    opts.fields.forEach(function (f) { values[f.key] = f.value || ''; });
    var items = opts.fields.concat([{ action: 'save', label: opts.saveLabel || 'Salva' }, { action: 'cancel', label: 'Annulla' }]);
    var list = new App.List({
      el: U.$('.form-list', m.el), dir: 'v', cls: 'form-row',
      render: function (f) {
        if (f.action) return '<span class="form-btn ' + f.action + '">' + U.esc(f.label) + '</span>';
        var v = values[f.key];
        var shown = v ? (f.password ? new Array(Math.min(v.length, 12) + 1).join('•') : v) : (f.placeholder || (f.optional ? 'facoltativo' : ''));
        return '<span class="form-label">' + U.esc(f.label) + '</span><span class="form-value' + (v ? '' : ' ph') + '">' + U.esc(shown) + '</span>';
      },
      onSelect: function (f, i) {
        if (f.action === 'cancel') { m.close(); return; }
        if (f.action === 'save') {
          var missing = opts.fields.filter(function (x) { return !x.optional && !values[x.key]; })[0];
          if (missing) { U.$('.form-err', m.el).textContent = 'Compila il campo: ' + missing.label; return; }
          U.$('.form-err', m.el).textContent = '';
          var r = opts.onSave(values);
          if (r && r.then) {
            UI.loading('Verifica in corso…');
            r.then(function () { UI.loading(false); m.close(); }, function (err) {
              UI.loading(false);
              U.$('.form-err', m.el).textContent = err && err.message ? err.message : String(err);
            });
          } else m.close();
          return;
        }
        UI.input({
          title: f.label, value: values[f.key], placeholder: f.placeholder, password: f.password, hint: f.hint,
          onDone: function (v) { values[f.key] = v; list.refreshItem(i); }
        });
      }
    });
    m.open({ list: list }, 'list');
    list.setItems(items, 0);
    return m;
  };
})();
