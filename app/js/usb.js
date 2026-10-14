/*
 * Lettura file da chiavetta USB.
 *  - Samsung Tizen: tizen.filesystem (memorie "removable").
 *  - Hisense VIDAA / browser: selettore file del browser.
 */
(function () {
  'use strict';
  var App = window.App, UI = App.UI;

  var FILE_RE = /\.(m3u8?|txt|json)$/i;

  function tizenList() {
    return new Promise(function (resolve, reject) {
      var fs = window.tizen.filesystem, found = [];
      fs.listStorages(function (st) {
        var ext = st.filter(function (s) { return s.type === 'EXTERNAL' && (!s.state || s.state === 'MOUNTED'); });
        if (!ext.length) { reject(new Error('Nessuna chiavetta USB rilevata')); return; }
        var jobs = ext.map(function (s) {
          return new Promise(function (done) {
            fs.resolve(s.label, function (dir) { scan(dir, 0, s.label, done); }, function () { done(); }, 'r');
          });
        });
        Promise.all(jobs).then(function () { resolve(found); });
      }, function (e) { reject(new Error('Accesso USB negato: ' + (e && e.message))); });

      function scan(dir, depth, label, done) {
        try {
          dir.listFiles(function (files) {
            var subs = [];
            files.forEach(function (f) {
              if (f.isDirectory) { if (depth < 2 && f.name.charAt(0) !== '.') subs.push(f); }
              else if (FILE_RE.test(f.name)) found.push({ name: f.name, path: f.fullPath, size: f.fileSize, file: f, label: label });
            });
            Promise.all(subs.map(function (d) {
              return new Promise(function (ok) { scan(d, depth + 1, label, ok); });
            })).then(function () { done(); });
          }, function () { done(); });
        } catch (e) { done(); }
      }
    });
  }

  function tizenRead(f) {
    return new Promise(function (resolve, reject) {
      try {
        if (f.file.readAsText) {
          f.file.readAsText(resolve, function (e) { reject(new Error('Lettura non riuscita: ' + (e && e.message))); }, 'UTF-8');
          return;
        }
        var h = window.tizen.filesystem.openFile(f.path, 'r');
        var t = h.readString();
        h.close();
        resolve(t);
      } catch (e) { reject(e); }
    });
  }

  function browserPick() {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.m3u,.m3u8,.txt,.json,audio/x-mpegurl,application/json,text/plain';
      inp.style.display = 'none';
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) { reject(new Error('Nessun file selezionato')); return; }
        var r = new FileReader();
        r.onload = function () { resolve({ name: f.name, text: String(r.result) }); };
        r.onerror = function () { reject(new Error('Lettura del file non riuscita')); };
        r.readAsText(f, 'UTF-8');
        if (inp.parentNode) inp.parentNode.removeChild(inp);
      };
      document.body.appendChild(inp);
      inp.click();
    });
  }

  App.USB = {
    /* Promise({name, text}) */
    pick: function () {
      if (!(window.tizen && window.tizen.filesystem)) return browserPick();
      UI.loading('Ricerca file sulla chiavetta USB…');
      return tizenList().then(function (files) {
        UI.loading(false);
        if (!files.length) throw new Error('Nessun file .m3u, .m3u8 o .json trovato sulla chiavetta');
        return new Promise(function (resolve, reject) {
          UI.select({
            title: 'Scegli un file dalla chiavetta USB',
            options: files.map(function (f) {
              return { label: f.name, sub: f.path + (f.size ? ' · ' + Math.round(f.size / 1024) + ' KB' : ''), f: f };
            }),
            onSelect: function (o) {
              UI.loading('Lettura di ' + o.f.name + '…');
              tizenRead(o.f).then(function (text) {
                UI.loading(false);
                resolve({ name: o.f.name, text: text });
              }, function (e) { UI.loading(false); reject(e); });
            }
          });
        });
      }, function (e) { UI.loading(false); throw e; });
    }
  };
})();
