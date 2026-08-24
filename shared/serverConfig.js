"use strict";
/* Shared server address, persisted in localStorage so it's set once on the
   landing page and used by every game — mirrors shared/playerName.js. */
(function () {
  var KEY = "serverUrl";
  function defaultUrl() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + (location.hostname || "localhost") + ":8787";
  }
  function get() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function set(url) {
    try {
      var clean = String(url || "").trim();
      if (clean) localStorage.setItem(KEY, clean);
    } catch (e) { /* ignore */ }
  }
  window.ServerConfig = { get: get, set: set, defaultUrl: defaultUrl };
})();
