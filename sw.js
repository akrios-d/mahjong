"use strict";
/* App-shell service worker: offline-first for the static game files.
   Bump CACHE_NAME whenever the precache list changes so old caches get
   cleaned up. Multiplayer traffic (ws:// / wss://) is never intercepted —
   the fetch handler only sees http(s) requests. */
const CACHE_NAME = "jogos-mesa-v3";
const PRECACHE = [
  "./",
  "index.html",
  "style.css",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "shared/pwa.js",
  "shared/roomUtils.js",
  "shared/landlordRules.js",
  "shared/landlordEngine.js",
  "shared/dominoRules.js",
  "shared/dominoEngine.js",
  "shared/adedonhaWords.js",
  "shared/adedonhaEngine.js",
  "shared/desenhoWords.js",
  "shared/desenhoEngine.js",
  "mahjong/index.html",
  "mahjong/mahjong.css",
  "mahjong/mahjong.js",
  "landlord/index.html",
  "landlord/landlord.css",
  "landlord/landlord-client.js",
  "domino/index.html",
  "domino/domino.css",
  "domino/domino-client.js",
  "adedonha/index.html",
  "adedonha/adedonha.css",
  "adedonha/adedonha-client.js",
  "desenho/index.html",
  "desenho/desenho.css",
  "desenho/desenho-client.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => null)) // tolerate files that don't exist yet
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await networkFetch) || Response.error();
    })
  );
});
