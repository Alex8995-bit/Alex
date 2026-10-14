/*
 * Navigazione con telecomando.
 *  - Nav: livelli (schermata, finestre modali, player) composti da "zone".
 *  - List: lista/griglia navigabile, virtualizzata per migliaia di elementi.
 */
(function () {
  'use strict';
  var App = window.App, U = App.U;

  /* ----------------------------------------------------------- tasti */
  var KEYMAP = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 29443: 'ok',
    10009: 'back', 461: 'back', 8: 'back', 27: 'back', 10182: 'exit',
    415: 'play', 19: 'pause', 10252: 'playpause', 413: 'stop', 417: 'ff', 412: 'rw',
    427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    457: 'info', 10233: 'next', 10232: 'prev',
    65376: 'done', 65385: 'cancel'
  };
  // tasti da tastiera per provare l'app su PC
  var DESKTOP = { 'r': 'red', 'g': 'green', 'y': 'yellow', 'b': 'blue', 'i': 'info', ' ': 'playpause', '+': 'chup', '-': 'chdown' };

  App.registerTizenKeys = function () {
    if (!(window.tizen && tizen.tvinputdevice)) return;
    var names = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
      'MediaTrackPrevious', 'MediaTrackNext', 'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green',
      'ColorF2Yellow', 'ColorF3Blue', 'Info', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    try {
      var sup = tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; });
      names = names.filter(function (n) { return sup.indexOf(n) >= 0; });
      if (tizen.tvinputdevice.registerKeyBatch) tizen.tvinputdevice.registerKeyBatch(names);
      else names.forEach(function (n) { try { tizen.tvinputdevice.registerKey(n); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
  };

  function actionOf(e) {
    var k = e.keyCode;
    if (k >= 48 && k <= 57) return 'digit';
    if (k >= 96 && k <= 105) return 'digit';
    if (KEYMAP[k]) return KEYMAP[k];
    if (e.key && DESKTOP[e.key]) return DESKTOP[e.key];
    return null;
  }

  /* ------------------------------------------------------------ Nav */
  var Nav = App.Nav = {
    layers: [],

    base: function () { return Nav.layers[0]; },
    top: function () { return Nav.layers[Nav.layers.length - 1]; },

    /* Livello: {zones:{nome:zona}, current:'nome', onBack:fn, onKey:fn} */
    setBase: function (layer) {
      if (Nav.layers.length && Nav.layers[0].current) Nav.zone(Nav.layers[0]).deactivate();
      Nav.layers[0] = layer;
      if (Nav.layers.length === 1) Nav.focus(layer.current);
    },
    push: function (layer) {
      var t = Nav.top();
      if (t && t.current && t.zones[t.current]) t.zones[t.current].deactivate();
      Nav.layers.push(layer);
      if (layer.current) Nav.focus(layer.current);
    },
    pop: function (layer) {
      var i = Nav.layers.indexOf(layer);
      if (i <= 0) return;
      var t = Nav.top();
      if (t === layer && t.current && t.zones[t.current]) t.zones[t.current].deactivate();
      Nav.layers.splice(i, 1);
      var n = Nav.top();
      if (n && n.current && n.zones[n.current]) n.zones[n.current].activate();
    },
    zone: function (layer) { layer = layer || Nav.top(); return layer && layer.zones[layer.current]; },

    focus: function (name, layer) {
      layer = layer || Nav.top();
      var z = layer.zones[name];
      if (!z) return;
      if (layer.current && layer.zones[layer.current] && layer.current !== name) layer.zones[layer.current].deactivate();
      layer.current = name;
      if (layer === Nav.top()) z.activate();
    },

    handle: function (action, e) {
      var layer = Nav.top();
      if (!layer) return false;
      if (layer.onKey && layer.onKey(action, e)) return true;
      var z = layer.zones[layer.current];
      if (z && z.handle(action, e)) return true;
      if (z && z.edges && z.edges[action] !== undefined) {
        var target = z.edges[action];
        if (typeof target === 'function') target = target();
        if (target && layer.zones[target]) { Nav.focus(target, layer); return true; }
        if (target === false) return true;
      }
      if (action === 'back' && layer.onBack) { layer.onBack(); return true; }
      return false;
    },

    init: function () {
      document.addEventListener('keydown', function (e) {
        var ae = document.activeElement;
        var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
        if (typing) {
          // mentre si scrive lasciamo i tasti alla tastiera; Done/Cancel/Invio chiudono
          if (e.keyCode === 65376 || e.keyCode === 65385 || e.keyCode === 13 || e.keyCode === 10009 || e.keyCode === 27) {
            ae.blur();
            e.preventDefault();
          }
          if (e.keyCode === 38 || e.keyCode === 40) ae.blur(); else return;
        }
        var a = actionOf(e);
        if (!a) return;
        if (a === 'exit') { App.exit(); return; }
        if (a === 'digit') e.digit = (e.keyCode >= 96 ? e.keyCode - 96 : e.keyCode - 48);
        App.Idle && App.Idle.ping();
        // tasto tenuto premuto: limitiamo la frequenza per non accodare lavoro
        var dir = a === 'up' || a === 'down' || a === 'left' || a === 'right' || a === 'chup' || a === 'chdown';
        Nav.repeating = !!(e.repeat && dir);
        if (Nav.repeating) {
          var now = Date.now();
          if (now - (Nav.lastRepeat || 0) < 70) { e.preventDefault(); return; }
          Nav.lastRepeat = now;
        }
        if (Nav.handle(a, e)) e.preventDefault();
        else if (a !== 'back' || e.keyCode !== 8) e.preventDefault();
      }, true);

      // supporto puntatore (Smart Remote / mouse)
      document.addEventListener('click', function (e) {
        var n = e.target;
        while (n && n !== document.body) {
          if (n.__list && n.getAttribute('data-i') !== null) { n.__list.clickItem(+n.getAttribute('data-i')); return; }
          n = n.parentNode;
        }
      });
    }
  };

  /* ------------------------------------------------------------- List */
  /*
   * opzioni:
   *  el, dir: 'v'|'h'|'grid', cols, itemSize (px, attiva virtualizzazione), colSize,
   *  render(item,i) -> html, cls, onSelect, onFocus, onKey, edges, margin, empty, onRender
   */
  function List(o) {
    this.o = o;
    this.el = o.el;
    this.dir = o.dir || 'v';
    this.cols = o.cols || 1;
    this.items = [];
    this.index = 0;
    this.active = false;
    this.offset = 0;
    this.edges = o.edges || {};
    this.win = [-1, -1];
    this.el.innerHTML = '';
    this.el.classList.add('list', 'list-' + this.dir);
    this.inner = document.createElement('div');
    this.inner.className = 'list-inner';
    this.el.appendChild(this.inner);
    this.emptyEl = null;
  }
  App.List = List;

  List.prototype.virtual = function () { return !!this.o.itemSize; };

  List.prototype.setItems = function (items, index) {
    this.items = items || [];
    this.index = U.clamp(index || 0, 0, Math.max(0, this.items.length - 1));
    this.offset = 0;
    this.win = [-1, -1];
    this.render();
    this.ensureVisible(true);
    if (this.active) this.fireFocus();
  };

  List.prototype.itemHtml = function (item, i) {
    var o = this.o, style = '';
    if (this.virtual()) {
      var row = Math.floor(i / this.cols), col = i % this.cols;
      style = 'position:absolute;';
      if (this.dir === 'h') style += 'left:' + (i * o.itemSize) + 'px;';
      else style += 'top:' + (row * o.itemSize) + 'px;' + (this.cols > 1 ? 'left:' + (col * o.colSize) + 'px;' : '');
    }
    var cls = 'li ' + (o.cls || '');
    if (i === this.index) cls += this.active ? ' focus sel' : ' sel';
    return '<div class="' + cls + '" data-i="' + i + '" style="' + style + '">' + o.render(item, i) + '</div>';
  };

  List.prototype.render = function () {
    var o = this.o, n = this.items.length;
    if (this.emptyEl) { this.el.removeChild(this.emptyEl); this.emptyEl = null; }
    if (!n && o.empty) {
      this.emptyEl = U.el('<div class="list-empty">' + o.empty + '</div>');
      this.el.appendChild(this.emptyEl);
    }
    if (this.virtual()) {
      var rows = Math.ceil(n / this.cols);
      if (this.dir === 'h') this.inner.style.width = (n * o.itemSize) + 'px';
      else this.inner.style.height = (rows * o.itemSize) + 'px';
      this.renderWindow(true);
    } else {
      var html = '';
      for (var i = 0; i < n; i++) html += this.itemHtml(this.items[i], i);
      this.inner.innerHTML = html;
      this.bindNodes();
    }
  };

  List.prototype.viewSize = function () {
    return this.dir === 'h' ? (this.el.clientWidth || this.o.view || 1600) : (this.el.clientHeight || this.o.view || 800);
  };

  /*
   * Disegna solo le righe visibili. Le righe gia' presenti vengono riutilizzate
   * (niente ridisegno ne' ricaricamento dei loghi): si aggiungono/tolgono solo
   * quelle che entrano/escono dallo schermo, cosi' lo scorrimento resta fluido.
   */
  List.prototype.renderWindow = function (force) {
    var o = this.o, size = o.itemSize, vs = this.viewSize();
    var first = Math.max(0, Math.floor(this.offset / size) - 3);
    var last = Math.ceil((this.offset + vs) / size) + 3;
    var a = first * this.cols, b = Math.min(this.items.length, last * this.cols);
    if (!force && a === this.win[0] && b === this.win[1]) return;
    this.win = [a, b];
    if (force || !this.nodes) { this.inner.innerHTML = ''; this.nodes = {}; }
    var nodes = this.nodes, k, html = '', added = 0;
    for (k in nodes) {
      if (nodes.hasOwnProperty(k) && (k < a || k >= b)) { this.inner.removeChild(nodes[k]); delete nodes[k]; }
    }
    for (var i = a; i < b; i++) if (!nodes[i]) { html += this.itemHtml(this.items[i], i); added++; }
    if (added) {
      var tmp = document.createElement('div'), frag = document.createDocumentFragment();
      tmp.innerHTML = html;
      while (tmp.firstChild) {
        var n = tmp.firstChild;
        n.__list = this;
        nodes[+n.getAttribute('data-i')] = n;
        frag.appendChild(n);
      }
      this.inner.appendChild(frag);
      if (o.onRender) o.onRender(this.items.slice(a, b), a);
    }
  };

  List.prototype.bindNodes = function () {
    var ch = this.inner.children;
    for (var i = 0; i < ch.length; i++) ch[i].__list = this;
  };

  List.prototype.node = function (i) {
    if (this.virtual()) return this.nodes ? this.nodes[i] || null : null;
    return this.inner.querySelector('[data-i="' + i + '"]');
  };

  List.prototype.refreshItem = function (i) {
    var n = this.node(i);
    if (!n) return;
    var nn = U.el(this.itemHtml(this.items[i], i));
    nn.__list = this;
    n.parentNode.replaceChild(nn, n);
    if (this.virtual()) this.nodes[i] = nn;
  };

  List.prototype.refreshVisible = function () {
    if (this.virtual()) this.renderWindow(true); else this.render();
  };

  List.prototype.updateClasses = function (prev) {
    var p = this.node(prev);
    if (p) p.className = p.className.replace(/\s(focus|sel)\b/g, '');
    var c = this.node(this.index);
    if (c) {
      c.className = c.className.replace(/\s(focus|sel)\b/g, '');
      c.className += this.active ? ' focus sel' : ' sel';
    }
  };

  List.prototype.ensureVisible = function (instant) {
    var o = this.o, n = this.items.length;
    if (!n) { this.applyOffset(0, instant); return; }
    var vs = this.viewSize(), start, size;
    if (this.virtual()) {
      size = o.itemSize;
      start = (this.dir === 'h' ? this.index : Math.floor(this.index / this.cols)) * size;
    } else {
      var node = this.node(this.index);
      if (!node) return;
      start = this.dir === 'h' ? node.offsetLeft : node.offsetTop;
      size = this.dir === 'h' ? node.offsetWidth : node.offsetHeight;
    }
    var total = this.virtual() ? (this.dir === 'h' ? n * size : Math.ceil(n / this.cols) * size)
      : (this.dir === 'h' ? this.inner.scrollWidth : this.inner.scrollHeight);
    var margin = o.margin !== undefined ? o.margin : size * 0.8;
    var off = this.offset;
    if (o.anchor === 'start') off = start - margin;
    else {
      if (start - off < margin) off = start - margin;
      if (start + size - off > vs - margin) off = start + size - vs + margin;
    }
    off = U.clamp(off, 0, Math.max(0, total - vs + (o.tail || 0)));
    this.applyOffset(off, instant);
  };

  List.prototype.applyOffset = function (off, instant) {
    this.offset = off;
    var t = this.dir === 'h' ? 'translate3d(' + (-off) + 'px,0,0)' : 'translate3d(0,' + (-off) + 'px,0)';
    var st = this.inner.style;
    // tenendo premuto un tasto lo scorrimento e' immediato (niente animazioni accodate)
    if (instant || Nav.repeating) st.transition = 'none';
    else if (st.transition === 'none') st.transition = '';
    st.transform = st.webkitTransform = t;
    if (instant && !Nav.repeating) { void this.inner.offsetWidth; st.transition = ''; }
    if (this.virtual()) this.renderWindow(false);
  };

  List.prototype.setIndex = function (i, silent) {
    if (!this.items.length) return;
    i = U.clamp(i, 0, this.items.length - 1);
    var prev = this.index;
    this.index = i;
    this.ensureVisible(false);
    this.updateClasses(prev);
    if (!silent) this.fireFocus();
  };

  List.prototype.fireFocus = function () {
    if (this.o.onFocus && this.items.length) this.o.onFocus(this.items[this.index], this.index);
  };

  List.prototype.current = function () { return this.items[this.index]; };

  List.prototype.activate = function () {
    this.active = true;
    this.el.classList.add('zone-active');
    this.updateClasses(this.index);
    if (this.o.onActivate) this.o.onActivate();
    this.fireFocus();
  };

  List.prototype.deactivate = function () {
    this.active = false;
    this.el.classList.remove('zone-active');
    this.updateClasses(this.index);
  };

  List.prototype.pageSize = function () {
    var size = this.o.itemSize || 100;
    return Math.max(1, Math.floor(this.viewSize() / size) - 1) * this.cols;
  };

  List.prototype.handle = function (a, e) {
    var o = this.o, i = this.index, n = this.items.length;
    if (o.onKey && o.onKey(a, this.items[i], i, e)) return true;
    if (!n) return false;
    var c = this.cols;
    if (a === 'ok') { if (o.onSelect) o.onSelect(this.items[i], i); return true; }
    if (this.dir === 'v') {
      if (a === 'up') { if (i === 0) return false; this.setIndex(i - 1); return true; }
      if (a === 'down') { if (i >= n - 1) return false; this.setIndex(i + 1); return true; }
      if (a === 'chup') { this.setIndex(i - this.pageSize()); return true; }
      if (a === 'chdown') { this.setIndex(i + this.pageSize()); return true; }
    } else if (this.dir === 'h') {
      if (a === 'left') { if (i === 0) return false; this.setIndex(i - 1); return true; }
      if (a === 'right') { if (i >= n - 1) return false; this.setIndex(i + 1); return true; }
    } else {
      var col = i % c;
      if (a === 'left') { if (col === 0) return false; this.setIndex(i - 1); return true; }
      if (a === 'right') { if (col === c - 1 || i >= n - 1) return false; this.setIndex(i + 1); return true; }
      if (a === 'up') { if (i < c) return false; this.setIndex(i - c); return true; }
      if (a === 'down') {
        if (i + c < n) { this.setIndex(i + c); return true; }
        if (Math.floor(i / c) < Math.floor((n - 1) / c)) { this.setIndex(n - 1); return true; }
        return false;
      }
      if (a === 'chup') { this.setIndex(i - this.pageSize()); return true; }
      if (a === 'chdown') { this.setIndex(i + this.pageSize()); return true; }
    }
    return false;
  };

  List.prototype.clickItem = function (i) {
    var layer = Nav.top();
    for (var k in layer.zones) {
      if (layer.zones[k] === this) { Nav.focus(k, layer); break; }
    }
    if (i === this.index && this.o.onSelect) { this.o.onSelect(this.items[i], i); return; }
    this.setIndex(i);
  };
})();
