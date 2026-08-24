"use strict";
/* Landlord (Dou Dizhu) orchestration: deal/bid/play/pass + AI turns.
   Isomorphic — used by the WS server (room.hooks.update() broadcasts to
   sockets) and by the offline local-play mode (room.hooks.update() just
   re-renders the page). Depends on shared/landlordRules.js and
   shared/roomUtils.js being loaded first. */
(function (root) {
  const LR = typeof module !== "undefined" && module.exports ? require("./landlordRules.js") : root.LandlordRules;
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
      landlordIdx: s.landlordIdx,
      highestBid: s.highestBid,
      currentBidderIdx: s.phase === "bidding" ? s.biddingOrder[s.biddingStep] : -1,
      kittyRevealed: s.landlordIdx !== -1,
      kitty: s.landlordIdx !== -1 ? s.kitty : s.kitty.map(() => null),
      hand: s.players[seatIdx].hand,
      handCounts: s.players.map((p) => p.hand.length),
      isLandlord: s.players.map((p) => p.isLandlord),
      lastPlays: s.lastPlays,
      currentTrick: s.currentTrick
        ? { type: s.currentTrick.combo.type, length: s.currentTrick.combo.length, mainRank: s.currentTrick.combo.mainRank, ownerIdx: s.currentTrick.ownerIdx }
        : null,
      winnerIdx: s.winnerIdx ?? null,
    };
  }

  function deal(room) {
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
    log(room, "Nova mão distribuída. Rodada de lances iniciada.");
    advanceBidding(room);
  }

  function advanceBidding(room) {
    const s = room.state;
    if (s.biddingStep >= 3) return finishBidding(room);
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
        registerBid(room, idx, bid);
      }, 700 + Math.random() * 400);
    } else {
      update(room);
    }
  }

  function registerBid(room, idx, bid) {
    const s = room.state;
    if (bid > s.highestBid) { s.highestBid = bid; s.highestBidder = idx; }
    s.biddingStep++;
    log(room, bid === 0 ? `${s.players[idx].name} passou o lance.` : `${s.players[idx].name} deu lance ${bid}.`);
    if (s.highestBid === 3) return finishBidding(room);
    advanceBidding(room);
  }

  function finishBidding(room) {
    const s = room.state;
    if (s.highestBidder === -1) {
      log(room, "Ninguém deu lance. Redistribuindo...");
      update(room);
      setTimeout(() => deal(room), 1200);
      return;
    }
    s.landlordIdx = s.highestBidder;
    s.players[s.landlordIdx].isLandlord = true;
    s.players[s.landlordIdx].hand.push(...s.kitty);
    s.players[s.landlordIdx].hand.sort((a, b) => a.value - b.value);
    s.phase = "playing";
    s.turnIdx = s.landlordIdx;
    log(room, `${s.players[s.landlordIdx].name} é o Landlord e recebeu as 3 cartas do monte.`);
    update(room);
    maybeAI(room);
  }

  function maybeAI(room) {
    const s = room.state;
    if (s.phase !== "playing") return;
    if (!room.seats[s.turnIdx].isAI) return;
    setTimeout(() => {
      if (!room.state || room.state.phase !== "playing") return;
      const hand = s.players[s.turnIdx].hand;
      let combo;
      if (s.currentTrick === null || s.currentTrick.ownerIdx === s.turnIdx) combo = LR.aiChooseLead(hand);
      else combo = LR.aiChooseFollow(hand, s.currentTrick.combo);
      if (combo) applyPlay(room, s.turnIdx, combo);
      else applyPass(room, s.turnIdx);
    }, 800 + Math.random() * 500);
  }

  function applyPlay(room, idx, combo) {
    const s = room.state;
    const uids = new Set(combo.cards.map((c) => c.uid));
    s.players[idx].hand = s.players[idx].hand.filter((c) => !uids.has(c.uid));
    s.currentTrick = { combo, ownerIdx: idx };
    s.passStreak = 0;
    s.lastPlays[idx] = combo;
    log(room, `${s.players[idx].name} jogou ${LR.comboLabel(combo)} (${combo.cards.map(LR.cardLabel).join(" ")}).`);
    if (s.players[idx].hand.length === 0) {
      s.phase = "roundEnd";
      s.winnerIdx = idx;
      log(room, `${s.players[idx].name} venceu a mão!`);
      update(room);
      return;
    }
    s.turnIdx = (idx + 1) % 3;
    update(room);
    maybeAI(room);
  }

  function applyPass(room, idx) {
    const s = room.state;
    s.passStreak++;
    s.lastPlays[idx] = null;
    log(room, `${s.players[idx].name} passou.`);
    if (s.passStreak >= 2) { s.currentTrick = null; s.passStreak = 0; }
    s.turnIdx = (idx + 1) % 3;
    update(room);
    maybeAI(room);
  }

  /* ---- validated entry points used by both the server's message handler
     and the local-play transport ---- */
  function submitBid(room, seatIdx, value) {
    const s = room.state;
    if (s.phase !== "bidding" || s.biddingOrder[s.biddingStep] !== seatIdx) return { ok: false, error: "Não é sua vez de dar lance." };
    let bid = Number(value);
    if (![0, 1, 2, 3].includes(bid) || (bid !== 0 && bid <= s.highestBid)) bid = 0;
    registerBid(room, seatIdx, bid);
    return { ok: true };
  }

  function submitPlay(room, seatIdx, uids) {
    const s = room.state;
    if (s.phase !== "playing" || s.turnIdx !== seatIdx) return { ok: false, error: "Não é sua vez." };
    const hand = s.players[seatIdx].hand;
    const cards = hand.filter((c) => (uids || []).includes(c.uid));
    const combo = LR.analyzeCombo(cards);
    if (!combo) return { ok: false, error: "Combinação inválida." };
    if (s.currentTrick && s.currentTrick.ownerIdx !== seatIdx && !LR.compareCombo(combo, s.currentTrick.combo)) {
      return { ok: false, error: "Sua jogada não supera a atual." };
    }
    applyPlay(room, seatIdx, combo);
    return { ok: true };
  }

  function submitPass(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "playing" || s.turnIdx !== seatIdx) return { ok: false, error: "Não é sua vez." };
    if (s.currentTrick === null || s.currentTrick.ownerIdx === seatIdx) {
      return { ok: false, error: "Você está liderando, precisa jogar." };
    }
    applyPass(room, seatIdx);
    return { ok: true };
  }

  function requestNewHand(room) {
    if (room.state && room.state.phase === "roundEnd") deal(room);
  }

  const api = { viewFor, deal, submitBid, submitPlay, submitPass, requestNewHand };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.LandlordEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
