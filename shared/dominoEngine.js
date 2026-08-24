"use strict";
/* Dominó em Duplas orchestration: deal/play/pass + AI turns + scoring.
   Isomorphic — see shared/landlordEngine.js for the room/hooks contract. */
(function (root) {
  const DR = typeof module !== "undefined" && module.exports ? require("./dominoRules.js") : root.DominoRules;
  const RU = typeof module !== "undefined" && module.exports ? require("./roomUtils.js") : root.RoomUtils;

  function update(room) { room.hooks.update(); }
  function log(room, key, params) { RU.pushLog(room, key, params); }

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
      pendingHandEnd: s.pendingHandEnd || null,
    };
  }

  function deal(room, keepScores, forcedStarter) {
    const { hands, morto } = DR.dealDomino();
    const seat = typeof forcedStarter === "number" ? forcedStarter : DR.findStarter(hands).seat;
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
      pendingHandEnd: null,
      log: room.state ? room.state.log : [],
    };
    if (typeof forcedStarter === "number") log(room, "domino.log.newHandChosen", { name: room.seats[seat].name || `Jogador ${seat}` });
    else log(room, "domino.log.newHand", { name: room.seats[seat].name || `Jogador ${seat}` });
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
    if (tileIdx === -1) return { ok: false, error: "domino.err.tileNotFound" };
    const tile = hand[tileIdx];
    const sides = DR.legalSides(tile, s.board);
    if (!sides.includes(side)) return { ok: false, error: "domino.err.invalidSide" };
    const endsBefore = { left: s.board.leftEnd, right: s.board.rightEnd };
    DR.applyMove(s.board, tile, side);
    s.board._lastPlayed = tile;
    hand.splice(tileIdx, 1);
    s.passStreak = 0;
    const name = room.seats[idx].name || `Jogador ${idx}`;
    log(room, "domino.log.played", { name, a: tile.a, b: tile.b, side });

    if (hand.length === 0) {
      const result = DR.scoreBatida(s.board, idx, endsBefore);
      finishHand(room, result, "domino.log.batidaHeadline", { name }, idx);
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
    log(room, "domino.log.passed", { name: room.seats[idx].name || `Jogador ${idx}` });
    if (s.passStreak >= 4) {
      const result = DR.scoreBlocked(s.board, s.hands);
      finishHand(room, result, "domino.log.blockedHeadline", null, null);
      return;
    }
    s.turnIdx = (idx + 1) % 4;
    update(room);
    maybeAI(room);
  }

  function teammateSeats(team) {
    const seats = [];
    for (let i = 0; i < 4; i++) if (DR.teamOf(i) === team) seats.push(i);
    return seats;
  }

  function finishHand(room, result, headlineKey, headlineParams, winnerSeat) {
    const s = room.state;
    log(room, headlineKey, headlineParams);
    if (result.winningTeam === -1) {
      log(room, "domino.log.tieRedeal");
      s.phase = "handEnd";
      s.pendingHandEnd = { tie: true };
      update(room);
      return;
    }
    s.teamScores[result.winningTeam] += result.points;
    s.lastBatida = { type: result.type, points: result.points, winningTeam: result.winningTeam };
    log(room, "domino.log.teamScored", { team: result.winningTeam, batidaType: result.type, points: result.points, scoreA: s.teamScores[0], scoreB: s.teamScores[1] });
    if (s.teamScores[result.winningTeam] >= s.targetScore) {
      s.phase = "matchEnd";
      log(room, "domino.log.matchWon", { team: result.winningTeam });
      update(room);
      return;
    }
    s.phase = "handEnd";
    // The winning team always votes on who starts next, whether the win
    // was a clean batida (single known winner) or a blocked-board tie
    // decided by pip count (no single winner). If they can't agree after
    // 3 tries, whoever won this hand (or the lower-numbered teammate, for
    // a blocked hand with no individual winner) starts by default.
    const teammates = teammateSeats(result.winningTeam);
    const fallbackSeat = typeof winnerSeat === "number" ? winnerSeat : teammates[0];
    s.pendingHandEnd = {
      needsTeamPick: true, winningTeam: result.winningTeam, teammates,
      picks: {}, agreedStarter: null, attempts: 0, fallbackSeat,
    };
    scheduleAIStarterPicks(room);
    update(room);
  }

  // AI always proposes the lower-numbered teammate seat — deterministic, so
  // two AI teammates auto-agree; a human teammate can still match it (or the
  // AI's fixed proposal effectively lets the human decide by picking the same).
  function scheduleAIStarterPicks(room) {
    const pendingRef = room.state.pendingHandEnd;
    pendingRef.teammates.forEach((seatIdx) => {
      if (!room.seats[seatIdx] || !room.seats[seatIdx].isAI) return;
      setTimeout(() => {
        const s = room.state;
        if (!s || s.pendingHandEnd !== pendingRef || pendingRef.agreedStarter != null) return;
        submitPickStarter(room, seatIdx, pendingRef.teammates[0]);
      }, 600 + Math.random() * 400);
    });
  }

  /* ---- validated entry points ---- */
  function submitPlay(room, seatIdx, tileId, side) {
    const s = room.state;
    if (s.phase !== "playing" || s.turnIdx !== seatIdx) return { ok: false, error: "common.err.notYourTurn" };
    return applyPlay(room, seatIdx, tileId, side);
  }

  function submitPass(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "playing" || s.turnIdx !== seatIdx) return { ok: false, error: "common.err.notYourTurn" };
    const hand = s.hands[seatIdx];
    if (DR.hasAnyLegalMove(hand, s.board)) return { ok: false, error: "domino.err.hasLegalMove" };
    applyPass(room, seatIdx);
    return { ok: true };
  }

  function submitPickStarter(room, seatIdx, chosenSeat) {
    const s = room.state;
    if (!s || s.phase !== "handEnd" || !s.pendingHandEnd || !s.pendingHandEnd.needsTeamPick) {
      return { ok: false, error: "domino.err.noPendingPick" };
    }
    const p = s.pendingHandEnd;
    if (!p.teammates.includes(seatIdx)) return { ok: false, error: "domino.err.notOnWinningTeam" };
    if (!p.teammates.includes(chosenSeat)) return { ok: false, error: "domino.err.invalidStarterChoice" };
    if (p.agreedStarter != null) return { ok: true }; // already settled, ignore late picks
    p.picks[seatIdx] = chosenSeat;
    const [a, b] = p.teammates;
    if (Object.prototype.hasOwnProperty.call(p.picks, a) && Object.prototype.hasOwnProperty.call(p.picks, b)) {
      if (p.picks[a] === p.picks[b]) {
        p.agreedStarter = p.picks[a];
      } else {
        p.attempts++;
        if (p.attempts >= 3) {
          p.agreedStarter = p.fallbackSeat;
          p.autoDecided = true;
        } else {
          p.picks = {};
          scheduleAIStarterPicks(room);
        }
      }
    }
    update(room);
    return { ok: true };
  }

  function requestNewHand(room) {
    const s = room.state;
    if (!s) return;
    if (s.phase === "matchEnd") { deal(room); return; }
    if (s.phase !== "handEnd" || !s.pendingHandEnd) return;
    const p = s.pendingHandEnd;
    if (p.tie) { deal(room, s.teamScores); return; }
    if (p.needsTeamPick) {
      if (p.agreedStarter == null) return;
      deal(room, s.teamScores, p.agreedStarter);
      return;
    }
    deal(room, s.teamScores, p.nextStarterSeat);
  }

  const api = { viewFor, deal, submitPlay, submitPass, submitPickStarter, requestNewHand };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.DominoEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
