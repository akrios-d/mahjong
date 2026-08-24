"use strict";
/* Looks up open (non-empty, non-full, not-yet-started) rooms for a game via
   a short-lived WebSocket connection — used by each game's lobby to let
   players find a room instead of typing a code blind. Browser-only. */
(function () {
  function search(game, onResult, onError) {
    const url = (window.ServerConfig && (ServerConfig.get() || ServerConfig.defaultUrl())) || "";
    let ws;
    try { ws = new WebSocket(url); } catch (e) { onError && onError(e); return; }
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) { /* ignore */ }
      onError && onError(new Error("timeout"));
    }, 5000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "listRooms", game }));
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === "roomList") {
        clearTimeout(timer);
        onResult(msg.rooms || []);
        try { ws.close(); } catch (e) { /* ignore */ }
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      onError && onError(new Error("ws error"));
    });
  }
  window.RoomSearch = { search: search };
})();
