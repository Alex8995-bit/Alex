/* Client API Xtream Codes (player_api.php). */
(function () {
  'use strict';
  var App = window.App, U = App.U;

  function normServer(s) {
    s = String(s || '').trim();
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    s = s.replace(/\/(player_api|get|panel_api|xmltv)\.php.*$/i, '');
    return s.replace(/\/+$/, '');
  }

  function Xtream(server, user, pass) {
    this.base = normServer(server);
    this.user = String(user || '').trim();
    this.pass = String(pass || '').trim();
  }

  Xtream.normServer = normServer;

  Xtream.prototype.cred = function () {
    return 'username=' + encodeURIComponent(this.user) + '&password=' + encodeURIComponent(this.pass);
  };

  Xtream.prototype.api = function (action, params, timeout) {
    var url = this.base + '/player_api.php?' + this.cred();
    if (action) url += '&action=' + action;
    if (params) {
      for (var k in params) if (params.hasOwnProperty(k)) url += '&' + k + '=' + encodeURIComponent(params[k]);
    }
    return U.http(url, { json: true, timeout: timeout || 45000 });
  };

  /* Verifica credenziali e restituisce le info account normalizzate. */
  Xtream.prototype.auth = function () {
    return this.api('', null, 20000).then(function (r) {
      var ui = r && r.user_info;
      if (!ui || String(ui.auth) === '0') throw new Error('Credenziali Xtream non valide');
      return Xtream.account(r);
    });
  };

  Xtream.account = function (r) {
    var ui = r.user_info || {}, si = r.server_info || {};
    var exp = ui.exp_date && ui.exp_date !== 'null' ? U.parseDate(ui.exp_date) : null;
    return {
      source: 'xtream',
      status: ui.status || 'Active',
      expiry: exp,
      unlimited: !exp,
      trial: String(ui.is_trial) === '1',
      maxCons: ui.max_connections,
      activeCons: ui.active_cons,
      created: ui.created_at ? U.parseDate(ui.created_at) : null,
      username: ui.username,
      formats: ui.allowed_output_formats || [],
      timezone: si.timezone || '',
      serverUrl: si.url ? (si.server_protocol || 'http') + '://' + si.url + ':' + (si.port || 80) : ''
    };
  };

  Xtream.prototype.liveUrl = function (id, ext) {
    return this.base + '/live/' + encodeURIComponent(this.user) + '/' + encodeURIComponent(this.pass) + '/' + id + '.' + (ext || 'ts');
  };
  Xtream.prototype.vodUrl = function (id, ext) {
    return this.base + '/movie/' + encodeURIComponent(this.user) + '/' + encodeURIComponent(this.pass) + '/' + id + '.' + (ext || 'mp4');
  };
  Xtream.prototype.episodeUrl = function (id, ext) {
    return this.base + '/series/' + encodeURIComponent(this.user) + '/' + encodeURIComponent(this.pass) + '/' + id + '.' + (ext || 'mp4');
  };
  Xtream.prototype.xmltvUrl = function () {
    return this.base + '/xmltv.php?' + this.cred();
  };

  App.Xtream = Xtream;
})();
