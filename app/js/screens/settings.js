/* IMPOSTAZIONI e gestione delle playlist (Xtream Codes, M3U, USB). */
(function () {
  'use strict';
  var App = window.App, U = App.U, UI = App.UI, Nav = App.Nav;

  /* ======================================================= playlist */
  var Pr = App.Profiles = {
    save: function (p, activate) {
      var S = App.Settings, list = S.get('profiles').slice(), found = false;
      for (var i = 0; i < list.length; i++) if (list[i].id === p.id) { list[i] = p; found = true; }
      if (!found) list.push(p);
      S.set('profiles', list);
      if (activate || !S.get('activeProfile')) S.set('activeProfile', p.id);
    },
    reloadSoon: function (useCache) { setTimeout(function () { App.loadActive({ fresh: !useCache }); }, 60); },

    addXtream: function (ex) {
      ex = ex || {};
      UI.form({
        title: ex.id ? 'Modifica Xtream Codes' : 'Accedi con Xtream Codes',
        saveLabel: 'Verifica e salva',
        fields: [
          { key: 'name', label: 'Nome', value: ex.name, placeholder: 'La mia IPTV', optional: true },
          { key: 'server', label: 'Server (URL)', value: ex.server, placeholder: 'http://server.com:8080', hint: 'Indirizzo del server con la porta, es. http://example.com:8080' },
          { key: 'user', label: 'Nome utente', value: ex.user },
          { key: 'pass', label: 'Password', value: ex.pass, password: true }
        ],
        onSave: function (v) {
          var xt = new App.Xtream(v.server, v.user, v.pass);
          return xt.auth().then(function () {
            Pr.save({ id: ex.id || U.uid(), type: 'xtream', name: v.name || 'Xtream ' + v.user, server: xt.base, user: v.user, pass: v.pass }, true);
            Pr.reloadSoon();
          });
        }
      });
    },

    addM3U: function (ex) {
      ex = ex || {};
      UI.form({
        title: ex.id ? 'Modifica playlist M3U' : 'Aggiungi playlist M3U',
        fields: [
          { key: 'name', label: 'Nome', value: ex.name, placeholder: 'La mia lista', optional: true },
          { key: 'url', label: 'URL playlist M3U', value: ex.url, placeholder: 'http://…/get.php?username=…', hint: 'Link alla playlist .m3u / .m3u8' },
          { key: 'epgUrl', label: 'URL guida TV (XMLTV)', value: ex.epgUrl, optional: true, hint: 'Facoltativo: se vuoto si usa url-tvg della playlist' },
          { key: 'expiry', label: 'Scadenza pacchetto', value: ex.expiry, optional: true, placeholder: 'gg/mm/aaaa', hint: 'Facoltativo: usata se il server non comunica la scadenza (es. 31/12/2026)' }
        ],
        onSave: function (v) {
          if (v.expiry && !U.parseDate(v.expiry)) return Promise.reject(new Error('Data di scadenza non valida, usa il formato gg/mm/aaaa'));
          Pr.save({ id: ex.id || U.uid(), type: 'm3u', name: v.name || 'Playlist M3U', url: v.url.trim(), epgUrl: v.epgUrl, expiry: v.expiry }, true);
          Pr.reloadSoon();
          return null;
        }
      });
    },

    editFile: function (ex) {
      UI.form({
        title: 'Modifica playlist da USB',
        fields: [
          { key: 'name', label: 'Nome', value: ex.name },
          { key: 'epgUrl', label: 'URL guida TV (XMLTV)', value: ex.epgUrl, optional: true },
          { key: 'expiry', label: 'Scadenza pacchetto', value: ex.expiry, optional: true, placeholder: 'gg/mm/aaaa' }
        ],
        onSave: function (v) {
          if (v.expiry && !U.parseDate(v.expiry)) return Promise.reject(new Error('Data di scadenza non valida, usa il formato gg/mm/aaaa'));
          ex.name = v.name; ex.epgUrl = v.epgUrl; ex.expiry = v.expiry;
          Pr.save(ex, false);
          if (App.Settings.get('activeProfile') === ex.id) Pr.reloadSoon(); else App.Screens.settings.refresh();
          return null;
        }
      });
    },

    addUsb: function () {
      App.USB.pick().then(function (f) {
        if (/\.json$/i.test(f.name) || /^\s*\{/.test(f.text)) { Pr.importConfig(f.text); return; }
        if (!/#EXTM3U|#EXTINF/i.test(f.text.slice(0, 4096))) throw new Error('Il file «' + f.name + '» non e\' una playlist M3U');
        var id = U.uid();
        return App.IDB.set('m3u:' + id, f.text).then(function () {
          Pr.save({ id: id, type: 'file', name: f.name.replace(/\.(m3u8?|txt)$/i, ''), fileName: f.name, epgUrl: '', loadedAt: Date.now() }, true);
          UI.toast('Playlist «' + f.name + '» importata dalla USB');
          Pr.reloadSoon();
        });
      })['catch'](function (e) { UI.toast(e.message || String(e), 5000); });
    },

    /* novaplay.json: {"playlists":[{type:'xtream'|'m3u', ...}], "settings":{...}} */
    importConfig: function (text) {
      var cfg;
      try { cfg = JSON.parse(text); } catch (e) { throw new Error('File JSON non valido'); }
      var n = 0, first = null;
      (cfg.playlists || cfg.profiles || []).forEach(function (p) {
        var t = (p.type || '').toLowerCase();
        var prof = null;
        if (t === 'xtream' && p.server && (p.user || p.username)) {
          prof = { id: U.uid(), type: 'xtream', name: p.name || 'Xtream', server: App.Xtream.normServer(p.server), user: p.user || p.username, pass: p.pass || p.password || '' };
        } else if ((t === 'm3u' || p.url) && p.url) {
          prof = { id: U.uid(), type: 'm3u', name: p.name || 'Playlist M3U', url: p.url, epgUrl: p.epgUrl || p.epg || '', expiry: p.expiry || '' };
        }
        if (prof) { Pr.save(prof, !first); first = first || prof; n++; }
      });
      if (cfg.settings && typeof cfg.settings === 'object') {
        for (var k in cfg.settings) {
          if (cfg.settings.hasOwnProperty(k) && k !== 'profiles' && k !== 'activeProfile' && App.Settings.data.hasOwnProperty(k)) App.Settings.data[k] = cfg.settings[k];
        }
        App.Settings.save();
        App.applyTheme();
      }
      if (!n && !cfg.settings) throw new Error('Nessuna playlist trovata nel file di configurazione');
      UI.toast('Configurazione importata: ' + n + ' playlist');
      if (n) Pr.reloadSoon(); else App.Screens.settings.refresh();
    },

    remove: function (p) {
      UI.confirm('Eliminare «' + p.name + '»?', 'La playlist, i preferiti e la cronologia collegati verranno rimossi.', function () {
        var S = App.Settings;
        S.set('profiles', S.get('profiles').filter(function (x) { return x.id !== p.id; }));
        App.IDB.del('m3u:' + p.id);
        App.IDB.del('cat:' + p.id);
        App.Store.remove('ud.' + p.id);
        if (S.get('activeProfile') === p.id) {
          S.set('activeProfile', S.get('profiles')[0] ? S.get('profiles')[0].id : null);
          Pr.reloadSoon();
        } else App.Screens.settings.refresh();
      }, 'Elimina');
    },

    actions: function (p) {
      var active = App.Settings.get('activeProfile') === p.id;
      var opts = [];
      if (!active) opts.push({ label: 'Usa questa playlist', v: 'use' });
      opts.push({ label: 'Ricarica ora', v: 'reload' });
      opts.push({ label: 'Modifica', v: 'edit' });
      if (p.type === 'file') opts.push({ label: 'Aggiorna file da USB', v: 'usb' });
      opts.push({ label: 'Elimina', v: 'del' });
      UI.select({
        title: p.name, options: opts,
        onSelect: function (o) {
          if (o.v === 'use' || o.v === 'reload') { App.Settings.set('activeProfile', p.id); Pr.reloadSoon(o.v === 'use'); }
          else if (o.v === 'edit') { if (p.type === 'xtream') Pr.addXtream(p); else if (p.type === 'm3u') Pr.addM3U(p); else Pr.editFile(p); }
          else if (o.v === 'usb') {
            App.USB.pick().then(function (f) {
              return App.IDB.set('m3u:' + p.id, f.text).then(function () {
                p.fileName = f.name; p.loadedAt = Date.now(); Pr.save(p, true); Pr.reloadSoon();
              });
            })['catch'](function (e) { UI.toast(e.message, 5000); });
          } else if (o.v === 'del') Pr.remove(p);
        }
      });
    }
  };

  /* ======================================================= schermata */
  var SECTIONS = [
    { id: 'playlists', label: 'Playlist', icon: 'live' },
    { id: 'account', label: 'Account e scadenza', icon: 'info' },
    { id: 'player', label: 'Player', icon: 'play' },
    { id: 'subs', label: 'Sottotitoli e audio', icon: 'cc' },
    { id: 'epg', label: 'Guida TV (EPG)', icon: 'series' },
    { id: 'look', label: 'Aspetto', icon: 'aspect' },
    { id: 'network', label: 'Rete e proxy', icon: 'search' },
    { id: 'about', label: 'Info app', icon: 'settings' }
  ];

  var LANGS = [{ v: 'ita', l: 'Italiano' }, { v: 'eng', l: 'Inglese' }, { v: 'spa', l: 'Spagnolo' }, { v: 'fra', l: 'Francese' },
    { v: 'deu', l: 'Tedesco' }, { v: 'por', l: 'Portoghese' }, { v: 'alb', l: 'Albanese' }, { v: 'ara', l: 'Arabo' }];

  function labelOf(opts, v) {
    for (var i = 0; i < opts.length; i++) if (opts[i].v === v) return opts[i].l;
    return String(v);
  }

  function choice(key, label, opts, desc, after) {
    return {
      label: label, desc: desc,
      value: function () { return labelOf(opts, App.Settings.get(key)); },
      run: function () {
        var cur = App.Settings.get(key);
        UI.select({
          title: label,
          options: opts.map(function (o) { return { label: o.l, sub: o.d, v: o.v, checked: o.v === cur }; }),
          onSelect: function (o) { App.Settings.set(key, o.v); St.refresh(); if (after) after(o.v); }
        });
      }
    };
  }
  function toggle(key, label, desc, after) {
    return {
      label: label, desc: desc,
      value: function () { return App.Settings.get(key) ? 'Attivo' : 'Disattivo'; },
      run: function () { App.Settings.set(key, !App.Settings.get(key)); St.refresh(); if (after) after(); }
    };
  }
  function text(key, label, desc, ph, after) {
    return {
      label: label, desc: desc,
      value: function () { return App.Settings.get(key) || '—'; },
      run: function () {
        UI.input({ title: label, value: App.Settings.get(key), placeholder: ph, hint: desc, onDone: function (v) { App.Settings.set(key, v); St.refresh(); if (after) after(); } });
      }
    };
  }
  function infoRow(label, value) { return { label: label, value: value, info: true }; }

  function reloadEpg() { if (App.Catalog.loaded) { App.EPG.init(); UI.toast('Guida TV ricaricata'); } }

  var BUILD = {
    playlists: function () {
      var S = App.Settings, rows = [], active = S.get('activeProfile');
      S.get('profiles').forEach(function (p) {
        var desc = p.type === 'xtream' ? 'Xtream Codes · ' + p.server + ' · ' + p.user
          : p.type === 'file' ? 'File USB · ' + (p.fileName || '') + (p.loadedAt ? ' · caricato il ' + U.fmtDate(p.loadedAt) : '')
            : 'M3U · ' + p.url;
        rows.push({ label: p.name, desc: desc, badge: p.id === active ? 'ATTIVA' : '', run: function () { Pr.actions(p); } });
      });
      rows.push({ label: '+ Accedi con Xtream Codes', desc: 'Server, nome utente e password', run: function () { Pr.addXtream(); } });
      rows.push({ label: '+ Aggiungi link M3U', desc: 'URL playlist, guida TV e scadenza facoltative', run: function () { Pr.addM3U(); } });
      rows.push({ label: '+ Carica da chiavetta USB', desc: 'File .m3u / .m3u8 oppure configurazione novaplay.json', run: Pr.addUsb });
      return rows;
    },

    account: function () {
      var C = App.Catalog, a = C.account, rows = [];
      if (!C.loaded || !a) return [infoRow('Nessuna playlist caricata', '')];
      var p = C.profile;
      rows.push(infoRow('Playlist', p.name));
      rows.push(infoRow('Data di oggi', U.fmtLongDate(new Date())));
      if (a.expiry) {
        var dl = U.daysLeft(a.expiry);
        rows.push(infoRow('Scadenza abbonamento', U.fmtDate(a.expiry) + ' ' + U.fmtTime(a.expiry)));
        rows.push(infoRow('Giorni rimanenti', dl < 0 ? 'Scaduto da ' + (-dl) + ' giorni' : String(dl)));
      } else rows.push(infoRow('Scadenza abbonamento', a.unlimited ? 'Illimitata' : 'Non indicata dal server'));
      if (a.status) rows.push(infoRow('Stato', a.status === 'Active' ? 'Attivo' : a.status));
      if (a.source === 'xtream') {
        rows.push(infoRow('Utente', a.username || ''));
        rows.push(infoRow('Connessioni', (a.activeCons || 0) + ' attive su ' + (a.maxCons || '?')));
        if (a.created) rows.push(infoRow('Creato il', U.fmtDate(a.created)));
        rows.push(infoRow('Abbonamento di prova', a.trial ? 'Sì' : 'No'));
        if (a.formats && a.formats.length) rows.push(infoRow('Formati consentiti', a.formats.join(', ')));
        if (a.timezone) rows.push(infoRow('Fuso orario server', a.timezone));
      }
      if (p.type !== 'xtream') {
        rows.push({
          label: 'Imposta scadenza manuale', desc: 'Per liste M3U che non indicano la scadenza',
          value: function () { return p.expiry || '—'; },
          run: function () {
            UI.input({
              title: 'Scadenza pacchetto (gg/mm/aaaa)', value: p.expiry, placeholder: '31/12/2026',
              onDone: function (v) {
                if (v && !U.parseDate(v)) { UI.toast('Data non valida'); return; }
                p.expiry = v; Pr.save(p, false);
                if (!C.account || C.account.source === 'manual') C.account = C.manualAccount(p);
                App.Header.expiry(); St.refresh();
              }
            });
          }
        });
      }
      rows.push(infoRow('Contenuti', C.live.items.length + ' canali · ' + C.movie.items.length + ' film · ' + C.series.items.length + ' serie'));
      return rows;
    },

    player: function () {
      var eng = [{ v: 'auto', l: 'Automatico', d: App.hasAVPlay() ? 'Usa AVPlay nativo Samsung' : 'Usa il player HTML5' },
        { v: 'avplay', l: 'AVPlay (Samsung, nativo)', d: 'Massima stabilità su Samsung Tizen' },
        { v: 'html5', l: 'HTML5 + hls.js / mpegts.js', d: 'Per Hisense VIDAA e browser' }];
      return [
        choice('engine', 'Motore di riproduzione', eng, 'Cambia se un canale non parte'),
        choice('liveFormat', 'Formato canali live (Xtream)', [{ v: 'ts', l: 'MPEG-TS (.ts)', d: 'Consigliato, piu\' stabile' }, { v: 'm3u8', l: 'HLS (.m3u8)' }], 'Provalo se i canali si bloccano'),
        choice('buffer', 'Buffer', [{ v: 'low', l: 'Basso', d: 'Avvio piu\' rapido' }, { v: 'medium', l: 'Medio', d: 'Consigliato' }, { v: 'high', l: 'Alto', d: 'Connessioni instabili' }], 'Un buffer maggiore riduce i blocchi'),
        toggle('autoReconnect', 'Riconnessione automatica', 'Riavvia lo stream da solo in caso di blocco o errore'),
        toggle('preview', 'Anteprima nella Live TV', 'Primo OK = anteprima, secondo OK = schermo intero'),
        choice('aspect', 'Formato immagine', [{ v: 'auto', l: 'Originale' }, { v: 'fill', l: 'Adatta allo schermo' }, { v: 'zoom', l: 'Zoom' }], 'Tasto giallo durante la visione')
      ];
    },

    subs: function () {
      return [
        toggle('subAuto', 'Attiva sottotitoli automaticamente', 'Se disponibili nella lingua preferita'),
        choice('subLang', 'Lingua sottotitoli preferita', LANGS),
        choice('subSize', 'Dimensione sottotitoli', [{ v: 'small', l: 'Piccola' }, { v: 'medium', l: 'Media' }, { v: 'large', l: 'Grande' }]),
        choice('audioLang', 'Lingua audio preferita', LANGS, 'Scelta automatica della traccia audio'),
        infoRow('Durante la visione', 'Tasto rosso = sottotitoli · verde = audio')
      ];
    },

    epg: function () {
      var offs = [];
      for (var h = -12; h <= 12; h++) offs.push({ v: h, l: (h > 0 ? '+' : '') + h + ' ore' });
      return [
        choice('epgMode', 'Sorgente guida TV', [
          { v: 'auto', l: 'Automatica', d: 'Xtream: guida per canale · M3U: XMLTV' },
          { v: 'xmltv', l: 'XMLTV completo', d: 'Scarica tutta la guida (piu\' lento)' },
          { v: 'off', l: 'Disattivata' }], '', reloadEpg),
        text('epgUrl', 'URL XMLTV personalizzato', 'Sostituisce quello della playlist (.xml o .xml.gz)', 'http://…/epg.xml', reloadEpg),
        choice('epgOffset', 'Correzione orario guida', offs, 'Se gli orari dei programmi risultano sfasati', reloadEpg),
        { label: 'Ricarica guida TV', desc: App.EPG.status || ('Modalità attuale: ' + App.EPG.mode), run: reloadEpg }
      ];
    },

    look: function () {
      var th = Object.keys(App.THEMES).map(function (k) { return { v: k, l: App.THEMES[k].name }; });
      return [
        choice('theme', 'Tema', th, 'Colori ispirati a Prime Video, Netflix, YouTube e Apple TV', App.applyTheme),
        toggle('hideAdult', 'Nascondi categorie per adulti', 'Nasconde le categorie con XXX, Adult, 18+…', function () {
          App.Screens.live.reset(); App.Screens.movie.reset(); App.Screens.series.reset();
        })
      ];
    },

    network: function () {
      return [
        text('proxy', 'Proxy CORS manuale', 'Lascia vuoto se apri l\'app da tools/serve.js: il proxy si attiva da solo. Non serve su Samsung.', 'http://192.168.1.10:8080/proxy'),
        toggle('proxyStreams', 'Usa il proxy anche per i video', 'Attiva solo se i video non partono per errori CORS'),
        infoRow('Proxy automatico', App.autoProxy ? 'Attivo: ' + App.autoProxy : 'Non attivo'),
        infoRow('Piattaforma', App.isTizen ? 'Samsung Tizen' : App.isVidaa ? 'Hisense VIDAA' : 'Browser')
      ];
    },

    about: function () {
      return [
        infoRow('Applicazione', App.NAME + ' IPTV ' + App.VERSION),
        infoRow('Piattaforma', App.isTizen ? 'Samsung Tizen' : App.isVidaa ? 'Hisense VIDAA' : 'Browser web'),
        infoRow('Player disponibili', (App.hasAVPlay() ? 'AVPlay, ' : '') + 'HTML5' + (window.Hls && window.Hls.isSupported() ? ', hls.js' : '') + (window.mpegts && window.mpegts.isSupported() ? ', mpegts.js' : '')),
        infoRow('Risoluzione', window.innerWidth + '×' + window.innerHeight),
        {
          label: 'Cancella tutti i dati', desc: 'Rimuove playlist, preferiti e impostazioni', run: function () {
            UI.confirm('Cancellare tutti i dati?', 'L\'app tornerà alle impostazioni iniziali.', function () {
              App.Settings.get('profiles').forEach(function (p) { App.IDB.del('m3u:' + p.id); App.Store.remove('ud.' + p.id); });
              App.Store.remove('settings');
              App.Settings.load();
              App.applyTheme();
              App.loadActive();
            }, 'Cancella');
          }
        }
      ];
    }
  };

  var St = App.Screens.settings = {
    name: 'settings',
    entry: 'menu',
    sec: 0,

    init: function (el) {
      el.innerHTML = '<div class="set-menu"><div class="m-list"></div></div><div class="set-body"><h2></h2><div class="set-rows"></div></div>';
      St.menu = new App.List({
        el: U.$('.m-list', el), dir: 'v', cls: 'set-item', edges: { right: 'rows', up: 'nav' },
        render: function (s) { return UI.icons[s.icon] + '<span>' + s.label + '</span>'; },
        onFocus: function (s, i) { St.sec = i; St.renderSection(); },
        onSelect: function () { Nav.focus('rows'); }
      });
      St.rows = new App.List({
        el: U.$('.set-rows', el), dir: 'v', cls: 'srow', edges: { left: 'menu', up: 'nav' },
        render: function (r) {
          var v = typeof r.value === 'function' ? r.value() : r.value;
          return '<div class="s-label">' + U.esc(r.label) + (r.badge ? '<span class="badge">' + r.badge + '</span>' : '') +
            (r.desc ? '<small>' + U.esc(r.desc) + '</small>' : '') + '</div>' +
            (v !== undefined && v !== '' ? '<div class="s-val">' + U.esc(v) + '</div>' : '');
        },
        onSelect: function (r) { if (r.run) r.run(); }
      });
    },

    show: function () {
      St.menu.setItems(SECTIONS, St.sec);
      St.renderSection();
      return { menu: St.menu, rows: St.rows };
    },

    renderSection: function (keep) {
      var s = SECTIONS[St.sec];
      U.$('.set-body h2', St.el).textContent = s.label;
      St.rows.setItems(BUILD[s.id](), keep ? St.rows.index : 0);
    },

    refresh: function () {
      if (App.screen === St) St.renderSection(true);
    }
  };
})();
