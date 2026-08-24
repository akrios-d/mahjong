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
const MJE = require(path.join(__dirname, "..", "shared", "mahjongEngine.js"));
const PZE = require(path.join(__dirname, "..", "shared", "puzzleEngine.js"));

const PORT = process.env.PORT || 8787;
const SEATS = { landlord: 3, domino: 4, adedonha: 8, desenho: 8, mahjong: 4, puzzle: 8 };
const ENGINES = { landlord: LE, domino: DE, adedonha: AE, desenho: DsE, mahjong: MJE, puzzle: PZE };
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
  room.hooks = {
    update: () => broadcastState(room),
    image: (dataUrl) => room.seats.forEach((seat) => { if (seat.ws) send(seat.ws, { type: "image", dataUrl }); }),
  };
  return room;
}

function startRoom(room, fillAI) {
  if (room.started) return;
  if (fillAI) RU.fillWithAI(room);
  room.started = true;
  ENGINES[room.game].deal(room);
}

function handleListRooms(ws, msg) {
  const game = GAMES.includes(msg.game) ? msg.game : null;
  if (!game) return;
  const list = [];
  for (const room of rooms.values()) {
    if (room.game !== game || room.started) continue;
    const seatsUsed = room.seats.filter((s) => s.ws || s.isAI).length;
    if (seatsUsed === 0 || seatsUsed >= room.seats.length) continue; // hide empty/full rooms
    list.push({ code: room.code, seatsUsed, seatsTotal: room.seats.length });
  }
  send(ws, { type: "roomList", game, rooms: list });
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
  RU.pushLog(room, "common.log.joined", { name: room.seats[seatIdx].name, seat: seatIdx + 1 });
  broadcastState(room);
  if (game === "puzzle" && room.state.imageData) send(ws, { type: "image", dataUrl: room.state.imageData });
}

function handleDisconnect(ws) {
  if (!ws.roomKey) return;
  const room = rooms.get(ws.roomKey);
  if (!room) return;
  const seat = room.seats[ws.seatIdx];
  if (!seat || seat.ws !== ws) return;
  const name = seat.name;
  seat.ws = null;
  const noAiGames = new Set(["desenho", "puzzle"]);
  if (room.started && !noAiGames.has(room.game)) {
    seat.isAI = true; // AI takes over so the game keeps going (not supported in desenho/puzzle)
    RU.pushLog(room, "common.log.disconnectedAiTookOver", { name });
  } else if (room.started) {
    RU.pushLog(room, "common.log.disconnected", { name });
  } else {
    room.seats[ws.seatIdx] = { ws: null, name: null, isAI: false };
    RU.pushLog(room, "common.log.left", { name });
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
    if (msg.type === "listRooms") return handleListRooms(ws, msg);

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
      else if (msg.type === "pickStarter") result = engine.submitPickStarter(room, seatIdx, msg.seat);
    } else if (room.game === "adedonha") {
      if (msg.type === "addCategory") result = engine.submitAddCategory(room, seatIdx, msg.text);
      else if (msg.type === "useDefaults") result = engine.submitUseDefaults(room);
      else if (msg.type === "startRound") result = engine.startRound(room, seatIdx);
      else if (msg.type === "setAnswer") result = engine.submitSetAnswer(room, seatIdx, msg.category, msg.text);
      else if (msg.type === "stopRound") result = engine.submitStop(room, seatIdx);
    } else if (room.game === "desenho") {
      if (msg.type === "startRound") result = engine.startRound(room);
      else if (msg.type === "guess") result = engine.submitGuess(room, seatIdx, msg.text);
    } else if (room.game === "mahjong") {
      if (msg.type === "chooseMissingSuit") result = engine.submitMissingSuit(room, seatIdx, msg.suit);
      else if (msg.type === "discard") result = engine.submitDiscard(room, seatIdx, msg.uid);
      else if (msg.type === "selfKong") result = engine.submitSelfKong(room, seatIdx);
      else if (msg.type === "selfHu") result = engine.submitSelfHu(room, seatIdx);
      else if (msg.type === "claimResponse") result = engine.submitClaimResponse(room, seatIdx, msg.action, msg.chiOption);
    } else if (room.game === "puzzle") {
      if (msg.type === "uploadImage") result = engine.submitUploadImage(room, seatIdx, msg.dataUrl, msg.aspect);
      else if (msg.type === "startPuzzle") result = engine.submitStartPuzzle(room, seatIdx, msg.rows, msg.cols);
      else if (msg.type === "movePiece") result = engine.submitMovePiece(room, seatIdx, msg.pieceId, msg.x, msg.y);
      else if (msg.type === "dropPiece") result = engine.submitDropPiece(room, seatIdx, msg.pieceId, msg.x, msg.y);
    }
    if (result && !result.ok) send(ws, { type: "error", message: result.error });
  });

  ws.on("close", () => handleDisconnect(ws));
});

server.listen(PORT, () => {
  console.log(`Landlord & Dominó multiplayer server listening on :${PORT}`);
});
