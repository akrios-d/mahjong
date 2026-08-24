"use strict";
/* WebSocket multiplayer server for Landlord (Dou Dizhu) and Dominó em duplas.
   Rooms are created on demand: {game, code}. Human players fill seats as
   they join; any seated player can start the match early, filling the
   remaining empty seats with AI. If a human disconnects mid-game their
   seat is simply taken over by AI so the game keeps going.

   The actual game rules/turn orchestration live in shared/landlordEngine.js
   and shared/dominoEngine.js (isomorphic — the offline "vs IA" mode in the
   browser uses the exact same engines, just with a different room.hooks.update). */

const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const RU = require(path.join(__dirname, "..", "shared", "roomUtils.js"));
const LE = require(path.join(__dirname, "..", "shared", "landlordEngine.js"));
const DE = require(path.join(__dirname, "..", "shared", "dominoEngine.js"));
const AE = require(path.join(__dirname, "..", "shared", "adedonhaEngine.js"));
const DsE = require(path.join(__dirname, "..", "shared", "desenhoEngine.js"));

const PORT = process.env.PORT || 8787;
const SEATS = { landlord: 3, domino: 4, adedonha: 8, desenho: 8 };
const ENGINES = { landlord: LE, domino: DE, adedonha: AE, desenho: DsE };
const GAMES = Object.keys(SEATS);

const rooms = new Map(); // key `${game}:${code}` -> Room

function roomKey(game, code) { return `${game}:${code.toUpperCase()}`; }

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastState(room) {
  const engine = ENGINES[room.game];
  room.seats.forEach((seat, i) => {
    if (!seat.ws) return;
    send(seat.ws, { type: "state", state: engine.viewFor(room, i) });
  });
}

function makeServerRoom(game, code) {
  const room = RU.makeRoom(game, code, SEATS[game]);
  room.hooks = { update: () => broadcastState(room) };
  return room;
}

function startRoom(room, fillAI) {
  if (room.started) return;
  if (fillAI) RU.fillWithAI(room);
  room.started = true;
  ENGINES[room.game].deal(room);
}

function handleJoin(ws, msg) {
  const game = GAMES.includes(msg.game) ? msg.game : "landlord";
  const code = String(msg.room || "SALA").trim().slice(0, 12) || "SALA";
  const key = roomKey(game, code);
  let room = rooms.get(key);
  if (!room) { room = makeServerRoom(game, code); rooms.set(key, room); }
  if (room.started) { send(ws, { type: "error", message: "Essa sala já começou. Crie/entre em outra." }); return; }
  const seatIdx = RU.findOpenSeat(room);
  if (seatIdx === -1) { send(ws, { type: "error", message: "Sala cheia." }); return; }
  room.seats[seatIdx] = { ws, name: (msg.name || `Jogador ${seatIdx + 1}`).slice(0, 20), isAI: false };
  ws.roomKey = key;
  ws.seatIdx = seatIdx;
  send(ws, { type: "joined", game, room: code, seatIdx, seatsTotal: room.seats.length });
  room.state = room.state || { log: [] };
  RU.pushLog(room, `${room.seats[seatIdx].name} entrou na sala (assento ${seatIdx + 1}).`);
  broadcastState(room);
}

function handleDisconnect(ws) {
  if (!ws.roomKey) return;
  const room = rooms.get(ws.roomKey);
  if (!room) return;
  const seat = room.seats[ws.seatIdx];
  if (!seat || seat.ws !== ws) return;
  const name = seat.name;
  seat.ws = null;
  if (room.started && room.game !== "desenho") {
    seat.isAI = true; // AI takes over so the game keeps going (not supported in desenho)
    RU.pushLog(room, `${name} desconectou — a IA assumiu o assento.`);
  } else if (room.started) {
    RU.pushLog(room, `${name} desconectou.`);
  } else {
    room.seats[ws.seatIdx] = { ws: null, name: null, isAI: false };
    RU.pushLog(room, `${name} saiu da sala.`);
  }
  broadcastState(room);
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Landlord & Dominó multiplayer server is running.\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "join") return handleJoin(ws, msg);

    const room = ws.roomKey ? rooms.get(ws.roomKey) : null;
    if (!room) return send(ws, { type: "error", message: "Você não está em nenhuma sala." });
    const seatIdx = ws.seatIdx;
    const engine = ENGINES[room.game];

    // Canvas strokes are pure real-time streaming data, relayed straight
    // through to the other players without touching the reconciled state.
    if (room.game === "desenho" && (msg.type === "stroke" || msg.type === "clearCanvas")) {
      if (!room.state || room.state.drawerSeat !== seatIdx) return;
      room.seats.forEach((seat, i) => { if (i !== seatIdx && seat.ws) send(seat.ws, msg); });
      return;
    }

    if (msg.type === "startWithAI") return startRoom(room, true);
    if (msg.type === "startAsIs") return startRoom(room, false);
    if (msg.type === "newHand") return engine.requestNewHand && engine.requestNewHand(room);
    if (!room.state || room.state.phase === undefined) return;

    let result = null;
    if (room.game === "landlord") {
      if (msg.type === "bid") result = engine.submitBid(room, seatIdx, msg.value);
      else if (msg.type === "play") result = engine.submitPlay(room, seatIdx, msg.uids);
      else if (msg.type === "pass") result = engine.submitPass(room, seatIdx);
    } else if (room.game === "domino") {
      if (msg.type === "playDomino") result = engine.submitPlay(room, seatIdx, msg.tileId, msg.side);
      else if (msg.type === "passDomino") result = engine.submitPass(room, seatIdx);
    } else if (room.game === "adedonha") {
      if (msg.type === "addCategory") result = engine.submitAddCategory(room, seatIdx, msg.text);
      else if (msg.type === "useDefaults") result = engine.submitUseDefaults(room);
      else if (msg.type === "startRound") result = engine.startRound(room, seatIdx);
      else if (msg.type === "setAnswer") result = engine.submitSetAnswer(room, seatIdx, msg.category, msg.text);
      else if (msg.type === "stopRound") result = engine.submitStop(room, seatIdx);
    } else if (room.game === "desenho") {
      if (msg.type === "startRound") result = engine.startRound(room);
      else if (msg.type === "guess") result = engine.submitGuess(room, seatIdx, msg.text);
    }
    if (result && !result.ok) send(ws, { type: "error", message: result.error });
  });

  ws.on("close", () => handleDisconnect(ws));
});

server.listen(PORT, () => {
  console.log(`Landlord & Dominó multiplayer server listening on :${PORT}`);
});
