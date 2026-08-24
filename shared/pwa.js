"use strict";
/* Registers the service worker relative to wherever this file is hosted,
   so the app installs correctly whether it's served from the domain root
   or a sub-path (e.g. GitHub Pages project pages). */
(function () {
  if (!("serviceWorker" in navigator)) return;
  var scriptUrl = document.currentScript.src; // .../<root>/shared/pwa.js
  var root = new URL("../", scriptUrl);
  var swUrl = new URL("sw.js", root).href;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register(swUrl, { scope: root.pathname }).catch(function (err) {
      console.warn("Falha ao registrar service worker:", err);
    });
  });
})();
