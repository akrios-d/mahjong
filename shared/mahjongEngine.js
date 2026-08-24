"use strict";
/* Mahjong (Where Winds Meet / Sichuan-style) orchestration: deal, missing
   suit selection, draw/discard turn loop, Pong/Kong/Chi claim windows,
   win detection. 4 players. Isomorphic — see shared/landlordEngine.js for
   the room/hooks contract.

   Documented simplifications (see README): no fan/scoring multipliers
   (first Hu just wins the hand), no "rob the kong" or "added kong"
   (upgrading an existing Pong) — only concealed self-kong and open
   claimed-kong are supported, AI never claims Chi (only humans can). */
(function (root) {
  const MR = typeof module !== "undefined" && module.exports ? require("./mahjongRules.js") : root.MahjongRules;
  const RU = typeof module !== "undefined" && module.exports ? require("./roomUtils.js") : root.RoomUtils;

  const SEAT_COUNT = 4;

  function update(room) { room.hooks.update(); }
  function log(room, key, params) { RU.pushLog(room, key, params); }

  function revealedGroupCount(player) { return player.revealed.length; }

  function viewFor(room, seatIdx) {
    const base = RU.viewBase(room, seatIdx);
    if (!room.started) return base;
    const s = room.state;
    const revealMissingSuit = s.phase === "roundEnd";
    const players = s.players.map((p, i) => ({
      name: p.name,
      hasChosenMissingSuit: !!p.missingSuit,
      missingSuit: i === seatIdx || revealMissingSuit ? p.missingSuit : null,
      handCount: p.hand.length,
      revealed: p.revealed,
      hand: i === seatIdx ? MR.sortHand(p.hand) : undefined,
    }));
    return {
      ...base,
      phase: s.phase,
      dealerIdx: s.dealerIdx,
      roundNumber: s.roundNumber,
      turnIdx: s.turnIdx,
      awaitingDiscard: s.awaitingDiscard,
      wallCount: s.wall.length,
      discardPile: s.discardPile,
      players,
      pendingClaim: s.pendingClaim
        ? {
            tile: s.pendingClaim.tile,
            fromSeat: s.pendingClaim.fromSeat,
            youEligible: !!s.pendingClaim.eligible.find((e) => e.seatIdx === seatIdx),
            youOptions: (s.pendingClaim.eligible.find((e) => e.seatIdx === seatIdx) || null),
            youResponded: Object.prototype.hasOwnProperty.call(s.pendingClaim.responses, seatIdx),
          }
        : null,
      chips: s.chips,
      activeSeats: s.activeSeats,
      winners: s.winners,
    };
  }

  function init(room) {
    const wall = MR.shuffle(MR.buildDeck());
    const players = Array.from({ length: SEAT_COUNT }, (_, i) => ({
      hand: [],
      missingSuit: null,
      revealed: [],
      name: room.seats[i].name || `Bot ${i}`,
    }));
    for (let round = 0; round < 13; round++) {
      for (let i = 0; i < SEAT_COUNT; i++) players[i].hand.push(wall.pop());
    }
    const prevDealerIdx = room.state && typeof room.state.dealerIdx === "number" ? room.state.dealerIdx : 0;
    const prevRoundNumber = room.state && typeof room.state.roundNumber === "number" ? room.state.roundNumber : 0;
    const prevChips = room.state && room.state.chips ? room.state.chips : [100, 100, 100, 100];
    room.state = {
      phase: "missingSuit",
      players, wall, discardPile: [],
      dealerIdx: prevDealerIdx,
      roundNumber: prevRoundNumber + 1,
      turnIdx: prevDealerIdx,
      awaitingDiscard: null,
      pendingClaim: null,
      chips: prevChips,
      activeSeats: [true, true, true, true],
      winners: [],
      log: room.state ? room.state.log : [],
    };
    log(room, "mahjong.log.dealt", { round: room.state.roundNumber });
    update(room);
    // AI picks its missing suit immediately.
    room.seats.forEach((seat, i) => {
      if (seat.isAI) submitMissingSuit(room, i, MR.suggestMissingSuit(room.state.players[i].hand));
    });
  }

  function submitMissingSuit(room, seatIdx, suit) {
    const s = room.state;
    if (s.phase !== "missingSuit") return { ok: false, error: "mahjong.err.wrongPhase" };
    if (!MR.SUITS.includes(suit)) return { ok: false, error: "mahjong.err.invalidSuit" };
    s.players[seatIdx].missingSuit = suit;
    log(room, "mahjong.log.chosenMissingSuit", { name: s.players[seatIdx].name, suit });
    if (s.players.every((p) => p.missingSuit)) startPlay(room);
    else update(room);
    return { ok: true };
  }

  function startPlay(room) {
    const s = room.state;
    s.phase = "playing";
    s.turnIdx = s.dealerIdx;
    log(room, "mahjong.log.dealerDraws", { name: s.players[s.dealerIdx].name });
    drawForSeat(room, s.dealerIdx);
  }

  function drawForSeat(room, seatIdx) {
    const s = room.state;
    s.turnCount = (s.turnCount || 0) + 1;
    if (s.turnCount > 500) return endRoundDraw(room); // safety valve against pathological claim cycles
    if (s.wall.length === 0) return endRoundDraw(room);
    const tile = s.wall.pop();
    s.players[seatIdx].hand.push(tile);
    s.awaitingDiscard = seatIdx;
    update(room);
    maybeAIDiscard(room, seatIdx);
  }

  function maybeAIDiscard(room, seatIdx) {
    if (!room.seats[seatIdx].isAI) return;
    setTimeout(() => {
      const s = room.state;
      if (!s || s.phase !== "playing" || s.awaitingDiscard !== seatIdx) return;
      const player = s.players[seatIdx];
      if (MR.isWinningHand(player.hand, revealedGroupCount(player), player.missingSuit)) {
        submitSelfHu(room, seatIdx);
        return;
      }
      const tile = aiChooseDiscard(player.hand, player.missingSuit);
      submitDiscard(room, seatIdx, tile.uid);
    }, 700 + Math.random() * 500);
  }

  function aiChooseDiscard(hand, missingSuit) {
    const inMissing = hand.filter((t) => t.suit === missingSuit);
    if (inMissing.length) return inMissing[0];
    let worst = hand[0], worstScore = Infinity;
    for (const t of hand) {
      const score = hand.filter((o) => o.uid !== t.uid && o.suit === t.suit && Math.abs(o.value - t.value) <= 2).length;
      if (score < worstScore) { worstScore = score; worst = t; }
    }
    return worst;
  }

  // Kong pays out immediately (unlike Pong, which only feeds into the
  // final multiplier when that hand is later Hu'd). A concealed kong is
  // "paid for" by everyone still in the hand (KONG_FEE each); a kong
  // claimed off one specific player's discard is paid entirely by that
  // player at 3x the fee — both moves the same total (3 * KONG_FEE).
  const KONG_FEE = 2;
  function applyKongPayment(room, kongSeatIdx, concealed, fromSeat) {
    const s = room.state;
    if (concealed) {
      for (let i = 0; i < SEAT_COUNT; i++) {
        if (i === kongSeatIdx || !s.activeSeats[i]) continue;
        s.chips[i] -= KONG_FEE;
        s.chips[kongSeatIdx] += KONG_FEE;
      }
      log(room, "mahjong.log.kongPayment", { name: s.players[kongSeatIdx].name, amount: KONG_FEE * 3 });
    } else {
      const amount = KONG_FEE * 3;
      s.chips[fromSeat] -= amount;
      s.chips[kongSeatIdx] += amount;
      log(room, "mahjong.log.kongPaymentFrom", { name: s.players[kongSeatIdx].name, from: s.players[fromSeat].name, amount });
    }
  }

  function submitSelfKong(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "playing" || s.awaitingDiscard !== seatIdx) return { ok: false, error: "common.err.notYourTurn" };
    const player = s.players[seatIdx];
    const kong = MR.hasConcealedKong(player.hand);
    if (!kong) return { ok: false, error: "mahjong.err.noConcealedKong" };
    if (s.wall.length === 0) return { ok: false, error: "mahjong.err.kongEmptyWall" };
    player.hand = player.hand.filter((t) => !(t.suit === kong.suit && t.value === kong.value));
    player.revealed.push({ type: "kong", concealed: true, suit: kong.suit, value: kong.value, claimedFrom: null });
    log(room, "mahjong.log.selfKong", { name: player.name, value: kong.value, suit: kong.suit });
    applyKongPayment(room, seatIdx, true, null);
    drawForSeat(room, seatIdx);
    return { ok: true };
  }

  function submitSelfHu(room, seatIdx) {
    const s = room.state;
    if (s.phase !== "playing" || s.awaitingDiscard !== seatIdx) return { ok: false, error: "common.err.notYourTurn" };
    const player = s.players[seatIdx];
    if (!MR.isWinningHand(player.hand, revealedGroupCount(player), player.missingSuit)) {
      return { ok: false, error: "mahjong.err.notWinning" };
    }
    applyWin(room, seatIdx, "zimo", null);
    return { ok: true };
  }

  function submitDiscard(room, seatIdx, uid) {
    const s = room.state;
    if (s.phase !== "playing" || s.awaitingDiscard !== seatIdx) return { ok: false, error: "common.err.notYourTurn" };
    const player = s.players[seatIdx];
    const idx = player.hand.findIndex((t) => t.uid === uid);
    if (idx === -1) return { ok: false, error: "mahjong.err.tileNotInHand" };
    const tile = player.hand.splice(idx, 1)[0];
    s.discardPile.push({ tile, fromSeat: seatIdx });
    s.awaitingDiscard = null;
    log(room, "mahjong.log.discarded", { name: player.name, value: tile.value, suit: tile.suit });

    const eligible = computeClaimEligibility(room, seatIdx, tile);
    if (eligible.length === 0) {
      update(room);
      advanceTurn(room, seatIdx);
      return { ok: true };
    }
    s.pendingClaim = { tile, fromSeat: seatIdx, eligible, responses: {} };
    update(room);
    eligible.forEach((e) => { if (room.seats[e.seatIdx].isAI) scheduleAIClaim(room, e); });
    return { ok: true };
  }

  // Loops to the next still-active (hasn't already won this hand) seat —
  // once someone Hu's in a blood-battle hand they step out and the turn
  // order simply skips over their seat for the rest of the hand.
  function nextActiveSeat(room, fromSeat) {
    const s = room.state;
    let i = fromSeat;
    for (let n = 0; n < SEAT_COUNT; n++) {
      i = (i + 1) % SEAT_COUNT;
      if (s.activeSeats[i]) return i;
    }
    return fromSeat; // shouldn't happen — hand ends before this can occur
  }

  function computeClaimEligibility(room, fromSeat, tile) {
    const s = room.state;
    const eligible = [];
    const chiSeat = nextActiveSeat(room, fromSeat);
    for (let i = 0; i < SEAT_COUNT; i++) {
      if (i === fromSeat || !s.activeSeats[i]) continue;
      const player = s.players[i];
      const canHu = MR.isWinningHand([...player.hand, tile], revealedGroupCount(player), player.missingSuit);
      const canKong = s.wall.length > 0 && MR.hasKongFromHand(player.hand, tile);
      const canPong = MR.hasPong(player.hand, tile);
      const canChi = i === chiSeat ? MR.chiOptions(player.hand, tile) : [];
      if (canHu || canKong || canPong || canChi.length) {
        eligible.push({ seatIdx: i, canHu, canKong, canPong, canChi });
      }
    }
    return eligible;
  }

  function scheduleAIClaim(room, entry) {
    const claimRef = room.state.pendingClaim;
    setTimeout(() => {
      const s = room.state;
      if (!s || s.pendingClaim !== claimRef) return;
      if (Object.prototype.hasOwnProperty.call(s.pendingClaim.responses, entry.seatIdx)) return;
      // AI intentionally doesn't auto-claim every Pong (the doc itself warns
      // that's often a mistake) — this also keeps games from dragging on
      // forever with 4 overly-greedy bots endlessly trading the same tiles.
      let action = "pass";
      if (entry.canHu) action = "hu";
      else if (entry.canKong) action = "kong";
      else if (entry.canPong && Math.random() < 0.4) action = "pong";
      submitClaimResponse(room, entry.seatIdx, action, null);
    }, 500 + Math.random() * 700);
  }

  function submitClaimResponse(room, seatIdx, action, chiOption) {
    const s = room.state;
    if (!s.pendingClaim) return { ok: false, error: "mahjong.err.noPendingClaim" };
    const entry = s.pendingClaim.eligible.find((e) => e.seatIdx === seatIdx);
    if (!entry) return { ok: false, error: "mahjong.err.cannotReact" };
    if (Object.prototype.hasOwnProperty.call(s.pendingClaim.responses, seatIdx)) return { ok: false, error: "mahjong.err.alreadyResponded" };
    if (action === "hu" && !entry.canHu) return { ok: false, error: "mahjong.err.cannotHu" };
    if (action === "kong" && !entry.canKong) return { ok: false, error: "mahjong.err.cannotKong" };
    if (action === "pong" && !entry.canPong) return { ok: false, error: "mahjong.err.cannotPong" };
    if (action === "chi" && !entry.canChi.length) return { ok: false, error: "mahjong.err.cannotChi" };
    s.pendingClaim.responses[seatIdx] = { action, chiOption };

    if (action === "hu") { resolveClaim(room); return { ok: true }; }

    const allResponded = s.pendingClaim.eligible.every((e) => Object.prototype.hasOwnProperty.call(s.pendingClaim.responses, e.seatIdx));
    if (allResponded) resolveClaim(room);
    else update(room);
    return { ok: true };
  }

  function resolveClaim(room) {
    const s = room.state;
    const pc = s.pendingClaim;
    if (!pc) return;
    const order = (seatIdx) => (seatIdx - pc.fromSeat - 1 + SEAT_COUNT) % SEAT_COUNT; // proximity priority
    const responded = Object.entries(pc.responses).map(([seatIdx, r]) => ({ seatIdx: Number(seatIdx), ...r }));

    const huClaim = responded.filter((r) => r.action === "hu").sort((a, b) => order(a.seatIdx) - order(b.seatIdx))[0];
    if (huClaim) { s.pendingClaim = null; applyWin(room, huClaim.seatIdx, "discard", pc.fromSeat); return; }

    const kongClaim = responded.filter((r) => r.action === "kong").sort((a, b) => order(a.seatIdx) - order(b.seatIdx))[0];
    const pongClaim = responded.filter((r) => r.action === "pong").sort((a, b) => order(a.seatIdx) - order(b.seatIdx))[0];
    const chiClaim = responded.filter((r) => r.action === "chi").sort((a, b) => order(a.seatIdx) - order(b.seatIdx))[0];
    const winning = kongClaim || pongClaim || chiClaim;

    if (!winning) {
      s.pendingClaim = null;
      update(room);
      advanceTurn(room, pc.fromSeat);
      return;
    }

    const claimant = s.players[winning.seatIdx];
    s.discardPile.pop(); // the discarded tile is consumed by the claim
    if (winning.action === "kong") {
      claimant.hand = removeN(claimant.hand, pc.tile, 3);
      claimant.revealed.push({ type: "kong", concealed: false, suit: pc.tile.suit, value: pc.tile.value, claimedFrom: pc.fromSeat });
      log(room, "mahjong.log.claimedKong", { name: claimant.name });
      applyKongPayment(room, winning.seatIdx, false, pc.fromSeat);
      s.pendingClaim = null;
      s.turnIdx = winning.seatIdx;
      drawForSeat(room, winning.seatIdx);
      return;
    }
    if (winning.action === "pong") {
      claimant.hand = removeN(claimant.hand, pc.tile, 2);
      claimant.revealed.push({ type: "pong", concealed: false, suit: pc.tile.suit, value: pc.tile.value, claimedFrom: pc.fromSeat });
      log(room, "mahjong.log.claimedPong", { name: claimant.name });
    } else {
      const fallbackOpt = pc.eligible.find((e) => e.seatIdx === winning.seatIdx).canChi[0];
      const use = winning.chiOption || fallbackOpt;
      claimant.hand = removeOne(claimant.hand, pc.tile.suit, use[0]);
      claimant.hand = removeOne(claimant.hand, pc.tile.suit, use[1]);
      claimant.revealed.push({ type: "chi", concealed: false, suit: pc.tile.suit, values: [use[0], use[1], pc.tile.value].sort((x, y) => x - y), claimedFrom: pc.fromSeat });
      log(room, "mahjong.log.claimedChi", { name: claimant.name });
    }
    s.pendingClaim = null;
    s.turnIdx = winning.seatIdx;
    s.awaitingDiscard = winning.seatIdx;
    update(room);
    maybeAIDiscard(room, winning.seatIdx);
  }

  function removeN(hand, tile, n) {
    const out = [...hand];
    let removed = 0;
    for (let i = out.length - 1; i >= 0 && removed < n; i--) {
      if (out[i].suit === tile.suit && out[i].value === tile.value) { out.splice(i, 1); removed++; }
    }
    return out;
  }
  function removeOne(hand, suit, value) {
    const out = [...hand];
    const idx = out.findIndex((t) => t.suit === suit && t.value === value);
    if (idx !== -1) out.splice(idx, 1);
    return out;
  }

  function advanceTurn(room, fromSeat) {
    const next = nextActiveSeat(room, fromSeat);
    room.state.turnIdx = next;
    drawForSeat(room, next);
  }

  const BASE_HU = 1;

  // Blood-battle-to-the-end: a Hu doesn't stop the hand for everyone — the
  // winner settles up and steps out, and the remaining active players keep
  // playing until only one is left (nobody to trade tiles with) or the
  // wall runs dry. Self-draw (zimo) is paid by every other active player;
  // winning off a discard (dianpao) is paid entirely by the discarder, at
  // 3x, so either way the winner's total take is comparable.
  function applyWin(room, seatIdx, winType, fromSeat) {
    const s = room.state;
    const player = s.players[seatIdx];
    const { mult, notes } = MR.estimateMultiplier(player.hand, player.revealed, player.missingSuit);
    const payout = BASE_HU * mult;
    let received = 0;
    if (winType === "zimo") {
      for (let i = 0; i < SEAT_COUNT; i++) {
        if (i === seatIdx || !s.activeSeats[i]) continue;
        s.chips[i] -= payout;
        received += payout;
      }
    } else {
      received = payout * 3;
      s.chips[fromSeat] -= received;
    }
    s.chips[seatIdx] += received;
    s.activeSeats[seatIdx] = false;
    s.winners.push({ seatIdx, name: player.name, winType, fromSeat, mult, notes, payout: received });
    log(room, "mahjong.log.hu", { name: player.name, winType, mult, payout: received });

    const stillActive = s.activeSeats.filter(Boolean).length;
    if (stillActive <= 1) {
      s.phase = "roundEnd";
      update(room);
      return;
    }
    // The winner is done for this hand — move on to whoever plays next.
    advanceTurn(room, winType === "zimo" ? seatIdx : fromSeat);
  }

  function endRoundDraw(room) {
    const s = room.state;
    s.phase = "roundEnd";
    log(room, "mahjong.log.wallEmpty");
    update(room);
  }

  function requestNewHand(room) {
    const s = room.state;
    if (!s || s.phase !== "roundEnd") return;
    room.state.dealerIdx = (s.dealerIdx + 1) % SEAT_COUNT;
    init(room);
  }

  const api = {
    viewFor, deal: init, submitMissingSuit, submitDiscard, submitSelfKong, submitSelfHu,
    submitClaimResponse, requestNewHand,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MahjongEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
