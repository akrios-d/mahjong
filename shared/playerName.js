"use strict";
/* Shared player name, persisted in localStorage so it's the same across
   the landing page and every game — set it once, it's pre-filled
   everywhere. Browser-only (mirrors shared/pwa.js's pattern). */
(function () {
  var KEY = "playerName";
  function get() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function set(name) {
    try {
      var clean = String(name || "").trim().slice(0, 20);
      if (clean) localStorage.setItem(KEY, clean);
    } catch (e) { /* ignore */ }
  }
  window.PlayerName = { get: get, set: set };
})();
