"use strict";
/* Generic room/seat helpers shared by every game engine (landlord, domino,
   adedonha, desenho) and by both the WS server and the offline local-play
   mode. A "room" is: { game, code, seats:[{ws,name,isAI}], started, state,
   hooks:{ update() } } — hooks.update() is called whenever the state
   changes; the server implementation broadcasts over WebSocket, the local
   implementation just re-renders the page. */

function makeRoom(game, code, seatCount) {
  return {
    game,
    code,
    seats: Array.from({ length: seatCount }, () => ({ ws: null, name: null, isAI: false })),
    started: false,
    state: null,
    hooks: { update() {} },
  };
}

function findOpenSeat(room) {
  return room.seats.findIndex((s) => !s.ws && !s.isAI);
}

function fillWithAI(room) {
  room.seats.forEach((s, i) => {
    if (!s.ws) { s.isAI = true; s.name = s.name || `IA ${i + 1}`; }
  });
}

function pushLog(room, text) {
  room.state.log = room.state.log || [];
  room.state.log.push(text);
  if (room.state.log.length > 40) room.state.log.shift();
}

function viewBase(room, seatIdx) {
  return {
    game: room.game,
    code: room.code,
    seatIdx,
    started: room.started,
    seats: room.seats.map((se) => ({ name: se.name, isAI: se.isAI, connected: !!se.ws || se.isAI })),
    log: room.state && room.state.log ? room.state.log.slice(-12) : [],
  };
}

const RU_API = { makeRoom, findOpenSeat, fillWithAI, pushLog, viewBase };
if (typeof module !== "undefined" && module.exports) module.exports = RU_API;
if (typeof window !== "undefined") window.RoomUtils = RU_API;
