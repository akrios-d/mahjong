"use strict";
/* WebSocket multiplayer server for Landlord (Dou Dizhu) and Dominó em duplas.
   Rooms are created on demand: {game, code}. Human players fill seats as
   they join; any seated player can start the match early, filling the
   remaining empty seats with AI. If a human disconnects mid-game their
   seat is simply taken over by AI so the game keeps going. */

const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const LR = require(path.join(__dirname, "..", "shared", "landlordRules.js"));
const DR = require(path.join(__dirname, "..", "shared", "dominoRules.js"));

const PORT = process.env.PORT || 8787;
const SEATS = { landlord: 3, domino: 4 };

const rooms = new Map(); // key `${game}:${code}` -> Room

function roomKey(game, code) { return `${game}:${code.toUpperCase()}`; }

function makeRoom(game, code) {
  return {
    game,
    code,
    seats: Array.from({ length: SEATS[game] }, () => ({ ws: null, name: null, isAI: false })),
    started: false,
    state: null,
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastLog(room, text) {
  room.state.log = room.state.log || [];
  room.state.log.push(text);
  if (room.state.log.length > 40) room.state.log.shift();
}

function broadcastState(room) {
  room.seats.forEach((seat, i) => {
    if (!seat.ws) return;
    send(seat.ws, { type: "state", state: viewFor(room, i) });
  });
}

/* ---------------- view filtering (hide other players' hidden info) ---------------- */
function viewFor(room, seatIdx) {
  const s = room.state;
  if (!s) return null;
  const base = {
    game: room.game, code: room.code, seatIdx, started: room.started,
    seats: room.seats.map((se) => ({ name: se.name, isAI: se.isAI, connected: !!se.ws || se.isAI })),
    log: s.log ? s.log.slice(-12) : [],
  };
  if (!room.started) return base;

  if (room.game === "landlord") {
    return {
      ...base,
      phase: s.phase,
      turnIdx: s.turnIdx,
      landlordIdx: s.landlordIdx,
      highestBid: s.highestBid,
      currentBidderIdx: s.phase === "bidding" ? s.biddingOrder[s.biddingStep] : -1,
      kittyRevealed: s.landlordIdx !== -1,
      kitty: s.landlordIdx !== -1 ? s.kitty : s.kitty.map(() => null),
      hand: s.players[seatIdx].hand,
      handCounts: s.players.map((p) => p.hand.length),
      isLandlord: s.players.map((p) => p.isLandlord),
      lastPlays: s.lastPlays,
      currentTrick: s.currentTrick ? { type: s.currentTrick.combo.type, length: s.currentTrick.combo.length, mainRank: s.currentTrick.combo.mainRank, ownerIdx: s.currentTrick.ownerIdx } : null,
      winnerIdx: s.winnerIdx ?? null,
    };
  }
  // domino
  return {
    ...base,
    phase: s.phase,
    turnIdx: s.turnIdx,
    hand: s.hands[seatIdx],
    handCounts: s.hands.map((h) => h.length),
    mortoCount: s.morto.length,
    board: s.board,
    teamScores: s.teamScores,
    targetScore: s.targetScore,
    lastBatida: s.lastBatida || null,
    passStreak: s.passStreak,
  };
}

/* ============================================================
   LANDLORD game logic (server-authoritative)
   ============================================================ */
function landlordDeal(room) {
  const deck = LR.shuffle(LR.buildDeck());
  const players = [0, 1, 2].map((i) => ({
    hand: deck.slice(i * 17, i * 17 + 17).sort((a, b) => a.value - b.value),
    isLandlord: false,
    name: room.seats[i].name || `Bot ${i}`,
  }));
  const kitty = deck.slice(51, 54);
  const start = Math.floor(Math.random() * 3);
  room.state = {
    phase: "bidding",
    players, kitty,
    currentTrick: null, turnIdx: start, landlordIdx: -1,
    passStreak: 0, lastPlays: [null, null, null],
    biddingOrder: [start, (start + 1) % 3, (start + 2) % 3],
    biddingStep: 0, highestBid: 0, highestBidder: -1,
    winnerIdx: null, log: room.state ? room.state.log : [],
  };
  broadcastLog(room, "Nova mão distribuída. Rodada de lances iniciada.");
  landlordAdvanceBidding(room);
}

function landlordAdvanceBidding(room) {
  const s = room.state;
  if (s.biddingStep >= 3) return landlordFinishBidding(room);
  const idx = s.biddingOrder[s.biddingStep];
  if (room.seats[idx].isAI) {
    setTimeout(() => {
      if (!room.state || room.state.phase !== "bidding") return;
      const hand = s.players[idx].hand;
      const strength = LR.handStrength(hand);
      let bid = 0;
      const willingness = strength - s.highestBid * 1.5;
      if (willingness > 4) bid = 3;
      else if (willingness > 2) bid = Math.min(3, s.highestBid + (Math.random() < 0.7 ? 1 : 2));
      else if (willingness > 0 && Math.random() < 0.6) bid = s.highestBid + 1;
      if (bid > 3) bid = 3;
      if (bid <= s.highestBid) bid = 0;
      landlordRegisterBid(room, idx, bid);
    }, 700 + Math.random() * 400);
  } else {
    broadcastState(room);
  }
}

function landlordRegisterBid(room, idx, bid) {
  const s = room.state;
  if (bid > s.highestBid) { s.highestBid = bid; s.highestBidder = idx; }
  s.biddingStep++;
  broadcastLog(room, bid === 0 ? `${s.players[idx].name} passou o lance.` : `${s.players[idx].name} deu lance ${bid}.`);
  if (s.highestBid === 3) return landlordFinishBidding(room);
  landlordAdvanceBidding(room);
}

function landlordFinishBidding(room) {
  const s = room.state;
  if (s.highestBidder === -1) {
    broadcastLog(room, "Ninguém deu lance. Redistribuindo...");
    broadcastState(room);
    setTimeout(() => landlordDeal(room), 1200);
    return;
  }
  s.landlordIdx = s.highestBidder;
  s.players[s.landlordIdx].isLandlord = true;
  s.players[s.landlordIdx].hand.push(...s.kitty);
  s.players[s.landlordIdx].hand.sort((a, b) => a.value - b.value);
  s.phase = "playing";
  s.turnIdx = s.landlordIdx;
  broadcastLog(room, `${s.players[s.landlordIdx].name} é o Landlord e recebeu as 3 cartas do monte.`);
  broadcastState(room);
  landlordMaybeAI(room);
}

function landlordMaybeAI(room) {
  const s = room.state;
  if (s.phase !== "playing") return;
  if (!room.seats[s.turnIdx].isAI) return;
  setTimeout(() => {
    if (!room.state || room.state.phase !== "playing") return;
    const hand = s.players[s.turnIdx].hand;
    let combo;
    if (s.currentTrick === null || s.currentTrick.ownerIdx === s.turnIdx) combo = LR.aiChooseLead(hand);
    else combo = LR.aiChooseFollow(hand, s.currentTrick.combo);
    if (combo) landlordApplyPlay(room, s.turnIdx, combo);
    else landlordApplyPass(room, s.turnIdx);
  }, 800 + Math.random() * 500);
}

function landlordApplyPlay(room, idx, combo) {
  const s = room.state;
  const uids = new Set(combo.cards.map((c) => c.uid));
  s.players[idx].hand = s.players[idx].hand.filter((c) => !uids.has(c.uid));
  s.currentTrick = { combo, ownerIdx: idx };
  s.passStreak = 0;
  s.lastPlays[idx] = combo;
  broadcastLog(room, `${s.players[idx].name} jogou ${LR.comboLabel(combo)} (${combo.cards.map(LR.cardLabel).join(" ")}).`);
  if (s.players[idx].hand.length === 0) {
    s.phase = "roundEnd";
    s.winnerIdx = idx;
    broadcastLog(room, `${s.players[idx].name} venceu a mão!`);
    broadcastState(room);
    return;
  }
  s.turnIdx = (idx + 1) % 3;
  broadcastState(room);
  landlordMaybeAI(room);
}

function landlordApplyPass(room, idx) {
  const s = room.state;
  s.passStreak++;
  s.lastPlays[idx] = null;
  broadcastLog(room, `${s.players[idx].name} passou.`);
  if (s.passStreak >= 2) { s.currentTrick = null; s.passStreak = 0; }
  s.turnIdx = (idx + 1) % 3;
  broadcastState(room);
  landlordMaybeAI(room);
}

/* ============================================================
   DOMINO game logic (server-authoritative)
   ============================================================ */
function dominoDeal(room, keepScores) {
  const { hands, morto } = DR.dealDomino();
  const { seat } = DR.findStarter(hands);
  const teamScores = keepScores || [0, 0];
  room.state = {
    phase: "playing",
    hands, morto,
    board: DR.emptyBoard(),
    turnIdx: seat,
    passStreak: 0,
    teamScores,
    targetScore: 6,
    lastBatida: null,
    log: room.state ? room.state.log : [],
  };
  broadcastLog(room, `Nova mão. ${room.seats[seat].name || "Jogador " + seat} abre com a maior carroça.`);
  broadcastState(room);
  dominoMaybeAI(room);
}

function dominoMaybeAI(room) {
  const s = room.state;
  if (s.phase !== "playing") return;
  if (!room.seats[s.turnIdx].isAI) return;
  setTimeout(() => {
    if (!room.state || room.state.phase !== "playing") return;
    const hand = s.hands[s.turnIdx];
    const options = [];
    for (const t of hand) {
      for (const side of DR.legalSides(t, s.board)) options.push({ tile: t, side });
    }
    if (options.length === 0) return dominoApplyPass(room, s.turnIdx);
    options.sort((a, b) => (b.tile.a + b.tile.b) - (a.tile.a + a.tile.b));
    const choice = options[0];
    dominoApplyPlay(room, s.turnIdx, choice.tile.id, choice.side);
  }, 800 + Math.random() * 500);
}

function dominoApplyPlay(room, idx, tileId, side) {
  const s = room.state;
  const hand = s.hands[idx];
  const tileIdx = hand.findIndex((t) => t.id === tileId);
  if (tileIdx === -1) return;
  const tile = hand[tileIdx];
  const sides = DR.legalSides(tile, s.board);
  if (!sides.includes(side)) return;
  DR.applyMove(s.board, tile, side);
  s.board._lastPlayed = tile;
  hand.splice(tileIdx, 1);
  s.passStreak = 0;
  broadcastLog(room, `${room.seats[idx].name || "Jogador " + idx} jogou ${tile.a}-${tile.b} (${side === "left" ? "esquerda" : "direita"}).`);

  if (hand.length === 0) {
    const result = DR.scoreBatida(s.board, idx);
    finishDominoHand(room, result, `${room.seats[idx].name || "Jogador " + idx} bateu!`);
    return;
  }
  s.turnIdx = (idx + 1) % 4;
  broadcastState(room);
  dominoMaybeAI(room);
}

function dominoApplyPass(room, idx) {
  const s = room.state;
  s.passStreak++;
  broadcastLog(room, `${room.seats[idx].name || "Jogador " + idx} passou.`);
  if (s.passStreak >= 4) {
    const result = DR.scoreBlocked(s.board, s.hands);
    finishDominoHand(room, result, "Jogo trancado — ninguém consegue jogar.");
    return;
  }
  s.turnIdx = (idx + 1) % 4;
  broadcastState(room);
  dominoMaybeAI(room);
}

function finishDominoHand(room, result, headline) {
  const s = room.state;
  const label = DR.BATIDA_LABELS[result.type] || result.type;
  if (result.winningTeam === -1) {
    broadcastLog(room, `${headline} Empate de pontos — mão redistribuída sem pontuar.`);
    broadcastState(room);
    setTimeout(() => dominoDeal(room, s.teamScores), 1500);
    return;
  }
  s.teamScores[result.winningTeam] += result.points;
  s.lastBatida = { ...result, label };
  broadcastLog(room, `${headline} ${label} — Dupla ${result.winningTeam === 0 ? "0/2" : "1/3"} marca ${result.points} ponto(s). Placar: ${s.teamScores[0]} x ${s.teamScores[1]}.`);
  if (s.teamScores[result.winningTeam] >= s.targetScore) {
    s.phase = "matchEnd";
    broadcastLog(room, `Dupla ${result.winningTeam === 0 ? "0/2" : "1/3"} venceu a partida!`);
    broadcastState(room);
    return;
  }
  s.phase = "handEnd";
  broadcastState(room);
  setTimeout(() => dominoDeal(room, s.teamScores), 2200);
}

/* ============================================================
   Connection / room handling
   ============================================================ */
function findOpenSeat(room) { return room.seats.findIndex((s) => !s.ws && !s.isAI); }

function fillWithAI(room) {
  room.seats.forEach((s, i) => {
    if (!s.ws) { s.isAI = true; s.name = s.name || `IA ${i + 1}`; }
  });
}

function startRoom(room) {
  if (room.started) return;
  fillWithAI(room);
  room.started = true;
  if (room.game === "landlord") landlordDeal(room);
  else dominoDeal(room);
}

function handleJoin(ws, msg) {
  const game = msg.game === "domino" ? "domino" : "landlord";
  const code = String(msg.room || "SALA").trim().slice(0, 12) || "SALA";
  const key = roomKey(game, code);
  let room = rooms.get(key);
  if (!room) { room = makeRoom(game, code); rooms.set(key, room); }
  if (room.started) { send(ws, { type: "error", message: "Essa sala já começou. Crie/entre em outra." }); return; }
  const seatIdx = findOpenSeat(room);
  if (seatIdx === -1) { send(ws, { type: "error", message: "Sala cheia." }); return; }
  room.seats[seatIdx] = { ws, name: (msg.name || `Jogador ${seatIdx + 1}`).slice(0, 20), isAI: false };
  ws.roomKey = key;
  ws.seatIdx = seatIdx;
  send(ws, { type: "joined", game, room: code, seatIdx, seatsTotal: room.seats.length });
  room.state = room.state || { log: [] };
  broadcastLog(room, `${room.seats[seatIdx].name} entrou na sala (assento ${seatIdx + 1}).`);
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
  if (room.started) {
    seat.isAI = true; // AI takes over so the game keeps going
    broadcastLog(room, `${name} desconectou — a IA assumiu o assento.`);
  } else {
    room.seats[ws.seatIdx] = { ws: null, name: null, isAI: false };
    broadcastLog(room, `${name} saiu da sala.`);
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

    if (msg.type === "startWithAI") return startRoom(room);

    if (msg.type === "newHand") {
      if (room.game === "landlord" && (room.state.phase === "roundEnd")) landlordDeal(room);
      if (room.game === "domino" && room.state.phase === "matchEnd") dominoDeal(room);
      return;
    }

    if (room.game === "landlord") {
      const s = room.state;
      if (!s || s.phase === undefined) return;
      if (msg.type === "bid") {
        if (s.phase !== "bidding" || s.biddingOrder[s.biddingStep] !== seatIdx) return;
        let bid = Number(msg.value);
        if (![0, 1, 2, 3].includes(bid) || (bid !== 0 && bid <= s.highestBid)) bid = 0;
        return landlordRegisterBid(room, seatIdx, bid);
      }
      if (msg.type === "play") {
        if (s.phase !== "playing" || s.turnIdx !== seatIdx) return;
        const hand = s.players[seatIdx].hand;
        const cards = hand.filter((c) => (msg.uids || []).includes(c.uid));
        const combo = LR.analyzeCombo(cards);
        if (!combo) return send(ws, { type: "error", message: "Combinação inválida." });
        if (s.currentTrick && s.currentTrick.ownerIdx !== seatIdx && !LR.compareCombo(combo, s.currentTrick.combo)) {
          return send(ws, { type: "error", message: "Sua jogada não supera a atual." });
        }
        return landlordApplyPlay(room, seatIdx, combo);
      }
      if (msg.type === "pass") {
        if (s.phase !== "playing" || s.turnIdx !== seatIdx) return;
        if (s.currentTrick === null || s.currentTrick.ownerIdx === seatIdx) {
          return send(ws, { type: "error", message: "Você está liderando, precisa jogar." });
        }
        return landlordApplyPass(room, seatIdx);
      }
    }

    if (room.game === "domino") {
      const s = room.state;
      if (!s || s.phase === undefined) return;
      if (msg.type === "playDomino") {
        if (s.phase !== "playing" || s.turnIdx !== seatIdx) return;
        return dominoApplyPlay(room, seatIdx, msg.tileId, msg.side);
      }
      if (msg.type === "passDomino") {
        if (s.phase !== "playing" || s.turnIdx !== seatIdx) return;
        const hand = s.hands[seatIdx];
        if (DR.hasAnyLegalMove(hand, s.board)) {
          return send(ws, { type: "error", message: "Você tem jogada legal disponível." });
        }
        return dominoApplyPass(room, seatIdx);
      }
    }
  });

  ws.on("close", () => handleDisconnect(ws));
});

server.listen(PORT, () => {
  console.log(`Landlord & Dominó multiplayer server listening on :${PORT}`);
});
