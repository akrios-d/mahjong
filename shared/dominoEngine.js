"use strict";
/* Dominó em Duplas orchestration: deal/play/pass + AI turns + scoring.
   Isomorphic — see shared/landlordEngine.js for the room/hooks contract. */
(function (root) {
  const DR = typeof module !== "undefined" && module.exports ? require("./dominoRules.js") : root.DominoRules;
  const RU = typeof module !== "undefined" && module.exports ? require("./roomUtils.js") : root.RoomUtils;

  function update(room) { room.hooks.update(); }
  function log(room, text) { RU.pushLog(room, text); }

  function viewFor(room, seatIdx) {
    const base = RU.viewBase(room, seatIdx);
    if (!room.started) return base;
    const s = room.state;
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

  function deal(room, keepScores) {
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
    log(room, `Nova mão. ${room.seats[seat].name || "Jogador " + seat} abre com a maior carroça.`);
    update(room);
    maybeAI(room);
  }

  function maybeAI(room) {
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
      if (options.length === 0) return applyPass(room, s.turnIdx);
      options.sort((a, b) => (b.tile.a + b.tile.b) - (a.tile.a + a.tile.b));
      const choice = options[0];
      applyPlay(room, s.turnIdx, choice.tile.id, choice.side);
    }, 800 + Math.random() * 500);
  }

  function applyPlay(room, idx, tileId, side) {
    const s = room.state;
    const hand = s.hands[idx];
    const tileIdx = hand.findIndex((t) => t.id === tileId);
    if (tileIdx === -1) return { ok: false, error: "Peça não encontrada." };
    const tile = hand[tileIdx];
    const sides = DR.legalSides(tile, s.board);
    if (!sides.includes(side)) return { ok: false, error: "Lado inválido para essa peça." };
    const endsBefore = { left: s.board.leftEnd, right: s.board.rightEnd };
    DR.applyMove(s.board, tile, side);
    s.board._lastPlayed = tile;
    hand.splice(tileIdx, 1);
    s.passStreak = 0;
    log(room, `${room.seats[idx].name || "Jogador " + idx} jogou ${tile.a}-${tile.b} (${side === "left" ? "esquerda" : "direita"}).`);

    if (hand.length === 0) {
      const result = DR.scoreBatida(s.board, idx, endsBefore);
      finishHand(room, result, `${room.seats[idx].name || "Jogador " + idx} bateu!`);
      return { ok: true };
    }
    s.turnIdx = (idx + 1) % 4;
    update(room);
    maybeAI(room);
    return { ok: true };
  }

  function applyPass(room, idx) {
    const s = room.state;
    s.passStreak++;
    log(room, `${room.seats[idx].name || "Jogador " + idx} passou.`);
    if (s.passStreak >= 4) {
      const result = DR.scoreBlocked(s.board, s.hands);
      finishHand(room, result, "Jogo trancado — ninguém consegue jogar.");
      return;
    }
    s.turnIdx = (idx + 1) % 4;
    update(room);
    maybeAI(room);
  }

  function finishHand(room, result, headline) {
    const s = room.state;
    const label = DR.BATIDA_LABELS[result.type] || result.type;
    if (result.winningTeam === -1) {
      log(room, `${headline} Empate de pontos — mão redistribuída sem pontuar.`);
      update(room);
      setTimeout(() => deal(room, s.teamScores), 1500);
      return;
    }
    s.teamScores[result.winningTeam] += result.points;
    s.lastBatida = { ...result, label };
    log(room, `${headline} ${label} — Dupla ${result.winningTeam === 0 ? "0/2" : "1/3"} marca ${result.points} ponto(s). Placar: ${s.teamScores[0]} x ${s.teamScores[1]}.`);
    if (s.teamScores[result.winningTeam] >= s.targetScore) {
      s.phase = "matchEnd";
      log(room, `Dupla ${result.winningTeam === 0 ? "0/2" : "1/3"} venceu a partida!`);
      update(room);
      return;
    }
    s.phase = "handEnd";
    update(room);
    setTimeout(() => deal(room, s.teamScores), 2200);
  }

  /* ---- validated entry points ---- */
  function submitPlay(room, seatIdx, tileId, side) {
    const s = room.state;
    if (s.phase !== "playing" || s.turnIdx !== seatIdx) return { ok: false, error: "Não é sua vez." };
    return applyPlay(room, seatIdx, tileId, side);
  }

  function submitPass(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "playing" || s.turnIdx !== seatIdx) return { ok: false, error: "Não é sua vez." };
    const hand = s.hands[seatIdx];
    if (DR.hasAnyLegalMove(hand, s.board)) return { ok: false, error: "Você tem jogada legal disponível." };
    applyPass(room, seatIdx);
    return { ok: true };
  }

  function requestNewHand(room) {
    if (room.state && room.state.phase === "matchEnd") deal(room);
  }

  const api = { viewFor, deal, submitPlay, submitPass, requestNewHand };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.DominoEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
